export function deriveOutputPrefixFromUploadKey(uploadKey: string): string | null {
  const masterKey = deriveHlsMasterKeyFromUploadKey(uploadKey);
  if (!masterKey) return null;
  return masterKey.replace(/\/master\.m3u8$/, "");
}

export function deriveHlsMasterKeyFromUploadKey(uploadKey: string): string | null {
  const trimmed = uploadKey.trim().replace(/^\/+/, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "uploads") return null;

  if (parts.length === 3) {
    const file = parts[2];
    const dot = file.lastIndexOf(".");
    const stem = dot > 0 ? file.slice(0, dot) : file;
    if (!stem) return null;
    return `uploads/${parts[1]}/${stem}/master.m3u8`;
  }

  const parentPrefix = parts.slice(0, -1).join("/");
  return `${parentPrefix}/master.m3u8`;
}

export function joinPublicObjectUrl(baseUrl: string, objectKey: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const key = objectKey.replace(/^\/+/, "");
  return `${base}/${key}`;
}
