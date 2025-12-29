import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../init";
import { bookRouter } from "./book";
import { userRouter } from "./user";

export const appRouter = createTRPCRouter({
  user: userRouter,
  book: bookRouter,
  // Add more routers here as needed
});

export type AppRouter = typeof appRouter;
