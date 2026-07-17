export interface PublishFailureDeps {
  markFailed: (uploadId: string) => Promise<void>;
  deleteSource: (key: string) => Promise<void>;
}

export interface PublishFailureInput {
  id: string;
  userId: string;
  key: string;
}

export async function handlePublishFailure(
  input: PublishFailureInput,
  deps: PublishFailureDeps,
): Promise<void> {
  try {
    await deps.markFailed(input.id);
  } catch (err) {
    console.error("[upload.complete] Failed to mark upload as failed after Service Bus error", {
      uploadId: input.id,
      userId: input.userId,
      key: input.key,
      error: err,
    });
  }

  try {
    await deps.deleteSource(input.key);
    console.info("[upload.complete] Cleaned up source object after Service Bus publish failure", {
      uploadId: input.id,
      userId: input.userId,
      key: input.key,
    });
  } catch (err) {
    console.error("[upload.complete] Failed to clean up source object after Service Bus error", {
      uploadId: input.id,
      userId: input.userId,
      key: input.key,
      error: err,
    });
  }
}
