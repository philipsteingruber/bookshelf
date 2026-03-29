import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  /**
   * Server-side environment variables - never exposed to the client
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().url(),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1),
    UPLOADTHING_TOKEN: z.string().min(1),
    BETTERSTACK_TOKEN: z.string().min(1).optional(),
    BETTERSTACK_INGESTING_HOST: z.string().url().optional(),
    SCRAPFLY_API_KEY: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    // Vercel-provided variables (optional, only present in Vercel deployments)
    VERCEL_URL: z.string().optional(),
    VERCEL_REGION: z.string().optional(),
  },

  /**
   * Client-side environment variables - exposed to the browser
   * Must be prefixed with NEXT_PUBLIC_
   */
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  },

  /**
   * Runtime environment mapping
   * This is necessary for tree-shaking in Next.js
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
    BETTERSTACK_TOKEN: process.env.BETTERSTACK_TOKEN,
    BETTERSTACK_INGESTING_HOST: process.env.BETTERSTACK_INGESTING_HOST,
    SCRAPFLY_API_KEY: process.env.SCRAPFLY_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_REGION: process.env.VERCEL_REGION,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  /**
   * Skip validation in certain environments (e.g., Docker builds)
   * Set SKIP_ENV_VALIDATION=true to bypass
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as undefined
   * This prevents "" from passing .min(1) checks
   */
  emptyStringAsUndefined: true,
})