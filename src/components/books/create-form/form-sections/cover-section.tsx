"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Upload, XIcon } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useImageError } from "@/hooks/ui";
import { cn } from "@/lib/utils";

export type CoverValue =
  | { type: "file"; file: File }
  | { type: "url"; url: string }
  | { type: "removed" }
  | { type: "unchanged" };

interface CoverSectionProps {
  coverValue: CoverValue;
  onCoverChange: (value: CoverValue) => void;
  isUploading: boolean;
  disabled?: boolean;
  existingUrl?: string | null;
}

const CoverSection = ({
  coverValue,
  onCoverChange,
  isUploading,
  disabled,
  existingUrl,
}: CoverSectionProps): React.ReactElement => {
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const file = coverValue.type === "file" ? coverValue.file : null;

  const blobUrl = useMemo(() => {
    return file ? URL.createObjectURL(file) : null;
  }, [file]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const uploadPreviewUrl = coverValue.type === "removed" ? null : (blobUrl ?? existingUrl ?? null);

  const urlPreviewUrl = useMemo(() => {
    if (!urlInput) return null;
    return z.url().safeParse(urlInput).success ? urlInput : null;
  }, [urlInput]);

  const { imageError: urlImageError, handleImageError: handleUrlImageError } = useImageError(urlPreviewUrl);
  const { imageError: uploadImageError, handleImageError: handleUploadImageError } = useImageError(
    existingUrl ?? null,
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onCoverChange({ type: "file", file: acceptedFiles[0] });
      }
    },
    [onCoverChange],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (coverValue.type === "file") {
        onCoverChange({ type: "unchanged" });
      } else {
        onCoverChange({ type: "removed" });
      }
    },
    [coverValue.type, onCoverChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
    maxFiles: 1,
    maxSize: 4 * 1024 * 1024,
    multiple: false,
    disabled,
    onDrop,
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      const error = rejection?.errors[0];
      if (error?.code === "file-too-large") {
        toast.error("File is too large", { description: "Maximum size is 4MB." });
      } else if (error?.code === "file-invalid-type") {
        toast.error("Invalid file type", {
          description: "Please upload a PNG, JPG, or WebP image.",
        });
      } else {
        toast.error("Could not upload file", {
          description: error?.message ?? "Unknown error",
        });
      }
    },
  });

  const handleTabChange = useCallback((_value: string): void => {
    onCoverChange({ type: "unchanged" });
    setUrlInput("");
    setUrlError(null);
  }, [onCoverChange]);

  const handleUrlBlur = useCallback((): void => {
    if (!urlInput) {
      setUrlError(null);
      return;
    }
    if (!z.url().safeParse(urlInput).success) {
      setUrlError("Please enter a valid URL.");
    } else {
      setUrlError(null);
    }
  }, [urlInput]);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;
    setUrlInput(val);
    onCoverChange(val ? { type: "url", url: val } : { type: "unchanged" });
  }, [onCoverChange]);

  return (
    <div className="mt-4 flex flex-col items-start gap-y-2">
      <Label>Cover Image</Label>
      <Tabs defaultValue="upload" className="w-full" onValueChange={handleTabChange}>
        <TabsList className="mb-2">
          <TabsTrigger value="upload">Upload File</TabsTrigger>
          <TabsTrigger value="url">Enter URL</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div
            {...getRootProps()}
            className={cn(
              "relative flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center",
              isDragActive
                ? "border-primary bg-primary/5 border"
                : "border-muted-foreground/25 hover:border-primary/50 border",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input {...getInputProps()} />
            {uploadPreviewUrl && !(uploadImageError && !blobUrl) ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadPreviewUrl}
                  alt="Cover Preview"
                  className="max-h-[160px] rounded-md object-contain"
                  {...(!blobUrl && { onError: handleUploadImageError })}
                />
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50">
                    <Spinner className="size-6 text-white" />
                  </div>
                )}
                {!isUploading && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon-sm"
                    aria-label="Remove cover image"
                    className="absolute -top-2 -right-2"
                    onClick={handleRemove}
                    disabled={disabled}
                  >
                    <XIcon className="size-4" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground flex flex-col items-center gap-y-2">
                <Upload className="size-10" />
                <div className="text-center">
                  <p className="font-medium">{isDragActive ? "Drop image here" : "Drag & drop an image"}</p>
                  <p className="text-sm">or click to select</p>
                </div>
                <p className="text-xs">PNG, JPG, JPEG, WebP - Max 4MB</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="url">
          <div className="flex flex-col gap-y-3">
            <Label htmlFor="cover-url-input">Image URL</Label>
            <Input
              id="cover-url-input"
              type="url"
              placeholder="https://example.com/cover.jpg"
              value={urlInput}
              onChange={handleUrlChange}
              onBlur={handleUrlBlur}
              disabled={disabled}
            />
            <FieldError>{urlError}</FieldError>
            {urlPreviewUrl && (
              <div className="flex flex-col items-center gap-y-2">
                {urlImageError ? (
                  <p className="text-muted-foreground text-sm">
                    Could not preview image from this URL. The cover will still be saved.
                  </p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urlPreviewUrl}
                    alt="Cover Preview"
                    className="max-h-[160px] rounded-md object-contain"
                    onError={handleUrlImageError}
                  />
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CoverSection;
