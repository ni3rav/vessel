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
