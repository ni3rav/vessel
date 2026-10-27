import { describe, expect, it } from "vitest";
import { deleteKeyAndPrefix } from "@vessel/r2";

interface Command {
  input: {
    Bucket?: string;
    Key?: string;
    Prefix?: string;
    Delete?: { Objects?: Array<{ Key?: string }> };
  };
}

function clientFrom(send: (command: Command) => Promise<unknown>) {
  return { send } as unknown as Parameters<typeof deleteKeyAndPrefix>[0];
}

describe("deleteKeyAndPrefix", () => {
  it("deletes the source key and every object under the prefix", async () => {
    const sent: Command[] = [];
    const client = clientFrom(async (command) => {
      sent.push(command);
      if (command.input.Prefix !== undefined) {
        const listCalls = sent.filter((item) => item.input.Prefix !== undefined).length;
        if (listCalls === 1) {
          return {
            Contents: [
              { Key: "uploads/user-1/track/track.mp3" },
              { Key: "uploads/user-1/track/master.m3u8" },
              { Key: "uploads/user-1/track/128k/seg0.ts" },
            ],
            IsTruncated: false,
          };
        }
        return { Contents: [], IsTruncated: false };
      }
      if (command.input.Delete) return { Errors: [] };
      throw new Error("unexpected command");
    });

    const result = await deleteKeyAndPrefix(client, {
      bucket: "bucket",
      key: "/uploads/user-1/track/track.mp3",
      prefix: "uploads/user-1/track",
    });

    expect(result.deletedKeys).toEqual([
      "uploads/user-1/track/track.mp3",
      "uploads/user-1/track/master.m3u8",
      "uploads/user-1/track/128k/seg0.ts",
    ]);
    expect(sent[0]?.input.Prefix).toBe("uploads/user-1/track/");
    expect(sent[1]?.input.Delete?.Objects?.map((object) => object.Key)).toEqual([
      "uploads/user-1/track/track.mp3",
      "uploads/user-1/track/master.m3u8",
      "uploads/user-1/track/128k/seg0.ts",
    ]);
    expect(sent[2]?.input.Prefix).toBe("uploads/user-1/track/");
  });

  it("throws when any object delete fails", async () => {
    const client = clientFrom(async (command) => {
      if (command.input.Prefix !== undefined) {
        return {
          Contents: [{ Key: "uploads/user-1/track/master.m3u8" }],
          IsTruncated: false,
        };
      }
      if (command.input.Delete) {
        return { Errors: [{ Key: "uploads/user-1/track/master.m3u8", Message: "access denied" }] };
      }
      throw new Error("unexpected command");
    });

    await expect(
      deleteKeyAndPrefix(client, {
        bucket: "bucket",
        key: "uploads/user-1/track/track.mp3",
        prefix: "uploads/user-1/track/",
      }),
    ).rejects.toThrow("Failed to delete 1 object(s): access denied");
  });

  it("throws when objects are still listed after the delete", async () => {
    const client = clientFrom(async (command) => {
      if (command.input.Prefix !== undefined) {
        return {
          Contents: [{ Key: "uploads/user-1/track/master.m3u8" }],
          IsTruncated: false,
        };
      }
      if (command.input.Delete) return { Errors: [] };
      throw new Error("unexpected command");
    });

    await expect(
      deleteKeyAndPrefix(client, {
        bucket: "bucket",
        key: "uploads/user-1/track/track.mp3",
        prefix: "uploads/user-1/track",
      }),
    ).rejects.toThrow("Objects remain under prefix after delete (1).");
  });

  it("deletes only the source key when there is no prefix", async () => {
    const sent: Command[] = [];
    const client = clientFrom(async (command) => {
      sent.push(command);
      if (command.input.Key) return {};
      throw new Error("unexpected command");
    });

    await deleteKeyAndPrefix(client, {
      bucket: "bucket",
      key: "uploads/user-1/track/track.mp3",
      prefix: null,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.input).toMatchObject({
      Bucket: "bucket",
      Key: "uploads/user-1/track/track.mp3",
    });
  });
});
