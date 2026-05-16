import { useRef } from "react";

import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type z from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { createFormSchema } from "@/lib/schemas/book";

import { SeriesCombobox } from "./series-combobox";

interface OptionalInfoSectionProps {
  form: UseFormReturn<z.infer<typeof createFormSchema>>;
  idPrefix?: "create" | "edit";
  disabled?: boolean;
  onKepubSelect?: (file: File) => void;
  isProcessingKepub?: boolean;
}

export const OptionalInfoSection = ({
  form,
  idPrefix = "create",
  disabled = false,
  onKepubSelect,
  isProcessingKepub = false,
}: OptionalInfoSectionProps): React.ReactElement => {
  const kepubInputRef = useRef<HTMLInputElement>(null);
  return (
    <FieldGroup className="gap-y-1">
      <Controller
        name="publishedYear"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-publishedYear`}>Published Year</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-book-form-publishedYear`}
              aria-invalid={fieldState.invalid}
              placeholder="1954"
              autoComplete="off"
              type="number"
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                field.onChange(isNaN(val) ? undefined : val);
              }}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="pageCount"
        control={form.control}
        disabled={disabled || isProcessingKepub}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-pageCount`}>Page Count</FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-book-form-pageCount`}
              aria-invalid={fieldState.invalid}
              placeholder="432"
              autoComplete="off"
              type="number"
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                field.onChange(isNaN(val) ? undefined : val);
              }}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            {onKepubSelect && (
              <div className="flex items-center gap-x-2">
                <input
                  ref={kepubInputRef}
                  type="file"
                  accept=".kepub,.epub"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onKepubSelect(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  disabled={disabled || isProcessingKepub}
                  onClick={() => kepubInputRef.current?.click()}
                  className="h-auto p-0 text-xs"
                >
                  {isProcessingKepub ? (
                    <span className="flex items-center gap-x-1">
                      <Spinner className="size-3" /> Estimating pages…
                    </span>
                  ) : (
                    "Estimate from KEPUB / EPUB file"
                  )}
                </Button>
              </div>
            )}
          </Field>
        )}
      />
      <Controller
        name="series"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-series`}>Series</FieldLabel>
            <SeriesCombobox
              id={`${idPrefix}-book-form-series`}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={disabled}
              aria-invalid={fieldState.invalid}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="seriesIndex"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-seriesIndex`}>
              Series Index{" "}
              <span className="text-muted-foreground text-xs">
                (First book is index 1, decimals allowed for short stories etc)
              </span>
            </FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-book-form-seriesIndex`}
              aria-invalid={fieldState.invalid}
              placeholder="1"
              autoComplete="off"
              type="number"
              step={0.1}
              onChange={(e) => {
                const val = e.target.valueAsNumber;
                field.onChange(isNaN(val) ? undefined : val);
              }}
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="isbn"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-isbn`}>
              ISBN <span className="text-muted-foreground text-xs"> (10 or 13 digits)</span>
            </FieldLabel>
            <Input
              {...field}
              value={field.value ?? ""}
              id={`${idPrefix}-book-form-isbn`}
              aria-invalid={fieldState.invalid}
              placeholder="9780007203543"
              autoComplete="off"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="summary"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor={`${idPrefix}-book-form-summary`}>Summary</FieldLabel>
            <Textarea
              {...field}
              id={`${idPrefix}-book-form-summary`}
              aria-invalid={fieldState.invalid}
              placeholder={`Sauron, the Dark Lord, has gathered to him all the Rings of Power – the means by which he intends to rule Middle-earth. All he lacks in his plans for dominion is the One Ring – the ring that rules them all – which has fallen into the hands of the hobbit, Bilbo Baggins.

In a sleepy village in the Shire, young Frodo Baggins finds himself faced with an immense task, as his elderly cousin Bilbo entrusts the Ring to his care. Frodo must leave his home and make a perilous journey across Middle-earth to the Cracks of Doom, there to destroy the Ring and foil the Dark Lord in his evil purpose.`}
              autoComplete="off"
              className="h-48 resize-none overflow-y-auto"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  );
};
