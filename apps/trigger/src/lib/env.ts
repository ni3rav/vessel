type RequiredEnvKey =
  | "TRIGGER_TOKEN"
  | "AZURE_SUBSCRIPTION_ID"
  | "AZURE_RESOURCE_GROUP"
  | "AZURE_CONTAINER_GROUP"
  | "TRIGGER_BACKEND_CALLBACK_URL";

export interface TriggerEnv {
  triggerToken: string;
  subscriptionId: string;
  resourceGroup: string;
  containerGroup: string;
  containerName?: string;
  payloadEnvVarName: string;
  workerEnvOverrides: Record<string, string>;
  backendProcessingStartedUrl: string;
  registryServer?: string;
  registryUsername?: string;
  registryPassword?: string;
}

function getRequiredEnv(name: RequiredEnvKey): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const WORKER_ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "SOURCE_BASE_URL",
  "WORKER_CALLBACK_URL",
  "WORKER_SECRET",
  "OUTPUT_DIR",
  "TEMP_DIR",
  "FFMPEG_PATH",
  "FFPROBE_PATH",
  "HLS_SEGMENT_DURATION",
  "LOG_LEVEL",
] as const;

function getWorkerEnvOverrides(): Record<string, string> {
  const overrides: Record<string, string> = {};
  for (const key of WORKER_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      overrides[key] = value;
    }
  }
  return overrides;
}

export function getEnv(): TriggerEnv {
  return {
    triggerToken: getRequiredEnv("TRIGGER_TOKEN"),
    subscriptionId: getRequiredEnv("AZURE_SUBSCRIPTION_ID"),
    resourceGroup: getRequiredEnv("AZURE_RESOURCE_GROUP"),
    containerGroup: getRequiredEnv("AZURE_CONTAINER_GROUP"),
    containerName: process.env["AZURE_CONTAINER_NAME"],
    payloadEnvVarName: process.env["PAYLOAD_ENV_VAR_NAME"] ?? "JOB_PAYLOAD",
    workerEnvOverrides: getWorkerEnvOverrides(),
    backendProcessingStartedUrl: getRequiredEnv("TRIGGER_BACKEND_CALLBACK_URL"),
    registryServer: process.env["AZURE_IMAGE_REGISTRY_SERVER"],
    registryUsername: process.env["AZURE_IMAGE_REGISTRY_USERNAME"],
    registryPassword: process.env["AZURE_IMAGE_REGISTRY_PASSWORD"],
  };
}
