import type { RefObject } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type z from "zod";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { createFormSchema } from "@/lib/schemas/book";

interface BasicInfoSectionProps {
  form: UseFormReturn<z.infer<typeof createFormSchema>>;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  idPrefix?: "create" | "edit";
  disabled?: boolean;
}

const MandatoryFieldMarker = (): React.ReactElement => {
  return <span className="text-destructive">*</span>;
};

export const BasicInfoSection = ({
  form,
  titleInputRef,
  idPrefix = "create",
  disabled = false,
}: BasicInfoSectionProps): React.ReactElement => {
  return (
    <FieldGroup className="gap-y-1">
      <Controller
        name="title"
        control={form.control}
        disabled={disabled}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-book-form-title`}>
              Title <MandatoryFieldMarker />
            </FieldLabel>
            <Input
              {...field}
              id={`${idPrefix}-book-form-title`}
              ref={(node) => {
                field.ref(node);
                if (titleInputRef) titleInputRef.current = node;
              }}
              aria-invalid={fieldState.invalid}
              placeholder="Fellowship of the Ring"
              autoComplete="off"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="author"
        disabled={disabled}
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${idPrefix}-book-form-author`}>
              Author <MandatoryFieldMarker />
            </FieldLabel>
            <Input
              {...field}
              id={`${idPrefix}-book-form-author`}
              aria-invalid={fieldState.invalid}
              placeholder="J.R.R. Tolkien"
              autoComplete="off"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  );
};
