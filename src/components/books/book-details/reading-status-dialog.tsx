"use client";

import React, { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { Book } from "@/generated/prisma/client";
import type { ReadStatus } from "@/generated/prisma/enums";
import { useDialogState } from "@/hooks/use-dialog-state";
import { getStatusButtonStyle, parseReadStatus } from "@/lib/book-utils";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

interface ReadingStatusDialogProps {
  book: Book;
}

const ReadingStatusDialog = ({
  book,
}: ReadingStatusDialogProps): React.ReactElement => {
  const statusOptions: ReadStatus[] = [
    "TO_READ",
    "READ_NEXT",
    "READING",
    "READ",
    "DNF",
  ];

  const [selectedStatus, setSelectedStatus] = useState<ReadStatus>(book.status);
  const [pageCountInput, setPageCountInput] = useState("");

  const trpcUtils = trpc.useUtils();
  const { mutate: updateStatus, isPending: isUpdatingStatus } =
    trpc.book.updateReadingStatus.useMutation({
      onSuccess: (data) => {
        toast.success("Status updated successfully", {
          description: `${data.updatedBook.title} - ${data.updatedBook.author}`,
        });
        setIsReadingStatusDialogOpen(false);
        trpcUtils.book.getBook.invalidate(book.id);
        trpcUtils.book.getBooks.invalidate();
      },
    });
  const { mutate: updatePageCount, isPending: isUpdatingPageCount } =
    trpc.book.updatePageCount.useMutation({
      onSuccess: () => trpcUtils.book.getBook.invalidate(book.id),
    });

  const {
    isOpen: isReadingStatusDialogOpen,
    handleOpenChange: handleOpenReadingStatusDialogChange,
    setIsOpen: setIsReadingStatusDialogOpen,
  } = useDialogState({ preventClose: isUpdatingStatus });

  return (
    <Dialog
      open={isReadingStatusDialogOpen}
      onOpenChange={(open) => {
        handleOpenReadingStatusDialogChange(open);
        if (!open) {
          setSelectedStatus(book.status);
          setPageCountInput("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          className={cn(
            getStatusButtonStyle(book.status),
            "h-8 w-full cursor-pointer rounded-md",
          )}
        >
          {parseReadStatus(book.status)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="flex flex-col items-center justify-center">
          Change Reading Status
          <Separator className="my-6" />
        </DialogTitle>
        <RadioGroup
          defaultValue={book.status}
          onValueChange={(val) => setSelectedStatus(val as ReadStatus)}
        >
          {statusOptions.map((status, index) => (
            <div className="flex items-center gap-x-2" key={status}>
              <RadioGroupItem
                value={status}
                id={"r" + index}
                className="cursor-pointer"
              />
              <Label htmlFor={"r" + index} className="cursor-pointer">
                {parseReadStatus(status)}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {(selectedStatus === "READ" || selectedStatus === "READING") && (
          <div className="flex flex-col">
            <Separator className="my-4" />
            <div className="mb-2 flex gap-x-2">
              <Label htmlFor="pageCount">Page Count</Label>
              <Input
                id="pageCount"
                value={pageCountInput}
                onChange={(e) => setPageCountInput(e.target.value)}
                className="max-w-1/2"
                placeholder={book.pageCount.toString() || pageCountInput}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant={"outline"}>Cancel</Button>
          </DialogClose>
          <Button
            className="w-1/4 cursor-pointer"
            onClick={() => {
              if (pageCountInput) {
                updatePageCount({
                  bookId: book.id,
                  newPageCount: parseInt(pageCountInput),
                });
              }
              updateStatus({
                bookId: book.id,
                newStatus: selectedStatus as ReadStatus,
              });
            }}
            disabled={
              isUpdatingPageCount ||
              isUpdatingStatus ||
              !selectedStatus ||
              ((selectedStatus === "READ" || selectedStatus === "READING") &&
                !book.pageCount &&
                (!pageCountInput || parseInt(pageCountInput) <= 0))
            }
          >
            {isUpdatingStatus || isUpdatingPageCount ? <Spinner /> : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReadingStatusDialog;
