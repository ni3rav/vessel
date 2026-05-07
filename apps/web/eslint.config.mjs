import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { createConfig } from "@vessel/eslint-config";

export default createConfig(
  [
    ...nextVitals,
    ...nextTypescript,
    {
      ignores: [".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts"]
    },
  // Add local overrides for @vessel/web here.
  ],
  { ignores: [] }
);
