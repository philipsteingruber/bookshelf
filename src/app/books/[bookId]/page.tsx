"use client";

import { use, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { TRPCError } from "@trpc/server";
import { PenIcon } from "lucide-react";
import { toast } from "sonner";

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
import { getStatusButtonStyle, parseReadStatus } from "@/lib/book-utils";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

export default function Page({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const { book, isPending, isForbidden, isNotFound, error, isReading } =
    useBook(bookId);
  const [imageError, setImageError] = useState(false);
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
            <div className="relative h-[600px] w-[400px] overflow-hidden rounded-[6px] bg-linear-to-br from-gray-100 to-gray-200">
              {imageError ? (
                <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-slate-200 via-slate-300 to-slate-400 p-12">
                  <div className="flex flex-col items-center gap-6 text-center">
                    <svg
                      className="h-32 w-32 text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                      />
                    </svg>
                    <p className="text-lg font-medium text-slate-600 line-clamp-4">
                      {book.title}
                    </p>
                  </div>
                </div>
              ) : (
                <Image
                  src={coverUrl}
                  alt={`${book.title} cover`}
                  width={400}
                  height={600}
                  className="rounded-[6px]"
                  placeholder="blur"
                  blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmMWY1ZjkiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMmU4ZjAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg=="
                  onError={() => setImageError(true)}
                />
              )}
            </div>
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
