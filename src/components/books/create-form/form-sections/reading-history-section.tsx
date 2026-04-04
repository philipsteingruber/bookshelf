"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import type z from "zod";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const finishedAtValue = useWatch({
    control: form.control,
    name: "finishedAt",
  });
  const today = new Date();

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
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-y-1">
                <FieldLabel>
                  Finished Date <span className="text-destructive">*</span>
                </FieldLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      aria-invalid={fieldState.invalid}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !field.value && "text-muted-foreground",
                        fieldState.invalid && "border-destructive",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value
                        ? format(field.value, "d MMMM yyyy")
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => field.onChange(date ?? undefined)}
                      disabled={(date) => date > today}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
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
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid} className="gap-y-1">
                <FieldLabel>
                  Started Date{" "}
                  <span className="text-muted-foreground text-xs">
                    (optional)
                  </span>
                </FieldLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      aria-invalid={fieldState.invalid}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !field.value && "text-muted-foreground",
                        fieldState.invalid && "border-destructive",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value
                        ? format(field.value, "d MMMM yyyy")
                        : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => field.onChange(date ?? undefined)}
                      disabled={(date) =>
                        date > (finishedAtValue ?? today)
                      }
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
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
