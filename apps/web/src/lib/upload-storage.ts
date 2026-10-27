import { deleteKeyAndPrefix } from "@vessel/r2";
import { deriveOutputPrefixFromUploadKey } from "@/lib/upload-hls";

type R2Client = Parameters<typeof deleteKeyAndPrefix>[0];

export async function deleteStoredUpload(
  client: R2Client,
  bucket: string,
  sourceKey: string,
): Promise<void> {
  await deleteKeyAndPrefix(client, {
    bucket,
    key: sourceKey,
    prefix: deriveOutputPrefixFromUploadKey(sourceKey),
  });
}
