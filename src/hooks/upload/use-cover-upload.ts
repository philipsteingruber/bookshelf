"use client";

import { useState } from "react";

import { upload } from "@vercel/blob/client";

interface UseCoverUploadOptions {
  onError?: (error: Error) => void;
}

interface UseCoverUploadResult {
  startUpload: (file: File) => Promise<{ url: string } | null>;
  isUploading: boolean;
}

export function useCoverUpload(
  options: UseCoverUploadOptions = {},
): UseCoverUploadResult {
  const [isUploading, setIsUploading] = useState(false);

  const startUpload = async (file: File): Promise<{ url: string } | null> => {
    setIsUploading(true);
    try {
      const blob = await upload(`covers/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
      });
      return { url: blob.url };
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Upload failed");
      options.onError?.(error);
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { startUpload, isUploading };
}
