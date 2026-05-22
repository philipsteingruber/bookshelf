import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { logger } from "@/lib/common/logger";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const { isAuthenticated, userId: clerkId } = await auth();

        if (!isAuthenticated || !clerkId) {
          logger.warn({ clerkId }, "Unauthenticated user tried to upload file");
          throw new Error("Unauthorized");
        }

        logger.debug({ clerkId, pathname }, "File upload token generated");

        return {
          allowedContentTypes: ["image/*"],
          maximumSizeInBytes: 4 * 1024 * 1024,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        logger.info({ fileUrl: blob.url }, "Upload complete");
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
