import { Controller, UseFormReturn } from "react-hook-form";
import { createFormSchema } from "@/lib/schemas/book";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import z from "zod";

interface OptionalInfoSectionProps {
  form: UseFormReturn<z.infer<typeof createFormSchema>>;
}

export const OptionalInfoSection = ({ form }: OptionalInfoSectionProps) => {
  return (
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
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="series"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor="create-book-form-series">Series</FieldLabel>
            <Input
              {...field}
              id="create-book-form-series"
              aria-invalid={fieldState.invalid}
              placeholder="Lord of the Rings"
              autoComplete="off"
            />
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
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
            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />
      <Controller
        name="summary"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-y-1">
            <FieldLabel htmlFor="create-book-form-summary">Summary</FieldLabel>
            <Textarea
              {...field}
              id="create-book-form-summary"
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
