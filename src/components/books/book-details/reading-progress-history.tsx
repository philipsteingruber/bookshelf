import { Card, CardContent } from "@/components/ui/card";
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

const ReadingProgressHistory = ({
  readingProgressHistory,
  book,
}: {
  readingProgressHistory: ReadingProgressWithProgressSinceLast[];
  book: Book;
}) => {
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
    <Card className="border-primary h-full overflow-auto border-2">
      <CardContent>
        <Table>
          <TableHeader className="text-lg font-semibold">{`Reading progress for ${book.title}`}</TableHeader>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Progress</TableHead>
              <TableHead className="font-semibold">
                Progress since last (%)
              </TableHead>
              <TableHead className="font-semibold">
                Progress since last (pages)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyForBook.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatRelativeDate(entry.createdAt)}</TableCell>
                <TableCell>{entry.progress}</TableCell>
                <TableCell>{entry.progressSinceLast}</TableCell>
                <TableCell>
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
