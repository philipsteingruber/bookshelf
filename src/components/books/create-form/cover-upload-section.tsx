import { UseFormReturn } from "react-hook-form";
import { createFormSchema } from "@/lib/schemas/book";
import { Label } from "@/components/ui/label";
import { UploadButton } from "@/components/uploadthing";
import { toast } from "sonner";
import z from "zod";

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
          // Provide specific error messages based on error type
          if (
            error.message.includes("file too large") ||
            error.message.includes("FileSizeMismatch")
          ) {
            toast.error("Image too large. Please use an image under 4MB.");
          } else if (
            error.message.includes("file type") ||
            error.message.includes("InvalidFileType")
          ) {
            toast.error("Invalid file type. Please upload a JPG or PNG image.");
          } else if (
            error.message.includes("network") ||
            error.message.includes("fetch")
          ) {
            toast.error(
              "Network error. Please check your connection and try again.",
            );
          } else {
            toast.error("Upload failed. Please try again.");
          }
          console.error("Upload error:", error);
        }}
        onClientUploadComplete={async (res) => {
          try {
            const fileUrl = res[0].ufsUrl;
            form.setValue("coverUrl", fileUrl);
            toast.success("Cover successfully uploaded.");
            setShowUploadButton(false);
          } catch (err) {
            toast.error("Failed to save cover URL. Please try uploading again.");
            console.error("Upload complete error:", err);
          }
        }}
        className="ut-button:bg-primary ut-button:text-foreground"
      />
    </div>
  );
};
