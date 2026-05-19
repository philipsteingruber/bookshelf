"use client";

import React from "react";

import ErrorFallback from "@/components/error/error-fallback";

const ErrorPage = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): React.ReactElement => {
  return <ErrorFallback error={error} resetError={reset} />;
};

export default ErrorPage;
