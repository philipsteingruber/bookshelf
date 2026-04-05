"use client";

import React, { useEffect } from "react";
import NextError from "next/error";

import * as Sentry from "@sentry/nextjs";

export const GlobalError = ({ error }: { error: Error & { digest?: string } }): React.ReactElement => {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
};
