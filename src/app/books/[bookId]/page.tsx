"use client";

import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ReadStatus } from "@/generated/prisma/enums";
import { useBook } from "@/hooks/use-book";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/utils/constants";
import { getStatusButtonStyle, parseReadStatus } from "@/utils/utils";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { TRPCError } from "@trpc/server";
import { PenIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";

export default function Page({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const { book, isPending, isForbidden, isNotFound, error, isReading } =
    useBook(bookId);
  const coverUrl = book?.coverUrl || BOOK_COVER_PLACEHOLDER_URL;
  const statusOptions: ReadStatus[] = [
    "TO_READ",
    "READ_NEXT",
    "READING",
    "READ",
    "DNF",
  ];

  const trpcUtils = trpc.useUtils();

  const [selectedStatus, setSelectedStatus] = useState<ReadStatus | undefined>(
    book?.status,
  );
  const [isReadingStatusDialogOpen, setIsReadingStatusDialogOpen] =
    useState<boolean>(false);

  const { mutate: updateStatus } = trpc.book.updateReadingStatus.useMutation({
    onSuccess: (data) => {
      toast.success("Status updated successfully", {
        description: `${data.title} - ${data.author}`,
      });
      setIsReadingStatusDialogOpen(false);
      trpcUtils.book.getBook.invalidate(parseInt(bookId));
    },
  });

  const { isSignedIn } = useAuth();
  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  if (isPending) {
    return <LoadingState />;
  }
  if (isForbidden || isNotFound) {
    const err = error as TRPCError;
    return <ErrorState code={err.code} />;
  }
  if (isNotFound || !book) {
    return <ErrorState code="NOT_FOUND" />;
  }

  return (
    <div className="flex h-full w-full justify-center">
      <div className="flex w-2/3 justify-center gap-x-4">
        <div className="flex flex-col gap-y-4">
          <Link href={coverUrl} target="_blank">
            <Image
              src={coverUrl}
              alt={`${book.title} cover`}
              width={400}
              height={600}
              className="rounded-[6px]"
            />
          </Link>
          <Dialog
            open={isReadingStatusDialogOpen}
            onOpenChange={setIsReadingStatusDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                className={cn(
                  getStatusButtonStyle(book.status),
                  "h-8 w-full cursor-pointer rounded-[5px]",
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
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant={"outline"}>Cancel</Button>
                </DialogClose>
                <Button
                  className="w-1/4 cursor-pointer"
                  onClick={() => {
                    if (selectedStatus === "READ" && !book.pageCount) {
                      toast.error(
                        "Page count needs to be set before marking book as read.",
                      );
                      return;
                    }

                    updateStatus({
                      bookId: parseInt(bookId),
                      newStatus: selectedStatus as ReadStatus,
                    });
                  }}
                >
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex w-2/3 flex-col gap-y-2">
          {book.series && book.seriesIndex && (
            <p className="font-sm font-serif font-light italic">{`${book.series} #${book.seriesIndex}`}</p>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`https://www.goodreads.com/search?utf8=%E2%9C%93&q=${book.title}+${book.author}&search_type=books&search%5Bfield%5D=on`}
                target="_blank"
                className="w-fit font-serif text-4xl font-semibold hover:underline"
              >
                {book.title}
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              <p>{`Search "${book.title} ${book.author}" on GoodReads`}</p>
            </TooltipContent>
          </Tooltip>

          <span className="font-serif text-xl">{book.author}</span>
          <div className="text-primary flex items-center gap-x-4">
            <div className="group flex cursor-pointer items-center gap-x-1 text-sm font-semibold">
              <span className="group-hover:underline">
                {book.pageCount ? `${book.pageCount} pages` : "Pages not set"}
              </span>
              <PenIcon className="size-3" />
            </div>
            <span className="text-secondary align-middle">•</span>
            <span className="text-sm">
              Published{" "}
              <span className="text-sm italic">{book.publishedYear}</span>
            </span>
          </div>
          {isReading && (
            <div className="relative w-3/4">
              <Progress value={book.progress} className="h-6 rounded-xs" />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-white">
                {book.progress}%
              </span>
            </div>
          )}
          <div className="w-3/4 text-xs leading-5 font-semibold text-pretty whitespace-pre-line">
            {book.summary || ""}
          </div>
        </div>
      </div>
    </div>
  );
}
