import { auth } from "@clerk/nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

import { logger } from "@/lib/logger";

const f = createUploadthing();

// FileRouter for your app, can contain multiple FileRoutes
export const bookshelfFileRouter = {
  // Define as many FileRoutes as you like, each with a unique routeSlug
  imageUploader: f({
    image: {
      /**
       * For full list of options and defaults, see the File Route API reference
       * @see https://docs.uploadthing.com/file-routes#route-config
       */
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  })
    // Set permissions and file types for this FileRoute
    .middleware(async () => {
      // This code runs on your server before upload
      const { isAuthenticated, userId: clerkId } = await auth();

      if (!isAuthenticated || !clerkId) {
        logger.warn({ clerkId }, "Unauthenticated user tried to upload file");
        throw new UploadThingError("Unauthorized");
      }

      logger.debug({ clerkId }, "File upload authorized");

      // If you throw, the user will not be able to upload

      // Whatever is returned here is accessible in onUploadComplete as `metadata`
      return {};
    })
    .onUploadComplete(async ({ file }) => {
      logger.info({ fileUrl: file.ufsUrl }, "Upload complete");

      return {
        fileUrl: file.ufsUrl,
        fileKey: file.key,
      };
    }),
} satisfies FileRouter;

export type BookshelfFileRouter = typeof bookshelfFileRouter;
