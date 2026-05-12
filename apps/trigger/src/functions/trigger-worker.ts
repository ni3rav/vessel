import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ContainerInstanceManagementClient } from "@azure/arm-containerinstance";
import { DefaultAzureCredential } from "@azure/identity";
import { getEnv } from "../lib/env";

const TOKEN_HEADER = "x-trigger-token";
const JOB_SECRET_HEADER = "x-job-secret";
interface WorkerJobPayload {
  id: string;
  key: string;
  filename: string;
  userid: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseWorkerJobPayload(payload: unknown): WorkerJobPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const { id, key, filename, userid } = record;

  if (
    !isNonEmptyString(id) ||
    !isNonEmptyString(key) ||
    !isNonEmptyString(filename) ||
    !isNonEmptyString(userid)
  ) {
    return null;
  }

  return {
    id: id.trim(),
    key: key.trim(),
    filename: filename.trim(),
    userid: userid.trim(),
  };
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      "content-type": "application/json",
    },
  };
}

function isActiveContainerGroupState(state: string | undefined): boolean {
  if (!state) return false;
  const normalized = state.toLowerCase();
  return normalized === "running" || normalized === "pending";
}

function withUpdatedPayloadEnv(
  existing: Array<{ name?: string; value?: string; secureValue?: string }> | undefined,
  name: string,
  value: string,
): Array<{ name: string; value?: string; secureValue?: string }> {
  const vars = [...(existing ?? [])];
  const idx = vars.findIndex((item) => item.name === name);

  if (idx >= 0) {
    vars[idx] = { name, value };
    return vars as Array<{ name: string; value?: string; secureValue?: string }>;
  }

  vars.push({ name, value });
  return vars as Array<{ name: string; value?: string; secureValue?: string }>;
}

function pickContainerName(
  requestedName: string | undefined,
  containers: Array<{ name?: string }> | undefined,
): string | undefined {
  if (!containers || containers.length === 0) return undefined;
  if (!requestedName) return containers[0]?.name;
  return containers.find((container) => container.name === requestedName)?.name;
}

function shouldIncludeDiagnostics(diagnostics: any): boolean {
  const logAnalytics = diagnostics?.logAnalytics;
  if (!logAnalytics) return false;

  // Some GET responses omit/mask workspaceKey; sending partial diagnostics
  // back to createOrUpdate fails payload serialization.
  const hasWorkspaceId = isNonEmptyString(logAnalytics.workspaceId);
  const hasWorkspaceKey = isNonEmptyString(logAnalytics.workspaceKey);
  return hasWorkspaceId && hasWorkspaceKey;
}

function resolveImageRegistryCredentials(
  existing: Array<{ server?: string; username?: string; password?: string; identity?: string }>
    | undefined,
  env: ReturnType<typeof getEnv>,
): {
  credentials?: Array<{ server?: string; username?: string; password?: string; identity?: string }>;
  error?: string;
} {
  if (!existing || existing.length === 0) {
    return {};
  }

  const resolved = existing.map((cred) => {
    const hasPassword = isNonEmptyString(cred.password);
    if (hasPassword) return cred;

    const serverMatches =
      !env.registryServer ||
      !cred.server ||
      env.registryServer.toLowerCase() === cred.server.toLowerCase();
    const usernameMatches =
      !env.registryUsername || !cred.username || env.registryUsername === cred.username;

    if (env.registryPassword && serverMatches && usernameMatches) {
      return {
        ...cred,
        server: cred.server ?? env.registryServer,
        username: cred.username ?? env.registryUsername,
        password: env.registryPassword,
      };
    }

    return cred;
  });

  const stillMissingPassword = resolved.some(
    (cred) => !cred.identity && !isNonEmptyString(cred.password),
  );
  if (stillMissingPassword) {
    return {
      error:
        "Container group has imageRegistryCredentials with hidden/missing password from ARM GET. " +
        "Set AZURE_IMAGE_REGISTRY_PASSWORD (and optionally AZURE_IMAGE_REGISTRY_SERVER / AZURE_IMAGE_REGISTRY_USERNAME) in local.settings.json.",
    };
  }

  return { credentials: resolved };
}

async function notifyBackendProcessingStarted(input: {
  callbackUrl: string;
  triggerToken: string;
  jobSecret: string;
  id: string;
  containerGroup: string;
  containerName: string;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(input.callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [TOKEN_HEADER]: input.triggerToken,
        [JOB_SECRET_HEADER]: input.jobSecret,
      },
      body: JSON.stringify({
        id: input.id,
        jobId: input.id,
        status: "processing",
        containerGroup: input.containerGroup,
        containerName: input.containerName,
        startedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const responseText = await res.text();
      throw new Error(
        `Backend callback failed with ${res.status}: ${responseText || "empty response body"}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function triggerWorker(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let requestId: string | null = null;
  try {
    const env = getEnv();
    const token = request.headers.get(TOKEN_HEADER);
    if (!token || token !== env.triggerToken) {
      return json(401, { error: "Unauthorized" });
    }
    const jobSecret = request.headers.get(JOB_SECRET_HEADER);
    if (!isNonEmptyString(jobSecret)) {
      return json(400, {
        error: `Missing required header: ${JOB_SECRET_HEADER}`,
      });
    }
    const normalizedJobSecret = jobSecret.trim();

    const payload = parseWorkerJobPayload(await request.json());
    if (!payload) {
      return json(400, {
        error: "Invalid payload.",
        expected: {
          id: "string",
          key: "string",
          filename: "string",
          userid: "string",
        },
      });
    }
    requestId = payload.id;
    const workerPayload = {
      ...payload,
      jobSecret: normalizedJobSecret,
    };
    const payloadString = JSON.stringify(workerPayload);

    const credential = new DefaultAzureCredential();
    const client = new ContainerInstanceManagementClient(credential, env.subscriptionId);

    const group = await client.containerGroups.get(env.resourceGroup, env.containerGroup);
    const state = group.instanceView?.state;
    if (isActiveContainerGroupState(state)) {
      return json(409, {
        id: payload.id,
        status: "failed",
        error: "Duplicate trigger rejected; container group is already active.",
        state,
      });
    }

    const selectedContainerName = pickContainerName(env.containerName, group.containers);
    if (!selectedContainerName) {
      return json(500, {
        id: payload.id,
        status: "failed",
        error: "No container found in target container group.",
      });
    }

    if (env.containerName && selectedContainerName !== env.containerName) {
      return json(500, {
        id: payload.id,
        status: "failed",
        error: `Configured AZURE_CONTAINER_NAME '${env.containerName}' was not found.`,
      });
    }

    const updatedContainers = (group.containers ?? []).map((container) => {
      const plain = container as any;
      const updatedEnv = withUpdatedPayloadEnv(
        plain.environmentVariables,
        env.payloadEnvVarName,
        payloadString,
      );

      return {
        ...plain,
        environmentVariables:
          plain.name === selectedContainerName ? updatedEnv : plain.environmentVariables,
      };
    });

    const imageRegistry = resolveImageRegistryCredentials(group.imageRegistryCredentials, env);
    if (imageRegistry.error) {
      return json(500, { id: payload.id, status: "failed", error: imageRegistry.error });
    }

    const groupPayload: any = {
      location: group.location,
      osType: group.osType,
      restartPolicy: group.restartPolicy,
      containers: updatedContainers,
    };
    if (imageRegistry.credentials) {
      groupPayload.imageRegistryCredentials = imageRegistry.credentials;
    }
    if (group.ipAddress) {
      groupPayload.ipAddress = group.ipAddress;
    }
    if (group.subnetIds) {
      groupPayload.subnetIds = group.subnetIds;
    }
    if (group.volumes) {
      groupPayload.volumes = group.volumes;
    }
    if (group.identity) {
      groupPayload.identity = group.identity;
    }
    if (group.sku) {
      groupPayload.sku = group.sku;
    }
    if ((group as any).dnsConfig) {
      groupPayload.dnsConfig = (group as any).dnsConfig;
    }
    if (group.zones) {
      groupPayload.zones = group.zones;
    }
    if ((group as any).initContainers) {
      groupPayload.initContainers = (group as any).initContainers;
    }
    if ((group as any).encryptionProperties) {
      groupPayload.encryptionProperties = (group as any).encryptionProperties;
    }
    if ((group as any).extensions) {
      groupPayload.extensions = (group as any).extensions;
    }
    if ((group as any).priority) {
      groupPayload.priority = (group as any).priority;
    }
    if (shouldIncludeDiagnostics(group.diagnostics)) {
      groupPayload.diagnostics = group.diagnostics;
    }

    await client.containerGroups.beginCreateOrUpdateAndWait(
      env.resourceGroup,
      env.containerGroup,
      groupPayload,
    );
    await client.containerGroups.beginStartAndWait(env.resourceGroup, env.containerGroup);

    await notifyBackendProcessingStarted({
      callbackUrl: env.backendProcessingStartedUrl,
      triggerToken: env.triggerToken,
      jobSecret: normalizedJobSecret,
      id: payload.id,
      containerGroup: env.containerGroup,
      containerName: selectedContainerName,
    });

    context.log("Worker trigger accepted", {
      containerGroup: env.containerGroup,
      containerName: selectedContainerName,
      payloadEnvVarName: env.payloadEnvVarName,
      backendCallbackUrl: env.backendProcessingStartedUrl,
    });

    return json(202, {
      accepted: true,
      id: payload.id,
      jobId: payload.id,
      status: "processing",
      containerGroup: env.containerGroup,
      containerName: selectedContainerName,
      payloadEnvVarName: env.payloadEnvVarName,
      message: "Container start requested.",
    });
  } catch (error) {
    context.error("Failed to trigger worker", error);
    return json(500, {
      ...(requestId ? { id: requestId, status: "failed" } : {}),
      error: "Failed to trigger worker container.",
      detail: String(error),
    });
  }
}

app.http("triggerWorker", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "trigger-worker",
  handler: triggerWorker,
});
