import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
      "unused-imports": unusedImports,
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
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
        },
      ],
      // Turn off the default no-unused-vars rule (replaced by unused-imports plugin)
      "@typescript-eslint/no-unused-vars": "off",
      // Warn about unused imports (auto-fixable)
      "unused-imports/no-unused-imports": "warn",
      // Warn about unused variables (not auto-fixable, but helps catch issues)
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
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
    "eslint.config.mjs",
  ]),
]);

export default eslintConfig;
