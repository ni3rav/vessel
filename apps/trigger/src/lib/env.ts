type RequiredEnvKey =
  | "TRIGGER_TOKEN"
  | "AZURE_SUBSCRIPTION_ID"
  | "AZURE_RESOURCE_GROUP"
  | "AZURE_CONTAINERAPPS_JOB_NAME"
  | "TRIGGER_BACKEND_CALLBACK_URL";

export interface TriggerEnv {
  triggerToken: string;
  subscriptionId: string;
  resourceGroup: string;
  containerAppsJobName: string;
  jobContainerName?: string;
  payloadEnvVarName: string;
  maxActiveExecutions: number;
  backendProcessingStartedUrl: string;
}

function getRequiredEnv(name: RequiredEnvKey): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseMaxActiveExecutions(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "5", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 5;
  }
  return parsed;
}

export function getEnv(): TriggerEnv {
  return {
    triggerToken: getRequiredEnv("TRIGGER_TOKEN"),
    subscriptionId: getRequiredEnv("AZURE_SUBSCRIPTION_ID"),
    resourceGroup: getRequiredEnv("AZURE_RESOURCE_GROUP"),
    containerAppsJobName: getRequiredEnv("AZURE_CONTAINERAPPS_JOB_NAME"),
    jobContainerName: process.env["AZURE_CONTAINERAPPS_JOB_CONTAINER_NAME"],
    payloadEnvVarName: process.env["PAYLOAD_ENV_VAR_NAME"] ?? "JOB_PAYLOAD",
    maxActiveExecutions: parseMaxActiveExecutions(process.env["AZURE_MAX_ACTIVE_EXECUTIONS"]),
    backendProcessingStartedUrl: getRequiredEnv("TRIGGER_BACKEND_CALLBACK_URL"),
  };
}
