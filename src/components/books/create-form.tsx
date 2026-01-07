"use client";

import { createFormSchema } from "@/lib/schemas/book";
import { trpc } from "@/trpc/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
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
import { BasicInfoSection } from "./create-form/BasicInfoSection";
import { OptionalInfoSection } from "./create-form/OptionalInfoSection";
import { CoverUploadSection } from "./create-form/CoverUploadSection";

const CreateBookForm = () => {
  const [showUploadButton, setShowUploadButton] = useState<boolean>(true);

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

  const { mutate: createBook, isPending: creatingBook } =
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
        // Handle different error types with user-friendly messages
        if (error.data?.code === "CONFLICT") {
          // Server sends specific messages for ISBN or series conflicts
          toast.error(error.message);
        } else if (error.message.includes("unique constraint")) {
          toast.error("A book with these details already exists in your library.");
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          toast.error("Network error. Please check your connection and try again.");
        } else if (error.data?.code === "UNAUTHORIZED") {
          toast.error("Please sign in to create books.");
        } else if (error.data?.code === "BAD_REQUEST") {
          toast.error("Invalid book information. Please check your entries.");
        } else {
          toast.error("Unable to create book. Please try again or contact support.");
        }
        console.error("Book creation failed:", error);
      },
    });

  const router = useRouter();

  const onSubmit = (data: z.infer<typeof createFormSchema>) => {
    // Server-side validation handles duplicate checks now
    createBook(data);
  };

  return (
    <Card className="w-1/2">
      <CardHeader>
        <CardTitle>Add a new Book to your Bookshelf</CardTitle>
        <CardDescription>
          Fill in the form below, and click the Upload button to upload a cover
          image.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id="create-book-form" onSubmit={form.handleSubmit(onSubmit)}>
          <BasicInfoSection form={form} />
          <Separator className="my-4" />
          <OptionalInfoSection form={form} />
        </form>
        <CoverUploadSection
          form={form}
          showUploadButton={showUploadButton}
          setShowUploadButton={setShowUploadButton}
        />
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
                form.setValue("coverUrl", "");
                setShowUploadButton(true);
              }}
              className="text-lg"
              size="lg"
              disabled={creatingBook}
            >
              Reset
            </Button>
            <Button
              type="submit"
              form="create-book-form"
              className="text-lg"
              size="lg"
              disabled={creatingBook}
            >
              {creatingBook ? (
                <>
                  <Spinner /> Creating...
                </>
              ) : (
                "Submit"
              )}
            </Button>
          </Field>
        </CardFooter>
      </CardContent>
    </Card>
  );
};

export default CreateBookForm;
