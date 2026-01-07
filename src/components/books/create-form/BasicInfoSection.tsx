import { Controller, UseFormReturn } from "react-hook-form";
import { createFormSchema } from "@/lib/schemas/book";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import z from "zod";

interface BasicInfoSectionProps {
  form: UseFormReturn<z.infer<typeof createFormSchema>>;
}

const MandatoryFieldMarker = () => {
  return <span className="text-destructive">*</span>;
};

export const BasicInfoSection = ({ form }: BasicInfoSectionProps) => {
  return (
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
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
    </FieldGroup>
  );
};
