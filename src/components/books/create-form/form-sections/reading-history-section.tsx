"use client";

import { format } from "date-fns";
import type { UseFormReturn } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import type z from "zod";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StarRating } from "@/components/ui/star-rating";
import type { createBookInputSchema } from "@/lib/schemas/book";
import { cn } from "@/lib/utils";

interface ReadingHistorySectionProps {
  form: UseFormReturn<z.infer<typeof createBookInputSchema>>;
  disabled?: boolean;
}

export const ReadingHistorySection = ({
  form,
  disabled = false,
}: ReadingHistorySectionProps): React.ReactElement => {
  const alreadyRead = useWatch({ control: form.control, name: "alreadyRead" });
  const today = format(new Date(), "yyyy-MM-dd");
  const finishedAtValue = useWatch({
    control: form.control,
    name: "finishedAt",
  });
  const startedAtMax = finishedAtValue
    ? format(finishedAtValue, "yyyy-MM-dd")
    : today;

  return (
    <div className="rounded-md border p-4">
      <p className="mb-3 text-sm font-semibold">Reading History</p>
      <Controller
        name="alreadyRead"
        control={form.control}
        render={({ field }) => (
          <div className="flex items-center gap-x-2">
            <Checkbox
              id="create-book-form-alreadyRead"
              checked={field.value ?? false}
              onCheckedChange={field.onChange}
              disabled={disabled}
            />
            <label
              htmlFor="create-book-form-alreadyRead"
              className="cursor-pointer text-sm font-medium"
            >
              I&apos;ve already read this book
            </label>
          </div>
        )}
      />
      {alreadyRead && (
        <FieldGroup className="mt-4 gap-y-1">
          <Controller
            name="finishedAt"
            control={form.control}
            disabled={disabled}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-y-1">
                <FieldLabel htmlFor="create-book-form-finishedAt">
                  Finished Date{" "}
                  <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="create-book-form-finishedAt"
                  type="date"
                  max={today}
                  disabled={disabled}
                  aria-invalid={fieldState.invalid}
                  value={
                    field.value ? format(field.value, "yyyy-MM-dd") : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(
                      val ? new Date(`${val}T12:00:00`) : undefined,
                    );
                  }}
                />
                <p
                  className={cn(
                    "text-sm text-destructive",
                    !fieldState.error && "invisible",
                  )}
                >
                  {fieldState.error?.message ?? "\u00A0"}
                </p>
              </Field>
            )}
          />
          <Controller
            name="startedAt"
            control={form.control}
            disabled={disabled}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-y-1">
                <FieldLabel htmlFor="create-book-form-startedAt">
                  Started Date{" "}
                  <span className="text-muted-foreground text-xs">
                    (optional)
                  </span>
                </FieldLabel>
                <Input
                  id="create-book-form-startedAt"
                  type="date"
                  max={startedAtMax}
                  disabled={disabled}
                  aria-invalid={fieldState.invalid}
                  value={
                    field.value ? format(field.value, "yyyy-MM-dd") : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    field.onChange(
                      val ? new Date(`${val}T12:00:00`) : undefined,
                    );
                  }}
                />
                <p
                  className={cn(
                    "text-sm text-destructive",
                    !fieldState.error && "invisible",
                  )}
                >
                  {fieldState.error?.message ?? "\u00A0"}
                </p>
              </Field>
            )}
          />
          <Controller
            name="rating"
            control={form.control}
            render={({ field }) => (
              <Field className="gap-y-1">
                <FieldLabel>
                  Rating{" "}
                  <span className="text-muted-foreground text-xs">
                    (optional)
                  </span>
                </FieldLabel>
                <StarRating
                  value={field.value ?? null}
                  onChange={field.onChange}
                  readOnly={disabled}
                />
              </Field>
            )}
          />
        </FieldGroup>
      )}
    </div>
  );
};
