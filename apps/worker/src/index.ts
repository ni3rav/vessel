import { killActiveProcesses } from "./ffmpeg";
import { logger } from "./logger";
import { processJob } from "./job";
import { sendWorkerCallback } from "./callback";
import { getMissingRequiredRuntimeEnv, config } from "./config";
import type { JobPayload } from "./types";
import { ServiceBusClient } from "@azure/service-bus";

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn("Shutdown signal received", { signal });
  killActiveProcesses();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export async function main(): Promise<void> {
  logger.info("Worker starting");

  const missingEnv = getMissingRequiredRuntimeEnv();
  if (missingEnv.length > 0) {
    logger.error("Missing required worker environment variables", { missingEnv });
    process.exit(1);
    return;
  }

  const client = new ServiceBusClient(config.azureServiceBusConnectionString);
  const receiver = client.createReceiver(config.azureServiceBusQueueName, {
    receiveMode: "peekLock",
  });

  try {
    const messages = await receiver.receiveMessages(1, {
      maxWaitTimeInMs: 5000,
    });

    if (messages.length === 0) {
      logger.info("Queue is empty, exiting gracefully");
      process.exit(0);
      return;
    }

    const message = messages[0];
    let payload: JobPayload;
    try {
      payload = typeof message.body === "string" ? JSON.parse(message.body) : message.body;
    } catch {
      logger.error("Invalid JSON in job payload");
      await receiver.deadLetterMessage(message, {
        deadLetterReason: "InvalidJSON",
        deadLetterErrorDescription: "Payload is not valid JSON",
      });
      process.exit(1);
      return;
    }

    if (!payload.id || !payload.key || !payload.filename || !payload.userid || !payload.jobSecret) {
      logger.error("Job payload missing required fields");
      await receiver.deadLetterMessage(message, {
        deadLetterReason: "MissingFields",
        deadLetterErrorDescription: "Payload missing required fields",
      });
      process.exit(1);
      return;
    }

    if (shuttingDown) {
      logger.warn("Shutdown already in progress, skipping job");
      await receiver.abandonMessage(message);
      process.exit(0);
      return;
    }

    const result = await processJob(payload);
    const callbackStatus = await Promise.resolve(sendWorkerCallback(payload, result)).then(
      () => true,
      (error) => {
        logger.error("Worker callback failed", { id: payload.id, error: String(error) });
        return false;
      }
    );

    process.stdout.write(JSON.stringify(result) + "\n");

    if (result.success && callbackStatus) {
      await receiver.completeMessage(message);
      process.exit(0);
    } else {
      await receiver.abandonMessage(message);
      process.exit(1);
    }
  } catch (err) {
    logger.error("Unhandled error in worker", { error: String(err) });
    process.exit(1);
  } finally {
    await receiver.close();
    await client.close();
  }
}

const isMain = typeof require !== "undefined" && require.main === module;
if (isMain) {
  main().catch((err) => {
    logger.error("Unhandled error in worker", { error: String(err) });
    process.exit(1);
  });
}
