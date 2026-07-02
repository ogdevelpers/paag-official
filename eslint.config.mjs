import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "frontend/.next/**",
    "backend/dist/**",
    "out/**",
    "next-env.d.ts",
    "frontend/next-env.d.ts",
  ]),
]);
