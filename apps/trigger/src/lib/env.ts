type RequiredEnvKey =
  | "TRIGGER_TOKEN"
  | "AZURE_SUBSCRIPTION_ID"
  | "AZURE_RESOURCE_GROUP"
  | "AZURE_CONTAINER_GROUP";

export interface TriggerEnv {
  triggerToken: string;
  subscriptionId: string;
  resourceGroup: string;
  containerGroup: string;
  containerName?: string;
  payloadEnvVarName: string;
}

function getRequiredEnv(name: RequiredEnvKey): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getEnv(): TriggerEnv {
  return {
    triggerToken: getRequiredEnv("TRIGGER_TOKEN"),
    subscriptionId: getRequiredEnv("AZURE_SUBSCRIPTION_ID"),
    resourceGroup: getRequiredEnv("AZURE_RESOURCE_GROUP"),
    containerGroup: getRequiredEnv("AZURE_CONTAINER_GROUP"),
    containerName: process.env["AZURE_CONTAINER_NAME"],
    payloadEnvVarName: process.env["PAYLOAD_ENV_VAR_NAME"] ?? "JOB_PAYLOAD",
  };
}
