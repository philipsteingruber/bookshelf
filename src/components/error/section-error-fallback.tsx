"use client";

import { AlertCircle, RefreshCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SectionErrorFallbackProps {
  error: Error;
  resetError: () => void;
  title?: string;
}

const SectionErrorFallback = ({
  error,
  resetError,
  title,
}: SectionErrorFallbackProps): React.ReactElement => {
  return (
    <Card className="border-destructive/50">
      <CardContent className="gap-y-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="text-destructive size-4" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
        </CardHeader>
        <p className="text-muted-foreground text-sm">
          This section encountered an error. The rest of the app should still
          work.
        </p>
        {process.env.NODE_ENV === "development" && (
          <p className="text-muted-foreground font-mono text-xs">
            {error.message}
          </p>
        )}
        <Button
          onClick={resetError}
          size={"sm"}
          variant={"outline"}
          className="gap-2"
        >
          <RefreshCcwIcon className="size-3" /> Retry
        </Button>
      </CardContent>
    </Card>
  );
};

export default SectionErrorFallback;
