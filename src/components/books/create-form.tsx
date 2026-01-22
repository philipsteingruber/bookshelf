"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import CoverDropzone from "@/components/books/create-form/cover-dropzone";
import { useUploadThing } from "@/components/uploadthing";
import { handleTRPCError, handleUploadError } from "@/lib/error-handler";
import type { ScrapeData } from "@/lib/goodreads-scraper";
import { createFormSchema } from "@/lib/schemas/book";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Field } from "../ui/field";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Spinner } from "../ui/spinner";

import { BasicInfoSection } from "./create-form/basic-info-section";
import { OptionalInfoSection } from "./create-form/optional-info-section";

const CreateBookForm = (): React.ReactElement => {
  const [isImportPanelOpen, setIsImportPanelOpen] = useState<boolean>(false);
  const [inputUrl, setInputUrl] = useState<string>("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);

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
  const validateUrl = (url: string): void => {
    const result = z.url().safeParse(url);
    if (!result.success) {
      setUrlError("Please enter a valid URL");
    } else if (!url.includes("goodreads.com")) {
      setUrlError("URL must be from goodreads.com");
    } else {
      setUrlError(null);
    }
  };

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

  const { mutate: importFromGoodReads, isPending: isImportingFromGoodReads } =
    trpc.goodReads.scrape.useMutation({
      onSuccess: (data) => {
        handleGoodReadsImport(data);
        setInputUrl("");
        setIsImportPanelOpen(false);
      },
      onError: (error) => {
        handleTRPCError(error);
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

  return (
    <Card className="w-1/2">
      <CardHeader className="flex flex-col items-center">
        <CardTitle>Add a new Book to your Bookshelf</CardTitle>
        <CardDescription>
          Fill in the form below, and click the Upload button to upload a cover
          image.
        </CardDescription>
        <Collapsible
          open={isImportPanelOpen}
          onOpenChange={setIsImportPanelOpen}
          className="mt-6 mb-2 flex w-1/2 flex-col items-center justify-center"
        >
          <div className="flex items-center justify-between gap-x-4">
            Want to get started with data from GoodReads?
            <CollapsibleTrigger asChild>
              <Button>
                <ChevronDown
                  className={
                    isImportPanelOpen
                      ? "rotate-180 transition-transform"
                      : "transition-transform"
                  }
                />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="my-2 w-full rounded-md border p-2">
            <div className="flex items-start justify-center gap-x-4">
              <div className="flex flex-col items-center gap-y-2">
                <Label htmlFor="importUrl">GoodReads URL</Label>
                <Input
                  id="importUrl"
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
                />
                {urlError && (
                  <span className="text-xs text-red-500">{urlError}</span>
                )}
              </div>
              <Button
                className="mt-[22px]"
                disabled={isImportingFromGoodReads || !!urlError || !inputUrl}
                onClick={() => importFromGoodReads(inputUrl)}
              >
                {isImportingFromGoodReads ? <Spinner /> : "Import"}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardHeader>
      <CardContent>
        <form id="create-book-form" onSubmit={form.handleSubmit(onSubmit)}>
          <BasicInfoSection form={form} />
          <Separator className="my-4" />
          <OptionalInfoSection form={form} />
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
          className="mt-4 flex w-full justify-center"
        >
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              form.reset();
              setPendingCoverFile(null);
            }}
            className="w-50 text-lg"
            size="lg"
            disabled={isCreatingBook || isImportingFromGoodReads || isUploading}
          >
            Reset
          </Button>
          <Button
            type="submit"
            form="create-book-form"
            className="w-50 text-lg"
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
