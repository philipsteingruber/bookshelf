"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import type { TRPCError } from "@trpc/server";
import { PenIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";

import BookDetailsCover from "@/components/books/book-details/book-details-cover";
import { ReadingProgressEstimateCard } from "@/components/books/book-details/reading-progress-estimate-card";
import ReadingProgressHistory from "@/components/books/book-details/reading-progress-history";
import ReadingProgressHistoryGraph from "@/components/books/book-details/reading-progress-history-graph";
import UpdateReadingProgressCard from "@/components/books/book-details/update-reading-progress-card";
import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
import { useDialogState } from "@/hooks/use-dialog-state";
import { useReadingHistory } from "@/hooks/use-reading-history";
import { getStatusButtonStyle, parseReadStatus } from "@/lib/book-utils";
import {
  aggregateByDay,
  calculateAveragePace,
  calculateTrendline,
  type ChartDataPoint,
  estimateCompletion,
} from "@/lib/chart-utils";
import { handleTRPCError } from "@/lib/error-handler";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";

const Page = ({
  params,
}: {
  params: Promise<{ bookId: string }>;
}): React.ReactElement => {
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

  const [pageCountLabelContent, setPageCountLabelContent] =
    useState<string>("");

  const router = useRouter();

  const { mutate: deleteBook, isPending: isDeleting } =
    trpc.book.deleteBook.useMutation({
      onSuccess: () => {
        toast.success(`Deleted ${book ? book.title : "book"} from BookShelf`, {
          duration: 5000,
        });
        router.replace("/dashboard");
      },
      onError: (error) => {
        handleTRPCError(error);
      },
    });

  const { mutate: updateStatus, isPending: isUpdatingStatus } =
    trpc.book.updateReadingStatus.useMutation({
      onSuccess: (data) => {
        toast.success("Status updated successfully", {
          description: `${data.updatedBook.title} - ${data.updatedBook.author}`,
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

  const {
    isOpen: isDeleteDialogOpen,
    handleOpenChange: handleOpenDeleteDialogChange,
    setIsOpen: setIsDeleteDialogOpen,
  } = useDialogState({
    preventClose: isDeleting,
  });
  const {
    isOpen: isReadingStatusDialogOpen,
    handleOpenChange: handleOpenReadingStatusDialogChange,
    setIsOpen: setIsReadingStatusDialogOpen,
  } = useDialogState({ preventClose: isUpdatingStatus });

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

  const { isSignedIn, isLoaded } = useAuth();

  const averagePace = calculateAveragePace(readingHistory);

  // Show loading state until Clerk has loaded - ensures server/client render the same thing
  if (!isLoaded || isPending) {
    return <LoadingState />;
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }
  if (isForbidden || isNotFound) {
    const err = error as TRPCError;
    return <ErrorState code={err.code} />;
  }
  if (isNotFound || !book) {
    return <ErrorState code="NOT_FOUND" />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-4 lg:px-0">
      <div className="flex h-full w-full flex-col justify-center px-4 lg:flex-row lg:px-8">
        <div className="flex w-full flex-col items-center gap-y-4 lg:w-3/4 lg:flex-row lg:items-start lg:gap-x-4">
          <div className="flex flex-col gap-y-4">
            <BookDetailsCover book={book} />
            <Dialog
              open={isReadingStatusDialogOpen}
              onOpenChange={(open) => {
                handleOpenReadingStatusDialogChange(open);
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
          <div className="flex w-full flex-col gap-y-2 lg:w-3/4">
            {book.series && book.seriesIndex && (
              <p className="font-serif text-sm font-light italic">{`${book.series} #${book.seriesIndex}`}</p>
            )}
            <div className="flex w-3/4 items-center justify-between gap-x-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`https://www.goodreads.com/search?utf8=%E2%9C%93&q=${book.title}+${book.author}&search_type=books&search%5Bfield%5D=on`}
                    target="_blank"
                    className="w-fit font-serif text-4xl font-semibold whitespace-nowrap hover:underline"
                  >
                    {book.title}
                  </Link>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{`Search "${book.title} ${book.author}" on GoodReads`}</p>
                </TooltipContent>
              </Tooltip>
              <div className="flex gap-x-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => router.push(`/books/${bookId}/edit`)}
                    >
                      <PenIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit book details</TooltipContent>
                </Tooltip>
                <Dialog
                  open={isDeleteDialogOpen}
                  onOpenChange={handleOpenDeleteDialogChange}
                >
                  <Tooltip>
                    <DialogTrigger asChild>
                      <TooltipTrigger asChild>
                        <Button className="bg-destructive/90 text-foreground hover:bg-destructive/70 hover:text-muted-foreground transition-colors">
                          <TrashIcon />
                        </Button>
                      </TooltipTrigger>
                    </DialogTrigger>
                    <TooltipContent>
                      <p>{`Delete '${book.title}' from BookShelf`}</p>
                    </TooltipContent>
                  </Tooltip>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{`Delete '${book.title}'?`}</DialogTitle>
                      <DialogDescription>{`This will permanently delete '${book.title}' and all its reading progress from your BookShelf. This cannot be undone.`}</DialogDescription>
                    </DialogHeader>
                    <div className="flex w-full flex-col gap-y-4 lg:flex-row lg:gap-x-4">
                      <Button
                        onClick={() => setIsDeleteDialogOpen(false)}
                        variant={"outline"}
                        disabled={isDeleting}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => deleteBook(book.id)}
                        variant={"destructive"}
                        disabled={isDeleting}
                        className="flex-1"
                      >
                        {isDeleting ? <Spinner /> : "Confirm"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <span className="font-serif text-xl italic">{book.author}</span>
            <div className="text-primary flex items-center gap-x-4">
              <div className="group flex cursor-pointer items-center gap-x-1 text-sm font-semibold">
                <span className="group-hover:underline">
                  {book.pageCount ? `${book.pageCount} pages` : "Pages not set"}
                </span>
                <PenIcon className="size-3" />
              </div>
              <span className="text-secondary align-middle">•</span>
              {book.publishedYear ? (
                <span className="text-sm">
                  Published{" "}
                  <span className="text-sm font-semibold">
                    {book.publishedYear}
                  </span>
                </span>
              ) : (
                <span className="text-sm font-semibold">
                  Unknown publishing year
                </span>
              )}
            </div>
            {isReading && (
              <div className="relative w-full lg:w-3/4">
                <Progress value={book.progress} className="h-6 rounded-md" />
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
                  "rounded-md p-1 text-sm leading-5 font-normal text-pretty whitespace-pre-line",
                  isReading
                    ? "h-auto max-h-[35%] w-full overflow-y-auto lg:w-3/4"
                    : "h-auto w-full max-w-full lg:w-2/3 lg:max-w-[57%]",
                )}
              >
                {book.summary}
              </div>
            )}
          </div>
        </div>
      </div>
      {book.status !== "READ_NEXT" && book.status !== "TO_READ" && (
        <div className="mt-4 flex w-full flex-col items-center justify-center gap-4 px-4 lg:flex-row">
          <ReadingProgressHistoryGraph
            readingHistory={readingHistory}
            className="hidden md:flex"
          />
          <div className="flex h-auto w-full max-w-4xl flex-1 flex-col gap-4 lg:h-[368px] lg:flex-row">
            <ReadingProgressEstimateCard
              currentProgress={book.progress}
              estimatedDate={estimatedDate}
              daysRemaining={daysRemaining}
              slope={slope}
              pageCount={book.pageCount}
              averagePace={averagePace}
            />
            <ReadingProgressHistory
              readingProgressHistory={readingHistory}
              book={book}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Page;
