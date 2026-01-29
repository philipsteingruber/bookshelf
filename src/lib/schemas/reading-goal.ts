import z from "zod";

export const setGoalSchema = z.object({
  goal: z
    .number()
    .int({ message: "Goal must be a whole number" })
    .positive({ message: "Goal must be at least 1" })
    .max(1000, { message: "Goal cannot exceed 1000" }),
});
