"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type z from "zod";

import { BasicInfoSection } from "@/components/books/create-form/form-sections/basic-info-section";
import CoverDropzone from "@/components/books/create-form/form-sections/cover-dropzone";
import { OptionalInfoSection } from "@/components/books/create-form/form-sections/optional-info-section";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useUploadThing } from "@/components/uploadthing";
import type { Book } from "@/generated/prisma/client";
import { handleTRPCError, handleUploadError } from "@/lib/common";
import { createFormSchema } from "@/lib/schemas/book";
import { trpc } from "@/trpc/client";

export const EditBookForm = ({ book }: { book: Book }): React.ReactElement => {
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState<boolean>(false);

  const { startUpload, isUploading } = useUploadThing("imageUploader", {
    onUploadError: (error) => {
      handleUploadError(error, "Cover upload");
    },
  });

  const router = useRouter();
  const trpcUtils = trpc.useUtils();
  const { mutate: updateBook, isPending: isUpdatingBook } =
    trpc.book.updateBook.useMutation({
      onSuccess: (data) => {
        toast.success(`Successfully updated ${data.book.title}`);
        trpcUtils.book.getBook.invalidate();
        trpcUtils.book.getBooks.invalidate();
        router.push(`/books/${book.id}`);
      },
      onError: (error) => {
        handleTRPCError(error);
      },
    });

  const form = useForm<z.infer<typeof createFormSchema>>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl ?? "",
      isbn: book.isbn ?? "",
      pageCount: book.pageCount ?? 0,
      publishedYear: book.publishedYear ?? 1900,
      series: book.series ?? "",
      seriesIndex: book.seriesIndex ?? 1.0,
      summary: book.summary ?? "",
    },
  });

  const onSubmit = async (
    data: z.infer<typeof createFormSchema>,
  ): Promise<void> => {
    let coverUrl: string | undefined;
    if (coverFile) {
      const uploadResults = await startUpload([coverFile]);
      if (uploadResults && uploadResults.length !== 0) {
        coverUrl = uploadResults[0].ufsUrl;
      } else {
        handleUploadError(new Error("Failed to upload cover. Try again."));
        return;
      }
    } else if (removeCover) {
      coverUrl = "";
    } else {
      coverUrl = undefined;
    }

    updateBook({
      bookId: book.id,
      data: {
        ...data,
        coverUrl,
      },
    });
  };
  const onRemoveExisting = (): void => {
    setRemoveCover(true);
  };
  const handleFileSelect = (file: File | null): void => {
    setCoverFile(file);
    if (file) {
      setRemoveCover(false);
    }
  };

  return (
    <div className="flex w-full flex-col items-center justify-center xl:w-3/4">
      <Card className="w-full">
        <CardContent>
          <CardHeader className="mb-2">
            <CardTitle>{`Edit book (${book.title})`}</CardTitle>
            <CardDescription>
              Update any fields you wish to change.
            </CardDescription>
          </CardHeader>
          <form
            id="edit-book-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-y-4"
          >
            <Separator className="my-2" />
            <BasicInfoSection
              form={form}
              idPrefix="edit"
              disabled={isUpdatingBook || isUploading}
            />
            <Separator className="my-2" />
            <OptionalInfoSection
              form={form}
              idPrefix="edit"
              disabled={isUpdatingBook || isUploading}
            />
            <Separator className="my-2" />
            <CoverDropzone
              file={coverFile}
              onFileSelect={handleFileSelect}
              onRemoveExisting={onRemoveExisting}
              isUploading={isUploading}
              existingUrl={!removeCover ? book.coverUrl : undefined}
              disabled={isUpdatingBook || isUploading}
            />
            <CardFooter className="flex items-center justify-center gap-x-4">
              <Button variant={"outline"} type="button" disabled>
                Clear
              </Button>
              <Button disabled={isUpdatingBook || isUploading} type="submit">
                {isUpdatingBook || isUploading ? <Spinner /> : "Submit"}
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
