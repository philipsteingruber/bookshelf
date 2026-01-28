"use client";

import { useCallback, useEffect, useMemo } from "react";

import { Upload, XIcon } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface CoverDropzoneProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  isUploading: boolean;
  disabled?: boolean;
}

const CoverDropzone = ({
  onFileSelect,
  file,
  disabled,
  isUploading,
}: CoverDropzoneProps): React.ReactElement => {
  const previewUrl = useMemo(() => {
    return file ? URL.createObjectURL(file) : null;
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect],
  );
  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onFileSelect(null);
    },
    [onFileSelect],
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
        toast.error("File is too large", {
          description: "Maximum size is 4MB.",
        });
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

  return (
    <div className="mt-4 flex flex-col items-start gap-y-2">
      <Label>Cover Image</Label>
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
        {previewUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Cover Preview"
              className="max-h-[160px] rounded-md object-contain"
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
              <p className="font-medium">
                {isDragActive ? "Drop image here" : "Drag & drop an image"}
              </p>
              <p className="text-sm">or click to select</p>
            </div>
            <p className="text-xs">PNG, JPG, JPEG, WebP - Max 4MB</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoverDropzone;
