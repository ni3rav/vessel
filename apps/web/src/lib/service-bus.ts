import { ServiceBusClient } from "@azure/service-bus";
import { env } from "./env";

export interface TranscodeJobMessage {
  id: string;
  key: string;
  filename: string;
  userid: string;
  jobSecret: string;
}

/**
 * Publishes a transcode job message to the Azure Service Bus queue.
 * The caller is responsible for treating publish failures as a signal
 * to roll back the in-progress upload record.
 *
 * An optional `createClient` factory is accepted to allow dependency injection
 * in tests without fighting the `new` constructor boundary.
 */
export async function publishTranscodeJob(
  message: TranscodeJobMessage,
  createClient: (connectionString: string) => ServiceBusClient = (cs) => new ServiceBusClient(cs),
): Promise<void> {
  const client = createClient(env.AZURE_SERVICE_BUS_CONNECTION_STRING);
  const sender = client.createSender(env.AZURE_SERVICE_BUS_QUEUE_NAME);

  try {
    await sender.sendMessages({
      body: message,
      contentType: "application/json",
      messageId: message.id,
    });
  } finally {
    await sender.close();
    await client.close();
  }
}
