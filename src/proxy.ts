import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";

import { clerkMiddleware } from "@clerk/nextjs/server";

import { logger } from "@/lib/common";

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const requestId = crypto.randomUUID();
  const { userId } = await auth();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  if (userId) {
    requestHeaders.set("x-user-id", userId);
  }

  // Works in all environments now!
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
