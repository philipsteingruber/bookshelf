import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Book } from "@/generated/prisma/client";
import type { ReadingProgressWithProgressSinceLast } from "@/hooks/use-reading-history";
import { calculatePagesFromProgress } from "@/lib/book-utils";
import { formatRelativeDate } from "@/lib/chart-utils";

const ReadingProgressHistory = ({
  readingProgressHistory,
  book,
}: {
  readingProgressHistory: ReadingProgressWithProgressSinceLast[];
  book: Book;
}) => {
  const historyForBook = readingProgressHistory.filter(
    (entry) => entry.bookId === book.id,
  );

  return (
    <Card className="w-1/4 p-2">
      <CardContent>
        <Table>
          <TableCaption>{`Reading Progress for ${book.title}`}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Progress since last (%)</TableHead>
              <TableHead>Progress since last (pages)</TableHead>
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
