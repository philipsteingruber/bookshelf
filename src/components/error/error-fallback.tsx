"use client";

import { useRouter } from "next/navigation";

import { AlertCircle, Home, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

const ErrorFallback = ({
  error,
  resetError,
}: ErrorFallbackProps): React.ReactElement => {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="gap-y-4">
          <CardHeader>
            <div className="flex items-center gap-x-2">
              <AlertCircle className="text-destructive size-5" />{" "}
              <CardTitle>Something went wrong</CardTitle>
            </div>
          </CardHeader>
          <p className="text-muted-foreground text-sm">
            We encountered an unexpected error. Don&apos;t worry, your data is
            safe.
          </p>
          {process.env.NODE_ENV === "development" && (
            <details className="rounded border p-2 text-xs">
              <summary className="cursor-pointer font-medium">
                Error details
              </summary>
              <pre className="mt-2 overflow-auto wrap-break-word whitespace-pre-wrap">
                {error.message}
                {"\n\n"}
                {error.stack}
              </pre>
            </details>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={resetError} variant={"outline"} className="gap-2">
            <RefreshCwIcon className="size-4" />
            Try Again
          </Button>
          <Button onClick={() => router.push("/dashboard")} className="gap-2">
            <Home className="size-4" />
            Go Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ErrorFallback;
