import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    R2_BUCKET: "test-bucket",
    AZURE_SERVICE_BUS_CONNECTION_STRING: "fake-connection-string",
    AZURE_SERVICE_BUS_QUEUE_NAME: "transcode-jobs",
  },
}));

import { handlePublishFailure } from "../lib/upload-failure";
import type { PublishFailureDeps } from "../lib/upload-failure";

function makeDeps(overrides?: Partial<PublishFailureDeps>): PublishFailureDeps {
  return {
    markFailed: (overrides?.markFailed ?? vi.fn().mockResolvedValue(undefined)) as PublishFailureDeps["markFailed"],
    deleteSource: (overrides?.deleteSource ?? vi.fn().mockResolvedValue(undefined)) as PublishFailureDeps["deleteSource"],
  };
}

const SAMPLE = {
  id: "upload-abc",
  userId: "user-1",
  key: "uploads/user-1/upload-abc/upload-abc.mp3",
};

describe("handlePublishFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the upload record as failed in the database", async () => {
    const deps = makeDeps();

    await handlePublishFailure(SAMPLE, deps);

    expect(deps.markFailed).toHaveBeenCalledOnce();
    expect(deps.markFailed).toHaveBeenCalledWith(SAMPLE.id);
  });

  it("deletes the source object from R2", async () => {
    const deps = makeDeps();

    await handlePublishFailure(SAMPLE, deps);

    expect(deps.deleteSource).toHaveBeenCalledOnce();
    expect(deps.deleteSource).toHaveBeenCalledWith(SAMPLE.key);
  });

  it("still attempts R2 delete even when DB mark-failed throws", async () => {
    const deps = makeDeps({
      markFailed: vi.fn().mockRejectedValue(new Error("DB connection error")),
    });

    await expect(handlePublishFailure(SAMPLE, deps)).resolves.toBeUndefined();

    expect(deps.deleteSource).toHaveBeenCalledOnce();
  });

  it("does not throw when R2 delete fails", async () => {
    const deps = makeDeps({
      deleteSource: vi.fn().mockRejectedValue(new Error("R2 service error")),
    });

    await expect(handlePublishFailure(SAMPLE, deps)).resolves.toBeUndefined();
  });

  it("does not throw when both DB and R2 operations fail", async () => {
    const deps = makeDeps({
      markFailed: vi.fn().mockRejectedValue(new Error("DB error")),
      deleteSource: vi.fn().mockRejectedValue(new Error("R2 error")),
    });

    await expect(handlePublishFailure(SAMPLE, deps)).resolves.toBeUndefined();
  });
});
