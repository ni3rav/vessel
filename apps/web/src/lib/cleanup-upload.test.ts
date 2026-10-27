import { describe, expect, it, vi } from "vitest";
import { deleteLockedUpload } from "./cleanup-upload";

const upload = {
  id: "upload-1",
  key: "uploads/user-1/track/track.mp3",
  status: "failed",
};

describe("deleteLockedUpload", () => {
  it("deletes storage before the row", async () => {
    const order: string[] = [];

    await deleteLockedUpload(upload, {
      deleteStorage: async () => {
        order.push("storage");
      },
      deleteRow: async () => {
        order.push("row");
        return 1;
      },
    });

    expect(order).toEqual(["storage", "row"]);
  });

  it("does not delete the row when storage deletion fails", async () => {
    const deleteRow = vi.fn();

    await expect(
      deleteLockedUpload(upload, {
        deleteStorage: async () => {
          throw new Error("r2 delete failed");
        },
        deleteRow,
      }),
    ).rejects.toThrow("r2 delete failed");

    expect(deleteRow).not.toHaveBeenCalled();
  });

  it("throws when the locked row is not deleted", async () => {
    const deleteStorage = vi.fn().mockResolvedValue(undefined);

    await expect(
      deleteLockedUpload(upload, {
        deleteStorage,
        deleteRow: async () => 0,
      }),
    ).rejects.toThrow("Upload upload-1 was not deleted");

    expect(deleteStorage).toHaveBeenCalledOnce();
  });
});
