import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { env } from "@/env";
import { logger } from "@/lib/common";
import { createTRPCContext } from "@/trpc/init";
import { appRouter } from "@/trpc/routers/_app";

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const procedure = url.searchParams.get("batch") ? "batch" : url.pathname;

  try {
    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req,
      router: appRouter,
      createContext: createTRPCContext,
      onError: ({ error, path, type }) => {
        logger.error(
          {
            path,
            type,
            code: error.code,
            message: error.message,
            cause: error.cause,
          },
          "tRPC error occurred",
        );
      },
    });

    return response;
  } catch (err) {
    logger.error(
      {
        procedure,
        method: req.method,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Unhandled error in tRPC handler",
    );
    throw err;
  }
};

export { handler as GET, handler as POST };

export const OPTIONS = (): Response => {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin":
        env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
