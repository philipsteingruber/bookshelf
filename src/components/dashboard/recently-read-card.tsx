import BookCard from "@/components/books/book-card";
import StatusCategoryHeader from "@/components/dashboard/status-category-header";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Book } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

const RecentlyReadCard = ({
  books,
  className,
}: {
  books: Book[];
  className?: string;
}): React.ReactElement => {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col items-center gap-y-2 md:items-start",
        className,
      )}
    >
      <StatusCategoryHeader text="Recently Finished" count={books.length} />
      <div className="flex h-full w-full flex-wrap justify-center gap-4 md:flex-nowrap md:justify-start md:gap-x-4">
        {books.map((book) => {
          return (
            <Tooltip key={book.id}>
              <TooltipTrigger asChild>
                <div>
                  <BookCard
                    book={book}
                    showStatusButton={false}
                    className="w-64 rounded-md"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>{`Finished on ${book.finishedAt?.toLocaleDateString()}`}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default RecentlyReadCard;
