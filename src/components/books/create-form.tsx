"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type z from "zod";

import CoverDropzone from "@/components/books/create-form/form-sections/cover-dropzone";
import GoodreadsImportPanel from "@/components/books/create-form/goodreads-import-panel";
import { useUploadThing } from "@/components/uploadthing";
import { handleTRPCError, handleUploadError } from "@/lib/common";
import { createFormSchema } from "@/lib/schemas/book";
import type { ScrapeData } from "@/lib/types";
import { trpc } from "@/trpc/client";

import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Field } from "../ui/field";
import { Separator } from "../ui/separator";
import { Spinner } from "../ui/spinner";

import { BasicInfoSection } from "./create-form/form-sections/basic-info-section";
import { OptionalInfoSection } from "./create-form/form-sections/optional-info-section";

const CreateBookForm = (): React.ReactElement => {
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [isImportingFromGoodReads, setIsImportingFromGoodReads] =
    useState<boolean>(false);

  const { startUpload, isUploading } = useUploadThing("imageUploader", {
    onUploadError: (error) => {
      handleUploadError(error, "Cover upload");
    },
  });

  const form = useForm<z.infer<typeof createFormSchema>>({
    resolver: zodResolver(createFormSchema),
    defaultValues: {
      title: "",
      author: "",
      isbn: "",
      pageCount: undefined,
      publishedYear: undefined,
      summary: "",
      series: "",
      seriesIndex: undefined,
      coverUrl: "",
    },
  });

  const router = useRouter();

  const handleGoodReadsImport = (data: ScrapeData): void => {
    form.setValue("title", data.title);
    form.setValue("author", data.author);
    form.setValue("publishedYear", data.publishedYear);
    if (data.seriesInfo) {
      form.setValue("series", data.seriesInfo.series);
      form.setValue("seriesIndex", data.seriesInfo.seriesIndex);
    }
    if (data.summary) {
      form.setValue("summary", data.summary);
    }
  };

  const { mutate: createBook, isPending: isCreatingBook } =
    trpc.book.createBook.useMutation({
      onSuccess: (data) => {
        const createdBook = data.book;

        toast.success("You added a new book!", {
          description: `${createdBook.title} - ${createdBook.author}`,
          position: "bottom-right",
          classNames: {
            content: "flex flex-col gap-2",
          },
          style: {
            "--border-radius": "calc(var(--radius)+4px)",
          } as React.CSSProperties,
        });

        router.push(`/books/${createdBook.id}`);
      },
      onError: (error) => {
        handleTRPCError(error, "Book creation");
      },
    });

  const onSubmit = async (
    data: z.infer<typeof createFormSchema>,
  ): Promise<void> => {
    let coverUrl = data.coverUrl;

    if (pendingCoverFile) {
      try {
        const uploadResult = await startUpload([pendingCoverFile]);
        if (uploadResult && uploadResult.length > 0) {
          coverUrl = uploadResult[0].ufsUrl;
        }
      } catch {
        return;
      }
    }

    createBook({ ...data, coverUrl });
  };

  const titleRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="w-full md:w-2/3 xl:w-1/2">
      <CardHeader className="flex flex-col items-center">
        <CardTitle>Add a new Book to your Bookshelf</CardTitle>
        <CardDescription>
          Fill in the form below, and click the Upload button to upload a cover
          image.
        </CardDescription>
        <GoodreadsImportPanel
          onImportSuccess={handleGoodReadsImport}
          onPanelClose={() => titleRef.current?.focus()}
          onLoadingChange={setIsImportingFromGoodReads}
          className="md:w-2/3 xl:w-1/2"
        />
      </CardHeader>
      <CardContent>
        <form id="create-book-form" onSubmit={form.handleSubmit(onSubmit)}>
          <BasicInfoSection
            form={form}
            titleInputRef={titleRef}
            disabled={isUploading || isCreatingBook}
          />
          <Separator className="my-4" />
          <OptionalInfoSection
            form={form}
            disabled={isUploading || isCreatingBook}
          />
          <CoverDropzone
            file={pendingCoverFile}
            onFileSelect={setPendingCoverFile}
            disabled={isCreatingBook || isUploading}
            isUploading={isUploading}
          />
        </form>
      </CardContent>
      <CardFooter>
        <Field
          orientation="horizontal"
          className="mt-4 flex w-full flex-col justify-center gap-y-2 sm:flex-row"
        >
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              form.reset();
              setPendingCoverFile(null);
            }}
            className="w-full text-lg sm:w-50"
            size="lg"
            disabled={isCreatingBook || isImportingFromGoodReads || isUploading}
          >
            Reset
          </Button>
          <Button
            type="submit"
            form="create-book-form"
            className="w-full text-lg sm:w-50"
            size="lg"
            disabled={isCreatingBook || isImportingFromGoodReads || isUploading}
          >
            {isUploading ? (
              <>
                <Spinner /> Uploading cover...
              </>
            ) : isCreatingBook ? (
              <>
                <Spinner /> Creating...
              </>
            ) : (
              "Submit"
            )}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
};

export default CreateBookForm;
