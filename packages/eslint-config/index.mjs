export const defaultIgnores = ["dist/**", "build/**", "coverage/**", "node_modules/**"];

export function createConfig(configs = [], options = {}) {
  const ignores = options.ignores ?? defaultIgnores;
  return [...configs, { ignores }];
}
