"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { handleTRPCError } from "@/lib/error-handler";
import type { ScrapeData } from "@/lib/goodreads-scraper";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

const GoodreadsImportPanel = ({
  onImportSuccess,
  onPanelClose,
  onLoadingChange,
  className,
}: {
  onImportSuccess: (data: ScrapeData) => void;
  onPanelClose: () => void;
  onLoadingChange: (isImporting: boolean) => void;
  className?: string;
}): React.ReactElement => {
  const [isImportPanelOpen, setIsImportPanelOpen] = useState<boolean>(false);
  const [inputUrl, setInputUrl] = useState<string>("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const importUrlRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isImportPanelOpen) {
      const timer = setTimeout(() => {
        importUrlRef.current?.focus();
      }, 50);
      return () => {
        clearTimeout(timer);
      };
    } else {
      onPanelClose();
    }
  }, [isImportPanelOpen, onPanelClose]);

  const { mutate: importFromGoodReads, isPending: isImportingFromGoodReads } =
    trpc.goodReads.scrape.useMutation({
      onSuccess: (data) => {
        onImportSuccess(data);
        setInputUrl("");
        setIsImportPanelOpen(false);
        toast.success("Successfully imported from GoodReads!");
      },
      onError: (error) => {
        handleTRPCError(error);
      },
    });

  useEffect(() => {
    onLoadingChange(isImportingFromGoodReads);
  }, [isImportingFromGoodReads, onLoadingChange]);

  const validateUrl = (url: string): void => {
    const result = z.url().safeParse(url);
    if (!result.success && inputUrl) {
      setUrlError("Please enter a valid URL");
    } else if (!url.includes("goodreads.com") && inputUrl) {
      setUrlError("URL must be from goodreads.com");
    } else {
      setUrlError(null);
    }
  };

  return (
    <Collapsible
      open={isImportPanelOpen}
      onOpenChange={setIsImportPanelOpen}
      className={cn(
        "mt-6 mb-2 flex w-full flex-col items-center justify-center text-center",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-x-4">
        <CollapsibleTrigger asChild>
          <div className="flex cursor-pointer items-center justify-between gap-x-4">
            <span
              className={
                isImportPanelOpen
                  ? "text-muted-foreground transition-colors"
                  : ""
              }
            >
              Want to get started with data from GoodReads?
            </span>
            <Button>
              <ChevronDown
                className={
                  isImportPanelOpen
                    ? "rotate-180 transition-transform"
                    : "transition-transform"
                }
              />
            </Button>
          </div>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="my-2 w-full rounded-md border p-2">
        <div className="flex flex-col items-center justify-center gap-y-2 sm:flex-row sm:items-start sm:gap-x-4">
          <div className="flex flex-col items-center gap-y-2">
            <Label htmlFor="importUrl">GoodReads URL</Label>
            <Input
              id="importUrl"
              ref={importUrlRef}
              className="w-64"
              disabled={isImportingFromGoodReads}
              value={inputUrl}
              onChange={(evt) => {
                validateUrl(evt.target.value);
                setInputUrl(evt.target.value);
              }}
              onBlur={(evt) => {
                validateUrl(evt.target.value);
              }}
              onKeyDown={(evt) => {
                if (evt.key === "Enter" && !urlError && inputUrl) {
                  importFromGoodReads(inputUrl);
                }
              }}
            />
            {urlError && (
              <span className="text-xs text-red-500">{urlError}</span>
            )}
          </div>
          <Button
            className="mt-[22px]"
            disabled={isImportingFromGoodReads || !!urlError || !inputUrl}
            onClick={() => {
              importFromGoodReads(inputUrl);
            }}
          >
            {isImportingFromGoodReads ? <Spinner /> : "Import"}
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default GoodreadsImportPanel;
