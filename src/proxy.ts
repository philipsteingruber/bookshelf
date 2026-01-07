import { NextRequest, NextResponse } from "next/server";

import { clerkMiddleware } from "@clerk/nextjs/server";

import { logger } from "@/lib/logger";

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const requestId = crypto.randomUUID();

  const { userId } = await auth();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  if (userId) {
    requestHeaders.set("x-user-id", userId);
  }

  logger.debug(
    {
      requestId,
      userId,
      pathname: request.nextUrl.pathname,
      method: request.method,
    },
    "Request context initialized",
  );

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
