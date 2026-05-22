"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type z from "zod";

import CoverSection, { type CoverValue } from "@/components/books/create-form/form-sections/cover-section";
import GoodreadsImportPanel from "@/components/books/create-form/goodreads-import-panel";
import { handleTRPCError, handleUploadError } from "@/lib/common";
import { useCoverUpload } from "@/hooks/upload";
import { estimateKepubPageCount } from "@/lib/book";
import { createBookInputSchema } from "@/lib/schemas/book";
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
import { ReadingHistorySection } from "./create-form/form-sections/reading-history-section";

const CreateBookForm = (): React.ReactElement => {
  const [coverValue, setCoverValue] = useState<CoverValue>({ type: "unchanged" });
  const [isImportingFromGoodReads, setIsImportingFromGoodReads] =
    useState<boolean>(false);
  const [isProcessingKepub, setIsProcessingKepub] = useState<boolean>(false);

  const { startUpload, isUploading } = useCoverUpload({
    onError: (error) => {
      handleUploadError(error, "Cover upload");
    },
  });

  const form = useForm<z.infer<typeof createBookInputSchema>>({
    resolver: zodResolver(createBookInputSchema),
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
      alreadyRead: false,
      finishedAt: undefined,
      startedAt: undefined,
      rating: undefined,
    },
  });

  const router = useRouter();

  const handleKepubSelect = async (file: File): Promise<void> => {
    setIsProcessingKepub(true);
    try {
      const count = await estimateKepubPageCount(await file.arrayBuffer(), new DOMParser());
      form.setValue("pageCount", count, { shouldValidate: true });
    } catch {
      toast.error("Could not estimate page count", {
        description: "Make sure the file is a valid KEPUB or EPUB.",
      });
    } finally {
      setIsProcessingKepub(false);
    }
  };

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
    if (data.goodreadsUrl) {
      form.setValue("goodreadsUrl", data.goodreadsUrl);
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
    data: z.infer<typeof createBookInputSchema>,
  ): Promise<void> => {
    let coverUrl = "";

    if (coverValue.type === "file") {
      const uploadResult = await startUpload(coverValue.file);
      if (!uploadResult) return;
      coverUrl = uploadResult.url;
    } else if (coverValue.type === "url") {
      coverUrl = coverValue.url;
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
            onKepubSelect={handleKepubSelect}
            isProcessingKepub={isProcessingKepub}
          />
          <Separator className="my-4" />
          <ReadingHistorySection
            form={form}
            disabled={isUploading || isCreatingBook}
          />
          <CoverSection
            coverValue={coverValue}
            onCoverChange={setCoverValue}
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
              setCoverValue({ type: "unchanged" });
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
