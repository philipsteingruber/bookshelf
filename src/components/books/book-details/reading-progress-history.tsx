import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Book } from "@/generated/prisma/client";
import type { ReadingProgressWithProgressSinceLast } from "@/hooks/use-reading-history";
import { calculatePagesFromProgress } from "@/lib/book-utils";
import { aggregateByDay, formatRelativeDate } from "@/lib/chart-utils";
import { cn } from "@/lib/utils";

const ReadingProgressHistory = ({
  readingProgressHistory,
  book,
}: {
  readingProgressHistory: ReadingProgressWithProgressSinceLast[];
  book: Book;
}): React.ReactElement => {
  const aggregatedHistory = aggregateByDay(
    readingProgressHistory.filter((entry) => entry.bookId === book.id),
  );

  // Recalculate progressSinceLast based on aggregated data
  // (the original values were calculated before aggregation, so they're incorrect)
  const historyForBook = aggregatedHistory.map((entry, index) => ({
    ...entry,
    progressSinceLast:
      index === 0
        ? entry.progress
        : entry.progress - aggregatedHistory[index - 1].progress,
  }));

  return (
    <Card
      className={cn(
        "border-primary h-full flex-2 overflow-auto border-2",
        historyForBook.length <= 6 && "lg:overflow-y-hidden",
      )}
    >
      <CardHeader>
        <CardTitle className="text-lg">{`Reading progress for ${book.title}`}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Total Progress</TableHead>
              <TableHead className="font-semibold">Progress (%)</TableHead>
              <TableHead className="hidden font-semibold md:block">
                Progress (pages)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyForBook.toReversed().map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatRelativeDate(entry.createdAt)}</TableCell>
                <TableCell className="text-center font-semibold">
                  {entry.progress}
                </TableCell>
                <TableCell className="text-center">
                  {entry.progressSinceLast}
                </TableCell>
                <TableCell className="hidden text-center md:block">
                  {calculatePagesFromProgress(
                    entry.progressSinceLast,
                    book.pageCount,
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default ReadingProgressHistory;
