"use client";

import { use, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import type { TRPCError } from "@trpc/server";
import { PenIcon } from "lucide-react";
import { toast } from "sonner";

import { ReadingProgressEstimateCard } from "@/components/books/book-details/reading-progress-estimate-card";
import ReadingProgressHistoryGraph from "@/components/books/book-details/reading-progress-history-graph";
import UpdateReadingProgressCard from "@/components/books/book-details/update-reading-progress-card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReadStatus } from "@/generated/prisma/enums";
import { useBook } from "@/hooks/use-book";
import { useReadingHistory } from "@/hooks/use-reading-history";
import { getStatusButtonStyle, parseReadStatus } from "@/lib/book-utils";
import {
  aggregateByDay,
  calculateTrendline,
  type ChartDataPoint,
  estimateCompletion,
} from "@/lib/chart-utils";
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
  const { result: readingHistory } = useReadingHistory(parseInt(bookId));

  // Calculate chart data and estimates
  const aggregatedData = aggregateByDay(readingHistory);
  const chartData: ChartDataPoint[] = aggregatedData.map((entry) => ({
    date: entry.createdAt,
    displayDate: "", // Not needed for calculation
    progress: entry.progress,
    progressSinceLast: entry.progressSinceLast,
    comments: entry.comments,
    fullDate: "",
    originalEntry: entry,
  }));

  const { slope } = calculateTrendline(chartData);
  const { estimatedDate, daysRemaining } = estimateCompletion(
    book?.progress ?? 0,
    slope,
    aggregatedData[aggregatedData.length - 1]?.createdAt ?? new Date(),
  );

  const [imageError, setImageError] = useState(false);
  const [pageCountLabelContent, setPageCountLabelContent] =
    useState<string>("");

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

  const { mutate: updateStatus, isPending: isUpdatingStatus } =
    trpc.book.updateReadingStatus.useMutation({
      onSuccess: (data) => {
        toast.success("Status updated successfully", {
          description: `${data.title} - ${data.author}`,
        });
        setIsReadingStatusDialogOpen(false);
        trpcUtils.book.getBook.invalidate(parseInt(bookId));
        trpcUtils.book.getBooks.invalidate();
      },
    });
  const { mutate: updatePageCount, isPending: isUpdatingPageCount } =
    trpc.book.updatePageCount.useMutation({
      onSuccess: () => trpcUtils.book.getBook.invalidate(parseInt(bookId)),
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
    <div className="flex h-full w-full flex-col items-center justify-center">
      <div className="flex h-full w-full justify-center px-8">
        <div className="flex w-3/4 justify-center gap-x-4">
          <div className="flex flex-col gap-y-4">
            <Link href={coverUrl} target="_blank" prefetch={false}>
              <div className="relative h-[600px] w-[400px] overflow-hidden rounded-md bg-linear-to-br from-gray-100 to-gray-200">
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
                      <p className="line-clamp-4 text-lg font-medium text-slate-600">
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
                    unoptimized
                    className="rounded-md"
                    placeholder="blur"
                    blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNmMWY1ZjkiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiNlMmU4ZjAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0idXJsKCNnKSIvPjwvc3ZnPg=="
                    onError={() => setImageError(true)}
                  />
                )}
              </div>
            </Link>
            <Dialog
              open={isReadingStatusDialogOpen}
              onOpenChange={(open) => {
                setIsReadingStatusDialogOpen(open);
                if (!open) {
                  setSelectedStatus(book.status);
                  setPageCountLabelContent("");
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
                {(selectedStatus === "READ" || selectedStatus == "READING") && (
                  <div className="flex flex-col">
                    <Separator className="my-4" />
                    <div className="mb-2 flex gap-x-2">
                      <Label htmlFor="pageCount">Page Count</Label>
                      <Input
                        id="pageCount"
                        value={pageCountLabelContent}
                        onChange={(e) =>
                          setPageCountLabelContent(e.target.value)
                        }
                        className="max-w-1/2"
                        placeholder={
                          book.pageCount.toString() || pageCountLabelContent
                        }
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
                      if (pageCountLabelContent) {
                        updatePageCount({
                          bookId: parseInt(bookId, 10),
                          newPageCount: parseInt(pageCountLabelContent),
                        });
                      }
                      updateStatus({
                        bookId: parseInt(bookId, 10),
                        newStatus: selectedStatus as ReadStatus,
                      });
                    }}
                    disabled={
                      isUpdatingPageCount ||
                      isUpdatingStatus ||
                      !selectedStatus ||
                      ((selectedStatus === "READ" ||
                        selectedStatus === "READING") &&
                        !book.pageCount &&
                        (!pageCountLabelContent ||
                          parseInt(pageCountLabelContent) <= 0))
                    }
                  >
                    {isUpdatingStatus || isUpdatingPageCount ? (
                      <Spinner />
                    ) : (
                      "Submit"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex w-3/4 flex-col gap-y-2">
            {book.series && book.seriesIndex && (
              <p className="font-serif text-sm font-light italic">{`${book.series} #${book.seriesIndex}`}</p>
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

            <span className="font-serif text-xl italic">{book.author}</span>
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
                <span className="text-sm font-semibold">
                  {book.publishedYear}
                </span>
              </span>
            </div>
            {isReading && (
              <div className="relative w-3/4">
                <Progress value={book.progress} className="h-6 rounded-xs" />
                <span className="absolute inset-0 flex items-center justify-center text-sm text-white">
                  {book.progress}% /{" "}
                  {`${Math.round((book.progress / 100) * book.pageCount)}/${book.pageCount} pages`}
                </span>
              </div>
            )}
            {isReading && <UpdateReadingProgressCard book={book} />}
            {book.summary && (
              <div
                className={cn(
                  "rounded-md border p-1 text-sm leading-5 font-normal text-pretty whitespace-pre-line shadow-md",
                  isReading ? "h-[40%] w-3/4" : "h-[57%] w-2/3",
                )}
              >
                {book.summary}
              </div>
            )}
          </div>
        </div>
      </div>
      {book.status !== "READ_NEXT" && book.status !== "TO_READ" && (
        <div className="flex w-full flex-col items-start justify-center gap-4 lg:flex-row">
          <ReadingProgressHistoryGraph readingHistory={readingHistory} />
          <ReadingProgressEstimateCard
            currentProgress={book.progress}
            estimatedDate={estimatedDate}
            daysRemaining={daysRemaining}
            slope={slope}
            pageCount={book.pageCount}
          />
        </div>
      )}
    </div>
  );
}
