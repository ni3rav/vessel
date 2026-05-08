/**
 * Constructs the public URL for a key in a public R2 bucket.
 * No signing needed — the bucket is publicly accessible.
 */
export function getPublicUrl(publicBaseUrl: string, key: string): string {
  const base = publicBaseUrl.replace(/\/$/, "");
  const normalizedKey = key.replace(/^\//, "");
  return `${base}/${normalizedKey}`;
}
