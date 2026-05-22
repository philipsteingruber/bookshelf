import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock the t3-env module to avoid "server-side environment variable on client" errors
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    CLERK_SECRET_KEY: "test_clerk_secret",
    CLERK_WEBHOOK_SIGNING_SECRET: "test_webhook_secret",
    SCRAPFLY_API_KEY: "test_scrapfly_key",
    ANTHROPIC_API_KEY: "test_anthropic_key",
    BETTERSTACK_TOKEN: undefined,
    BETTERSTACK_INGESTING_HOST: undefined,
    VERCEL_URL: undefined,
    VERCEL_REGION: undefined,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "test_clerk_publishable",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
}));
