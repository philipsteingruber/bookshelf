import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type z from "zod";

import { Label } from "@/components/ui/label";
import { UploadButton } from "@/components/uploadthing";
import { handleUploadError } from "@/lib/error-handler";
import type { createFormSchema } from "@/lib/schemas/book";

interface CoverUploadSectionProps {
  form: UseFormReturn<z.infer<typeof createFormSchema>>;
  showUploadButton: boolean;
  setShowUploadButton: (show: boolean) => void;
}

export const CoverUploadSection = ({
  form,
  showUploadButton,
  setShowUploadButton,
}: CoverUploadSectionProps) => {
  if (!showUploadButton) return null;

  return (
    <div className="mt-4 flex flex-col items-start gap-y-2">
      <Label>Upload cover</Label>
      <UploadButton
        endpoint="imageUploader"
        onUploadError={(error: Error) => {
          handleUploadError(error, "Cover upload");
        }}
        onClientUploadComplete={async (res) => {
          try {
            const fileUrl = res[0].ufsUrl;
            form.setValue("coverUrl", fileUrl);
            toast.success("Cover successfully uploaded.");
            setShowUploadButton(false);
          } catch (err) {
            toast.error(
              "Failed to save cover URL. Please try uploading again.",
            );
            console.error("Upload complete error:", err);
          }
        }}
        className="ut-button:bg-primary ut-button:text-foreground"
      />
    </div>
  );
};
