import { createTRPCRouter } from "../init";

import { bookRouter } from "./book";
import { readingProgressRouter } from "./reading-progress";
import { userRouter } from "./user";

export const appRouter = createTRPCRouter({
  user: userRouter,
  book: bookRouter,
  readingProgress: readingProgressRouter,
});

export type AppRouter = typeof appRouter;
