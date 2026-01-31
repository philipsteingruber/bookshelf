"use client";

import { useState } from "react";

import { TrashIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Book } from "@/generated/prisma/client";
import { useDialogState } from "@/hooks/ui";
import { calculatePagesFromProgress } from "@/lib/book";
import { handleTRPCError } from "@/lib/common";
import { aggregateByDay, formatRelativeDate } from "@/lib/reading";
import type { ReadingProgressWithProgressSinceLast } from "@/lib/types";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

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

  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  const trpcUtils = trpc.useUtils();
  const { mutate: deleteReadingProgress, isPending: isDeleting } =
    trpc.readingProgress.deleteReadingProgressInstance.useMutation({
      onSuccess: () => {
        setIsDeleteReadingProgressDialogOpen(false);
        toast.success("Progress successfully deleted");
        trpcUtils.book.getBook.invalidate(book.id);
        trpcUtils.readingProgress.getProgressHistory.invalidate(book.id);
      },
      onError: (error) => {
        handleTRPCError(error);
      },
    });

  const {
    setIsOpen: setIsDeleteReadingProgressDialogOpen,
    isOpen: isDeleteReadingProgressDialogOpen,
    handleOpenChange: handleDeleteReadingProgressDialogOpenChange,
  } = useDialogState({
    preventClose: isDeleting,
  });

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
        <Dialog
          open={isDeleteReadingProgressDialogOpen}
          onOpenChange={handleDeleteReadingProgressDialogOpenChange}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete progress?</DialogTitle>
              <DialogDescription className="flex flex-col gap-y-1">
                {readingProgressHistory.length === 1 &&
                  book.status !== "DNF" &&
                  book.status !== "READ" && (
                    <span>
                      This will reset progress to 0 and set status to To Read
                    </span>
                  )}
                {readingProgressHistory.length === 1 &&
                  (book.status === "DNF" || book.status === "READ") && (
                    <span>This will reset progress to 0.</span>
                  )}
                <span className="text-destructive">This cannot be undone.</span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant={"outline"}
                disabled={isDeleting}
                onClick={() =>
                  handleDeleteReadingProgressDialogOpenChange(false)
                }
              >
                Cancel
              </Button>
              <Button
                variant={"destructive"}
                disabled={isDeleting || !entryToDelete}
                onClick={() =>
                  entryToDelete && deleteReadingProgress(entryToDelete)
                }
              >
                {isDeleting ? <Spinner /> : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                <TableCell>
                  <Button
                    variant={"destructive"}
                    size={"icon"}
                    onClick={() => {
                      setEntryToDelete(entry.id);
                      setIsDeleteReadingProgressDialogOpen(true);
                    }}
                  >
                    <TrashIcon />
                  </Button>
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
