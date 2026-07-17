import { ServiceBusClient } from "@azure/service-bus";
import { env } from "./env";

export interface TranscodeJobMessage {
  id: string;
  key: string;
  filename: string;
  userid: string;
  jobSecret: string;
}

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
