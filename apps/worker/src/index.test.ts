import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.hoisted(() => {
  process.env["R2_ACCOUNT_ID"] = "test";
  process.env["R2_ACCESS_KEY_ID"] = "test";
  process.env["R2_SECRET_ACCESS_KEY"] = "test";
  process.env["R2_BUCKET"] = "test";
  process.env["R2_PUBLIC_BASE_URL"] = "test";
  process.env["WORKER_CALLBACK_URL"] = "test";
  process.env["WORKER_SECRET"] = "test";
  process.env["AZURE_SERVICE_BUS_CONNECTION_STRING"] = "test-cs";
  process.env["AZURE_SERVICE_BUS_QUEUE_NAME"] = "test-queue";
});

const mockReceiveMessages = vi.fn();
const mockCompleteMessage = vi.fn();
const mockAbandonMessage = vi.fn();
const mockDeadLetterMessage = vi.fn();
const mockReceiverClose = vi.fn();
const mockClientClose = vi.fn();

vi.mock("@azure/service-bus", () => {
  class MockServiceBusClient {
    createReceiver = vi.fn().mockReturnValue({
      receiveMessages: mockReceiveMessages,
      completeMessage: mockCompleteMessage,
      abandonMessage: mockAbandonMessage,
      deadLetterMessage: mockDeadLetterMessage,
      close: mockReceiverClose,
    });
    close = mockClientClose;
  }
  return {
    ServiceBusClient: MockServiceBusClient,
  };
});

const mockProcessJob = vi.fn();
vi.mock("./job", () => {
  return {
    processJob: (...args: any[]) => mockProcessJob(...args),
  };
});

const mockSendWorkerCallback = vi.fn();
vi.mock("./callback", () => {
  return {
    sendWorkerCallback: (...args: any[]) => mockSendWorkerCallback(...args),
  };
});

import { main } from "./index";

describe("Worker Entry Point - Empty Queue Exit", () => {
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      return undefined as never;
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it("exits gracefully with status 0 when queue is empty", async () => {
    mockReceiveMessages.mockResolvedValue([]);

    await main();

    expect(mockReceiveMessages).toHaveBeenCalledWith(1, {
      maxWaitTimeInMs: 5000,
    });
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockProcessJob).not.toHaveBeenCalled();
    expect(mockSendWorkerCallback).not.toHaveBeenCalled();
    expect(mockReceiverClose).toHaveBeenCalled();
    expect(mockClientClose).toHaveBeenCalled();
  });
});

describe("Worker Entry Point - Success Path", () => {
  let exitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      return undefined as never;
    });
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it("processes message successfully and completes it", async () => {
    const payload = {
      id: "job-123",
      key: "uploads/user-1/job-123/track.mp3",
      filename: "track.mp3",
      userid: "user-1",
      jobSecret: "secret-xyz",
    };
    const mockMessage = { body: payload };
    mockReceiveMessages.mockResolvedValue([mockMessage]);
    mockProcessJob.mockResolvedValue({ success: true });
    mockSendWorkerCallback.mockResolvedValue(undefined);

    await main();

    expect(mockReceiveMessages).toHaveBeenCalledWith(1, {
      maxWaitTimeInMs: 5000,
    });
    expect(mockProcessJob).toHaveBeenCalledWith(payload);
    expect(mockSendWorkerCallback).toHaveBeenCalledWith(payload, { success: true });
    expect(mockCompleteMessage).toHaveBeenCalledWith(mockMessage);
    expect(mockAbandonMessage).not.toHaveBeenCalled();
    expect(mockDeadLetterMessage).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockReceiverClose).toHaveBeenCalled();
    expect(mockClientClose).toHaveBeenCalled();
  });

  it("handles permanent failures by dead-lettering and sending callback with exit 0", async () => {
    const payload = {
      id: "job-123",
      key: "uploads/user-1/job-123/track.mp3",
      filename: "track.mp3",
      userid: "user-1",
      jobSecret: "secret-xyz",
    };
    const mockMessage = { body: payload };
    mockReceiveMessages.mockResolvedValue([mockMessage]);
    mockProcessJob.mockResolvedValue({ success: false, isPermanent: true, error: "Unsupported file format" });
    mockSendWorkerCallback.mockResolvedValue(undefined);

    await main();

    expect(mockProcessJob).toHaveBeenCalledWith(payload);
    expect(mockSendWorkerCallback).toHaveBeenCalledWith(payload, {
      success: false,
      isPermanent: true,
      error: "Unsupported file format",
    });
    expect(mockDeadLetterMessage).toHaveBeenCalledWith(mockMessage, {
      deadLetterReason: "ValidationError",
      deadLetterErrorDescription: "Unsupported file format",
    });
    expect(mockCompleteMessage).not.toHaveBeenCalled();
    expect(mockAbandonMessage).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("handles transient failures by abandoning and skipping callback with exit 1", async () => {
    const payload = {
      id: "job-123",
      key: "uploads/user-1/job-123/track.mp3",
      filename: "track.mp3",
      userid: "user-1",
      jobSecret: "secret-xyz",
    };
    const mockMessage = { body: payload };
    mockReceiveMessages.mockResolvedValue([mockMessage]);
    mockProcessJob.mockResolvedValue({ success: false, isPermanent: false, error: "Download failed" });

    await main();

    expect(mockProcessJob).toHaveBeenCalledWith(payload);
    expect(mockSendWorkerCallback).not.toHaveBeenCalled();
    expect(mockAbandonMessage).toHaveBeenCalledWith(mockMessage);
    expect(mockCompleteMessage).not.toHaveBeenCalled();
    expect(mockDeadLetterMessage).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
