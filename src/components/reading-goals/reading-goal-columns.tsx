"use client";

import type { ColumnDef } from "@tanstack/react-table";

import type { EnrichedGoalHistoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const columns: ColumnDef<EnrichedGoalHistoryEntry>[] = [
  { accessorKey: "year", header: "Year" },
  {
    accessorKey: "goal",
    header: "Goal",
    cell: ({ row }) => {
      const goal = row.getValue("goal");
      return goal === 0 ? "—" : goal;
    },
  },
  {
    accessorKey: "expectedAtThisPoint",
    header: "Expected",
    cell: ({ row }) => {
      const expected = row.getValue("expectedAtThisPoint") as number | null;

      if (expected === null) {
        return <span className="text-muted-foreground">—</span>;
      }

      return expected;
    },
  },
  { accessorKey: "actual", header: "Actual" },
  {
    accessorKey: "progressPercentage",
    header: "Progress",
    cell: ({ row }) => {
      const progress = row.getValue("progressPercentage") as number | null;

      if (progress === null) {
        return <span className="text-muted-foreground">—</span>;
      }

      return (
        <span
          className={cn(
            progress >= 100 && "text-green-600 dark:text-green-400",
            progress >= 50 &&
              progress < 100 &&
              "text-yellow-600 dark:text-yellow-400",
            progress < 50 && "text-red-600 dark:text-red-400",
          )}
        >
          {progress}%
        </span>
      );
    },
  },
  {
    accessorKey: "difference",
    header: "vs Goal",
    cell: ({ row }) => {
      const difference = row.getValue("difference") as number;
      const goal = row.original.goal;

      if (goal === 0) {
        return <span className="text-muted-foreground">—</span>;
      }

      const isPositive = difference > 0;
      const isNegative = difference < 0;

      return (
        <span
          className={cn(
            isPositive && "text-green-600 dark:text-green-400",
            isNegative && "text-red-600 dark:text-red-400",
          )}
        >
          {isPositive && "+"}
          {difference}
        </span>
      );
    },
  },
  {
    accessorKey: "differenceFromPrevious",
    header: "vs Prev Year",
    cell: ({ row }) => {
      const diff = row.getValue("differenceFromPrevious") as number | null;

      if (diff === null) {
        return <span className="text-muted-foreground">—</span>;
      }

      const isPositive = diff > 0;
      const isNegative = diff < 0;

      return (
        <span
          className={cn(
            isPositive && "text-green-600 dark:text-green-400",
            isNegative && "text-red-600 dark:text-red-400",
          )}
        >
          {isPositive && "+"}
          {diff}
        </span>
      );
    },
  },
];
