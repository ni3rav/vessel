import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ContainerInstanceManagementClient } from "@azure/arm-containerinstance";
import { DefaultAzureCredential } from "@azure/identity";
import { getEnv } from "../lib/env";

const TOKEN_HEADER = "x-trigger-token";

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

export async function triggerWorker(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  try {
    const env = getEnv();
    const token = request.headers.get(TOKEN_HEADER);
    if (!token || token !== env.triggerToken) {
      return json(401, { error: "Unauthorized" });
    }

    // TODO: Replace this with strict backend payload schema validation.
    const payload = await request.json();
    const payloadString = JSON.stringify(payload);

    const credential = new DefaultAzureCredential();
    const client = new ContainerInstanceManagementClient(credential, env.subscriptionId);

    const group = await client.containerGroups.get(env.resourceGroup, env.containerGroup);
    const state = group.instanceView?.state;
    if (isActiveContainerGroupState(state)) {
      return json(409, {
        error: "Duplicate trigger rejected; container group is already active.",
        state,
      });
    }

    const selectedContainerName = pickContainerName(env.containerName, group.containers);
    if (!selectedContainerName) {
      return json(500, { error: "No container found in target container group." });
    }

    if (env.containerName && selectedContainerName !== env.containerName) {
      return json(500, {
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

    const groupPayload: any = {
      location: group.location,
      osType: group.osType,
      restartPolicy: group.restartPolicy,
      containers: updatedContainers,
      imageRegistryCredentials: group.imageRegistryCredentials,
      ipAddress: group.ipAddress,
      subnetIds: group.subnetIds,
      diagnostics: group.diagnostics,
      volumes: group.volumes,
      identity: group.identity,
      sku: group.sku,
      dnsConfig: (group as any).dnsConfig,
      zones: group.zones,
      initContainers: (group as any).initContainers,
      encryptionProperties: (group as any).encryptionProperties,
      extensions: (group as any).extensions,
      priority: (group as any).priority,
    };

    await client.containerGroups.beginCreateOrUpdateAndWait(
      env.resourceGroup,
      env.containerGroup,
      groupPayload,
    );
    await client.containerGroups.beginStartAndWait(env.resourceGroup, env.containerGroup);

    context.log("Worker trigger accepted", {
      containerGroup: env.containerGroup,
      containerName: selectedContainerName,
      payloadEnvVarName: env.payloadEnvVarName,
    });

    return json(202, {
      accepted: true,
      containerGroup: env.containerGroup,
      containerName: selectedContainerName,
      payloadEnvVarName: env.payloadEnvVarName,
      message: "Container start requested.",
    });
  } catch (error) {
    context.error("Failed to trigger worker", error);
    return json(500, {
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
