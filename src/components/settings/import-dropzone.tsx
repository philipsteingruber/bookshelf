import { UploadIcon } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ImportFormat } from "@/lib/types";
import { cn } from "@/lib/utils";

const ImportDropzone = ({
  selectedFormat,
  selectedFiles,
  onResetFiles,
  onFileAdd,
  disabled,
}: {
  selectedFormat: ImportFormat;
  selectedFiles: File[];
  onResetFiles: () => void;
  onFileAdd: (file: File) => void;
  onSubmit: () => Promise<void>;
  disabled: boolean;
}): React.ReactElement => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept:
      selectedFormat === "json"
        ? { "application/json": [".json"] }
        : { "text/csv": [".csv"] },
    maxFiles: selectedFormat === "json" ? 1 : 3,
    maxSize: 10 * 1024 * 1024,
    multiple: selectedFormat === "csv",
    onDrop: (acceptedFiles: File[]) => {
      if (selectedFormat === "json") {
        if (acceptedFiles.length > 0) {
          onFileAdd(acceptedFiles[0]);
        }
      } else {
        if (acceptedFiles.length <= 3 && acceptedFiles.length > 0) {
          acceptedFiles.map((file) => onFileAdd(file));
        }
      }
    },
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      const error = rejection?.errors[0];

      if (error?.code === "file-too-large") {
        toast.error("File is too large", {
          description: "Maximum size is 10MB.",
        });
      } else if (error?.code === "file-invalid-type") {
        toast.error("Invalid file type", {
          description: `Please upload a .${selectedFormat} file.`,
        });
      } else {
        toast.error("Could not upload file", {
          description: error?.message ?? "Unknown error",
        });
      }
    },
  });

  return (
    <div className="flex flex-col items-start gap-y-2">
      <Label>Choose files to import</Label>
      <div
        {...getRootProps()}
        className={cn(
          "flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center rounded-md",
          isDragActive
            ? "border-primary bg-primary/5 border"
            : "border-muted-foreground/25 hover:border-primary/50 border",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input {...getInputProps()} />
        <div className="text-muted-foreground flex flex-col items-center gap-y-2">
          <UploadIcon className="size-10" />
          <div className="text-center">
            <p className="font-medium">
              {isDragActive
                ? "Drop file here"
                : `Drag & Drop a .${selectedFormat}-File`}
            </p>
            <p className="text-sm"> or Click to Browse</p>
            <p className="text-xs">Max 10MB</p>
          </div>
        </div>
      </div>
      <div>
        {selectedFiles.map((file) => (
          <p key={file.name} className="pl-2 italic">
            {file.name}
          </p>
        ))}
      </div>
      <div className="flex w-full justify-center">
        <Button
          onClick={onResetFiles}
          disabled={selectedFiles.length === 0 || disabled}
        >
          Clear Selected Files
        </Button>
      </div>
    </div>
  );
};

export default ImportDropzone;
