import path from "node:path";

export function deriveOutputPrefixFromSourceKey(sourceKey: string): string {
  const key = sourceKey.replace(/^\//, "").replace(/\\/g, "/");
  const ext = path.posix.extname(key);
  const stem = path.posix.basename(key, ext);
  const dir = path.posix.dirname(key);

  if (!stem) {
    throw new Error(`Invalid source key (no basename): ${sourceKey}`);
  }

  if (dir === ".") return stem;

  const parentLeaf = path.posix.basename(dir);
  if (parentLeaf === stem) {
    return dir;
  }

  return path.posix.join(dir, stem);
}
