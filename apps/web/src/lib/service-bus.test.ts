import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    AZURE_SERVICE_BUS_CONNECTION_STRING:
      "Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=test=",
    AZURE_SERVICE_BUS_QUEUE_NAME: "transcode-jobs",
  },
}));

import type { ServiceBusClient } from "@azure/service-bus";
import { publishTranscodeJob } from "../lib/service-bus";

const SAMPLE_MESSAGE = {
  id: "upload-123",
  key: "uploads/user-1/upload-123/upload-123.mp3",
  filename: "my-track.mp3",
  userid: "user-1",
  jobSecret: "super-secret-abc",
};

function makeMockClient() {
  const mockSendMessages = vi.fn().mockResolvedValue(undefined);
  const mockSenderClose = vi.fn().mockResolvedValue(undefined);
  const mockClientClose = vi.fn().mockResolvedValue(undefined);

  const mockSender = { sendMessages: mockSendMessages, close: mockSenderClose };
  const mockCreateSender = vi.fn().mockReturnValue(mockSender);

  const client = {
    createSender: mockCreateSender,
    close: mockClientClose,
  } as unknown as ServiceBusClient;

  const createClient = vi.fn().mockReturnValue(client);

  return { createClient, mockCreateSender, mockSendMessages, mockSenderClose, mockClientClose };
}

describe("publishTranscodeJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a ServiceBusClient with the connection string from env", async () => {
    const { createClient } = makeMockClient();

    await publishTranscodeJob(SAMPLE_MESSAGE, createClient);

    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith(
      "Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=test="
    );
  });

  it("creates a sender for the configured queue name", async () => {
    const { createClient, mockCreateSender } = makeMockClient();

    await publishTranscodeJob(SAMPLE_MESSAGE, createClient);

    expect(mockCreateSender).toHaveBeenCalledOnce();
    expect(mockCreateSender).toHaveBeenCalledWith("transcode-jobs");
  });

  it("sends a message with the correct payload body, contentType, and messageId", async () => {
    const { createClient, mockSendMessages } = makeMockClient();

    await publishTranscodeJob(SAMPLE_MESSAGE, createClient);

    expect(mockSendMessages).toHaveBeenCalledOnce();
    expect(mockSendMessages).toHaveBeenCalledWith({
      body: SAMPLE_MESSAGE,
      contentType: "application/json",
      messageId: SAMPLE_MESSAGE.id,
    });
  });

  it("closes the sender and client after a successful send", async () => {
    const { createClient, mockSenderClose, mockClientClose } = makeMockClient();

    await publishTranscodeJob(SAMPLE_MESSAGE, createClient);

    expect(mockSenderClose).toHaveBeenCalledOnce();
    expect(mockClientClose).toHaveBeenCalledOnce();
  });

  it("closes the sender and client even when sendMessages throws", async () => {
    const { createClient, mockSendMessages, mockSenderClose, mockClientClose } = makeMockClient();
    mockSendMessages.mockRejectedValueOnce(new Error("Service Bus unavailable"));

    await expect(publishTranscodeJob(SAMPLE_MESSAGE, createClient)).rejects.toThrow(
      "Service Bus unavailable"
    );

    // Cleanup must still happen even on failure
    expect(mockSenderClose).toHaveBeenCalledOnce();
    expect(mockClientClose).toHaveBeenCalledOnce();
  });

  it("propagates the send error so callers can trigger rollback", async () => {
    const { createClient, mockSendMessages } = makeMockClient();
    mockSendMessages.mockRejectedValueOnce(new Error("Network timeout"));

    await expect(publishTranscodeJob(SAMPLE_MESSAGE, createClient)).rejects.toThrow(
      "Network timeout"
    );
  });
});
