import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import superjson from "superjson";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: (failureCount, error) => {
          const err = error as TRPCError;
          // Don't retry on UNAUTHORIZED or FORBIDDEN errors
          if (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN") {
            return false;
          }
          // Default retry behavior (3 retries)
          return failureCount < 3;
        },
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
