import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",

    setupFiles: ["./vitest.setup.ts"],

    globals: true,

    include: ["**/*.{test,spec}.{ts,tsx}"],

    exclude: ["node_modules", ".next", ".dist", ".worktrees"],

    coverage: {
      exclude: [
        "src/generated/**",
        "node_modules/**",
        ".next/**",
        "**/*.test.{ts,tsx}",
        "**/*.config.{ts,js}",
        "vitest.setup.ts",
      ],
      reporter: ["text", "html"],
    },
  },
});
