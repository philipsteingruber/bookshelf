import { createRouteHandler } from "uploadthing/next";

import { bookshelfFileRouter } from "./core";

// Export routes for Next App Router
export const { GET, POST } = createRouteHandler({
  router: bookshelfFileRouter,

  // Apply an (optional) custom config:
  // config: { ... },
  config: { logLevel: "Warning", logFormat: "pretty" },
});
