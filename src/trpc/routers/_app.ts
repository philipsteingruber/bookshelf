import { createTRPCRouter } from "../init";

import { bookRouter } from "./book";
import { goodReadsRouter } from "./goodreads";
import { readingProgressRouter } from "./reading-progress";
import { userRouter } from "./user";

export const appRouter = createTRPCRouter({
  user: userRouter,
  book: bookRouter,
  readingProgress: readingProgressRouter,
  goodReads: goodReadsRouter,
});

export type AppRouter = typeof appRouter;
