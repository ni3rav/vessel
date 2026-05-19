import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { getEnv } from "../lib/env";

const TOKEN_HEADER = "x-trigger-token";
const JOB_SECRET_HEADER = "x-job-secret";
const ARM_SCOPE = "https://management.azure.com/.default";
const ARM_BASE_URL = "https://management.azure.com";
const CONTAINER_APPS_API_VERSION = "2024-03-01";

interface WorkerJobPayload {
  id: string;
  key: string;
  filename: string;
  userid: string;
}

interface ArmEnvironmentVar {
  name?: string;
  value?: string;
  secretRef?: string;
}

interface ArmJobTemplateContainer {
  name?: string;
  env?: ArmEnvironmentVar[];
  [key: string]: unknown;
}

interface ArmJobTemplate {
  containers?: ArmJobTemplateContainer[];
  initContainers?: ArmJobTemplateContainer[];
  [key: string]: unknown;
}

interface ArmJobResource {
  properties?: {
    template?: ArmJobTemplate;
  };
}

interface ArmJobExecution {
  name?: string;
  properties?: {
    status?: string;
    startTime?: string;
  };
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

function isTerminalExecutionStatus(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return (
    normalized === "succeeded" ||
    normalized === "failed" ||
    normalized === "canceled" ||
    normalized === "cancelled"
  );
}

function withUpsertedEnvVars(
  existing: ArmEnvironmentVar[] | undefined,
  overrides: Record<string, string>,
): ArmEnvironmentVar[] {
  const vars = [...(existing ?? [])];
  const byName = new Map<string, number>();
  vars.forEach((item, index) => {
    if (item.name) byName.set(item.name, index);
  });

  for (const [name, value] of Object.entries(overrides)) {
    const idx = byName.get(name);
    if (idx !== undefined) {
      vars[idx] = { name, value };
    } else {
      vars.push({ name, value });
    }
  }
  return vars;
}

function sanitizeExecutionContainer(container: ArmJobTemplateContainer): ArmJobTemplateContainer {
  return {
    name: container.name as string | undefined,
    image: container.image as string | undefined,
    command: Array.isArray(container.command) ? (container.command as string[]) : undefined,
    args: Array.isArray(container.args) ? (container.args as string[]) : undefined,
    env: Array.isArray(container.env) ? (container.env as ArmEnvironmentVar[]) : undefined,
    resources:
      container.resources && typeof container.resources === "object"
        ? (container.resources as Record<string, unknown>)
        : undefined,
  };
}

function sanitizeExecutionTemplate(template: ArmJobTemplate): ArmJobTemplate {
  return {
    containers: (template.containers ?? []).map(sanitizeExecutionContainer),
    initContainers: (template.initContainers ?? []).map(sanitizeExecutionContainer),
  };
}

function pickContainerName(
  requestedName: string | undefined,
  containers: ArmJobTemplateContainer[] | undefined,
): string | undefined {
  if (!containers || containers.length === 0) return undefined;
  if (!requestedName) return containers[0]?.name;
  return containers.find((container) => container.name === requestedName)?.name;
}

function buildJobResourcePath(env: ReturnType<typeof getEnv>): string {
  return `/subscriptions/${env.subscriptionId}/resourceGroups/${env.resourceGroup}/providers/Microsoft.App/jobs/${env.containerAppsJobName}`;
}

async function getArmAccessToken(credential: DefaultAzureCredential): Promise<string> {
  const tokenResponse = await credential.getToken(ARM_SCOPE);
  if (!tokenResponse?.token) {
    throw new Error("Failed to obtain Azure ARM access token");
  }
  return tokenResponse.token;
}

async function armRequest<T>(input: {
  method: "GET" | "POST";
  accessToken: string;
  url: string;
  body?: unknown;
}): Promise<T> {
  const res = await fetch(input.url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.accessToken}`,
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ARM ${input.method} ${input.url} failed with ${res.status}: ${text}`);
  }

  if (res.status === 204) {
    return {} as T;
  }

  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function fetchJobTemplate(input: {
  accessToken: string;
  env: ReturnType<typeof getEnv>;
}): Promise<{ template: ArmJobTemplate; containerName: string }> {
  const resourcePath = buildJobResourcePath(input.env);
  const url = `${ARM_BASE_URL}${resourcePath}?api-version=${CONTAINER_APPS_API_VERSION}`;
  const job = await armRequest<ArmJobResource>({
    method: "GET",
    accessToken: input.accessToken,
    url,
  });

  const template = job.properties?.template;
  if (!template?.containers || template.containers.length === 0) {
    throw new Error("Container Apps Job template has no containers.");
  }

  const selectedContainerName = pickContainerName(input.env.jobContainerName, template.containers);
  if (!selectedContainerName) {
    throw new Error(
      input.env.jobContainerName
        ? `Configured AZURE_CONTAINERAPPS_JOB_CONTAINER_NAME '${input.env.jobContainerName}' was not found in the job template.`
        : "No container found in Container Apps Job template.",
    );
  }

  return { template, containerName: selectedContainerName };
}

async function listExecutions(input: {
  accessToken: string;
  env: ReturnType<typeof getEnv>;
}): Promise<ArmJobExecution[]> {
  const resourcePath = buildJobResourcePath(input.env);
  const url = `${ARM_BASE_URL}${resourcePath}/executions?api-version=${CONTAINER_APPS_API_VERSION}`;
  const response = await armRequest<{ value?: ArmJobExecution[] }>({
    method: "GET",
    accessToken: input.accessToken,
    url,
  });
  return Array.isArray(response.value) ? response.value : [];
}

function getLatestExecutionName(executions: ArmJobExecution[]): string | undefined {
  const sorted = [...executions].sort((a, b) => {
    const aTime = new Date(a.properties?.startTime ?? 0).getTime();
    const bTime = new Date(b.properties?.startTime ?? 0).getTime();
    return bTime - aTime;
  });
  return sorted[0]?.name;
}

async function startJobExecution(input: {
  accessToken: string;
  env: ReturnType<typeof getEnv>;
  template: ArmJobTemplate;
}): Promise<string | undefined> {
  const resourcePath = buildJobResourcePath(input.env);
  const url = `${ARM_BASE_URL}${resourcePath}/start?api-version=${CONTAINER_APPS_API_VERSION}`;
  const response = await armRequest<{ name?: string }>({
    method: "POST",
    accessToken: input.accessToken,
    url,
    body: input.template,
  });

  return response.name;
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
        error: "Invalid payload schema.",
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
    const accessToken = await getArmAccessToken(credential);
    const executions = await listExecutions({ accessToken, env });
    const activeExecutions = executions.filter(
      (execution) => !isTerminalExecutionStatus(execution.properties?.status),
    );
    if (activeExecutions.length >= env.maxActiveExecutions) {
      return json(409, {
        id: payload.id,
        status: "failed",
        error: `Rejected trigger; active execution limit (${env.maxActiveExecutions}) reached.`,
        activeExecutions: activeExecutions.length,
      });
    }

    const { template, containerName } = await fetchJobTemplate({ accessToken, env });
    const updatedTemplate: ArmJobTemplate = {
      ...template,
      containers: (template.containers ?? []).map((container) => {
        const updatedEnv = withUpsertedEnvVars(container.env, {
          [env.payloadEnvVarName]: payloadString,
        });
        return {
          ...container,
          env: container.name === containerName ? updatedEnv : container.env,
        };
      }),
    };
    const executionTemplate = sanitizeExecutionTemplate(updatedTemplate);

    const executionName =
      (await startJobExecution({
        accessToken,
        env,
        template: executionTemplate,
      })) ?? getLatestExecutionName(await listExecutions({ accessToken, env }));

    await notifyBackendProcessingStarted({
      callbackUrl: env.backendProcessingStartedUrl,
      triggerToken: env.triggerToken,
      jobSecret: normalizedJobSecret,
      id: payload.id,
      containerGroup: env.containerAppsJobName,
      containerName,
    });

    context.log("Worker trigger accepted", {
      jobName: env.containerAppsJobName,
      executionName,
      containerName,
      payloadEnvVarName: env.payloadEnvVarName,
      maxActiveExecutions: env.maxActiveExecutions,
      backendCallbackUrl: env.backendProcessingStartedUrl,
    });

    return json(202, {
      accepted: true,
      id: payload.id,
      jobId: payload.id,
      status: "processing",
      containerGroup: env.containerAppsJobName,
      containerName,
      executionName,
      payloadEnvVarName: env.payloadEnvVarName,
      fileKey: payload.key,
      message: "Container Apps Job execution start requested.",
    });
  } catch (error) {
    context.error("Failed to trigger worker", error);
    return json(500, {
      ...(requestId ? { id: requestId, status: "failed" } : {}),
      error: "Failed to trigger worker job.",
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
