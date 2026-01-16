"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import z from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface SetGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentGoal: number;
  onSave: (newGoal: number) => Promise<void>;
  isSaving: boolean;
}

const setGoalSchema = z.object({
  goal: z
    .number()
    .int({ message: "Goal must be a whole number" })
    .positive({ message: "Goal must be at least 1" })
    .max(1000, { message: "Goal cannot exceed 1000" }),
});

type SetGoalFormValues = z.infer<typeof setGoalSchema>;

const SetGoalDialog = ({
  currentGoal,
  isSaving,
  onOpenChange,
  onSave,
  open,
}: SetGoalDialogProps) => {
  const form = useForm<SetGoalFormValues>({
    resolver: zodResolver(setGoalSchema),
    defaultValues: { goal: currentGoal },
  });

  useEffect(() => {
    if (open) {
      form.reset({ goal: currentGoal });
    }
  }, [open, currentGoal, form]);

  const onSubmit = async (data: SetGoalFormValues) => {
    await onSave(data.goal);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!isSaving) {
          onOpenChange(newOpen);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Reading Goal</DialogTitle>
          <DialogDescription>
            How many books do you want to read this year?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Controller
            name="goal"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="goal-input">Books to read</FieldLabel>
                <Input
                  {...field}
                  id="goal-input"
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const val = e.target.valueAsNumber;
                    field.onChange(isNaN(val) ? undefined : val);
                  }}
                />
                {fieldState.error && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <DialogFooter className="mt-4 gap-2">
            <Button
              type="button"
              variant={"outline"}
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Spinner className="mr-2 size-4" />}
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SetGoalDialog;
