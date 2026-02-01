"use client";

import { columns } from "@/components/reading-goals/reading-goal-columns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DataTable from "@/components/ui/data-table";
import type { EnrichedGoalHistoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const ReadingGoalHistoryTable = ({
  data,
  className,
}: {
  data: EnrichedGoalHistoryEntry[];
  className?: string;
}): React.ReactElement => {
  return (
    <Card className={cn("h-full w-full", className)}>
      <CardHeader className="h-full w-full">
        <CardTitle className="h-full w-full items-center justify-center text-center">
          Goal History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={data} />
      </CardContent>
    </Card>
  );
};

export default ReadingGoalHistoryTable;
