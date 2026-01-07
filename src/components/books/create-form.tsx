"use client";

import { createFormSchema } from "@/lib/schemas/book";
import { trpc } from "@/trpc/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";
import { UploadButton } from "../uploadthing";

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
        // Handle CONFLICT errors from server (duplicate validation)
        if (error.data?.code === "CONFLICT") {
          toast.error(error.message);
        } else {
          toast.error("Failed to create book. Please try again.");
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
          <FieldGroup>
            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-y-1">
                  <FieldLabel htmlFor="create-book-form-title">
                    Title <MandatoryFieldMarker />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="create-book-form-title"
                    aria-invalid={fieldState.invalid}
                    placeholder="Fellowship of the Ring"
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="author"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-y-1">
                  <FieldLabel htmlFor="create-book-form-author">
                    Author <MandatoryFieldMarker />
                  </FieldLabel>
                  <Input
                    {...field}
                    id="create-book-form-author"
                    aria-invalid={fieldState.invalid}
                    placeholder="J.R.R. Tolkien"
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="publishedYear"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-y-1">
                  <FieldLabel htmlFor="create-book-form-publishedYear">
                    Published Year <MandatoryFieldMarker />
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="create-book-form-publishedYear"
                    aria-invalid={fieldState.invalid}
                    placeholder="1954"
                    autoComplete="off"
                    type="number"
                    onChange={(e) => {
                      const val = e.target.valueAsNumber;
                      field.onChange(isNaN(val) ? undefined : val);
                    }}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <Separator className="my-4" />
          <FieldGroup>
            <Controller
              name="pageCount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-y-1">
                  <FieldLabel htmlFor="create-book-form-pageCount">
                    Page Count
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="create-book-form-pageCount"
                    aria-invalid={fieldState.invalid}
                    placeholder="432"
                    autoComplete="off"
                    type="number"
                    onChange={(e) => {
                      const val = e.target.valueAsNumber;
                      field.onChange(isNaN(val) ? undefined : val);
                    }}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="series"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-y-1">
                  <FieldLabel htmlFor="create-book-form-series">
                    Series
                  </FieldLabel>
                  <Input
                    {...field}
                    id="create-book-form-series"
                    aria-invalid={fieldState.invalid}
                    placeholder="Lord of the Rings"
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="seriesIndex"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-y-1">
                  <FieldLabel htmlFor="create-book-form-seriesIndex">
                    Series Index{" "}
                    <span className="text-muted-foreground text-xs">
                      (First book is index 1)
                    </span>
                  </FieldLabel>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    id="create-book-form-seriesIndex"
                    aria-invalid={fieldState.invalid}
                    placeholder="1"
                    autoComplete="off"
                    type="number"
                    onChange={(e) => {
                      const val = e.target.valueAsNumber;
                      field.onChange(isNaN(val) ? undefined : val);
                    }}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="isbn"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-y-1">
                  <FieldLabel htmlFor="create-book-form-isbn">
                    ISBN{" "}
                    <span className="text-muted-foreground text-xs">
                      {" "}
                      (10 or 13 digits)
                    </span>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="create-book-form-isbn"
                    aria-invalid={fieldState.invalid}
                    placeholder="9780007203543"
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="summary"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="gap-y-1">
                  <FieldLabel htmlFor="create-book-form-summary">
                    Summary
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="create-book-form-summary"
                    aria-invalid={fieldState.invalid}
                    placeholder={`Sauron, the Dark Lord, has gathered to him all the Rings of Power – the means by which he intends to rule Middle-earth. All he lacks in his plans for dominion is the One Ring – the ring that rules them all – which has fallen into the hands of the hobbit, Bilbo Baggins.

In a sleepy village in the Shire, young Frodo Baggins finds himself faced with an immense task, as his elderly cousin Bilbo entrusts the Ring to his care. Frodo must leave his home and make a perilous journey across Middle-earth to the Cracks of Doom, there to destroy the Ring and foil the Dark Lord in his evil purpose.`}
                    autoComplete="off"
                    className="h-48 resize-none overflow-y-auto"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
        {showUploadButton && (
          <div className="mt-4 flex flex-col items-start gap-y-2">
            <Label>Upload cover</Label>
            <UploadButton
              endpoint="imageUploader"
              onUploadError={(error: Error) => {
                toast.error("Upload failed");
                console.error(error);
              }}
              onClientUploadComplete={async (res) => {
                try {
                  const fileUrl = res[0].ufsUrl;
                  form.setValue("coverUrl", fileUrl);
                  console.log("Cover uploaded: ", res);
                  toast.success("Cover successfully uploaded.");
                  setShowUploadButton(false);
                } catch (err) {
                  toast.error("Something went wrong, try again.");
                  console.error(err);
                }
              }}
              className="ut-button:bg-primary ut-button:text-foreground"
            />
          </div>
        )}
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

const MandatoryFieldMarker = () => {
  return <span className="text-destructive">*</span>;
};

export default CreateBookForm;
