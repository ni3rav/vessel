/**
 * Derives the HLS master playlist object key from an upload source object key.
 * Example: uploads/<user>/<uuid>.mp3 → uploads/<user>/master.m3u8
 */
export function deriveHlsMasterKeyFromUploadKey(uploadKey: string): string | null {
  const trimmed = uploadKey.trim();
  const slash = trimmed.lastIndexOf("/");
  if (slash <= 0) return null;
  const prefix = trimmed.slice(0, slash);
  return `${prefix}/master.m3u8`;
}

export function joinPublicObjectUrl(baseUrl: string, objectKey: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const key = objectKey.replace(/^\/+/, "");
  return `${base}/${key}`;
}
