import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": [
        "warn",
        {
          groups: [
            // Side effect imports (e.g., import './styles.css')
            ["^\\u0000"],
            // React and Next.js
            ["^react$", "^react-dom$", "^next(/.*)?$"],
            // External packages - anything that doesn't start with . or @ or /
            ["^[a-z@]"],
            // Internal packages - starting with @/
            ["^@/"],
            // Parent imports (..)
            ["^\\.\\."],
            // Same folder imports (.)
            ["^\\."],
          ],
        },
      ],
      "simple-import-sort/exports": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/components/ui/**",
  ]),
]);

export default eslintConfig;
