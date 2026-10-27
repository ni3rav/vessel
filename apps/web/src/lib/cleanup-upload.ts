export interface LockedUpload {
  id: string;
  key: string;
  status: string;
}

export interface LockedUploadCleanup {
  deleteStorage: (key: string) => Promise<void>;
  /** Returns how many rows were deleted. Must run on the transaction that holds the row lock. */
  deleteRow: (id: string) => Promise<number>;
}

/**
 * Deletes storage, then the row. Call this inside the transaction that holds
 * the row lock. A storage failure throws before the row delete. A row delete
 * that removes anything other than that one row throws, so the transaction
 * rolls the row change back. Object deletes are idempotent, so a later run
 * can finish a row whose objects were already removed.
 */
export async function deleteLockedUpload(
  upload: LockedUpload,
  cleanup: LockedUploadCleanup,
): Promise<void> {
  await cleanup.deleteStorage(upload.key);
  const removed = await cleanup.deleteRow(upload.id);
  if (removed !== 1) {
    throw new Error(`Upload ${upload.id} was not deleted`);
  }
}
