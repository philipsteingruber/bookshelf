import { Field, FieldLabel } from "@/components/ui/field";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VALIDATION_LIMITS } from "@/lib/constants";

interface LibraryPaginationProps {
  currentPage: number;
  currentPageSize: number;
  totalPages: number;
  onPageChange: ({
    newPage,
    prevNextClicked,
  }: {
    newPage: number;
    prevNextClicked?: boolean;
  }) => void;

  onPageSizeChange: (newPageSize: number) => void;
}

const LibraryPagination = ({
  currentPage,
  currentPageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: LibraryPaginationProps): React.ReactElement | null => {
  if (totalPages === 1) {
    return null;
  }

  return (
    <div className="flex gap-x-4 xl:scale-110">
      <Field orientation={"horizontal"}>
        <FieldLabel htmlFor="books-per-page">Books per Page</FieldLabel>
        <Select
          value={
            currentPageSize.toString() ??
            VALIDATION_LIMITS.BOOKS_QUERY_DEFAULT.toString()
          }
          onValueChange={(val) => onPageSizeChange(parseInt(val))}
        >
          <SelectTrigger id="books-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectGroup>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Pagination>
        <PaginationContent className="flex gap-x-4">
          <PaginationItem>
            <PaginationPrevious
              isActive={currentPage > 1}
              onClick={() =>
                onPageChange({
                  newPage: Math.max(currentPage - 1, 1),
                  prevNextClicked: true,
                })
              }
            />
          </PaginationItem>
          {/* First Page (if more than 1 page and first page isn't current page) */}
          {totalPages !== 1 && currentPage > 1 && (
            <PaginationItem className="hidden md:flex">
              <PaginationLink onClick={() => onPageChange({ newPage: 1 })}>
                1
              </PaginationLink>
            </PaginationItem>
          )}
          {/* Ellipsis (if >= 3 pages between current page and first page)*/}
          {currentPage - 1 >= 3 && (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          )}
          {/* Previous Page (if it exists and previous page isn't first page) */}
          {currentPage - 1 >= 1 && currentPage - 1 > 1 && (
            <PaginationItem className="hidden lg:flex">
              <PaginationLink
                onClick={() =>
                  onPageChange({
                    newPage: currentPage - 1,
                  })
                }
              >
                {currentPage - 1}
              </PaginationLink>
            </PaginationItem>
          )}
          {/* Current Page */}
          <PaginationItem className="hidden rounded-md border md:flex">
            <PaginationLink>{currentPage}</PaginationLink>
          </PaginationItem>
          {/* Next Page (if it exists and next page isn't last page) */}
          {currentPage + 1 <= totalPages && currentPage + 1 < totalPages && (
            <PaginationItem className="hidden lg:flex">
              <PaginationLink
                onClick={() => onPageChange({ newPage: currentPage + 1 })}
              >
                {currentPage + 1}
              </PaginationLink>
            </PaginationItem>
          )}
          {/* Ellipsis (if >= 3 pages between current page and last page)*/}
          {totalPages - currentPage >= 3 && (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          )}
          {/* Last Page (if more than 1 page and current page isn't last page) */}
          {totalPages !== 1 && currentPage !== totalPages && (
            <PaginationItem className="hidden md:flex">
              <PaginationLink
                onClick={() => onPageChange({ newPage: totalPages })}
              >
                {totalPages}
              </PaginationLink>
            </PaginationItem>
          )}
          <PaginationItem>
            <PaginationNext
              isActive={currentPage < totalPages}
              onClick={() =>
                onPageChange({
                  newPage: Math.min(currentPage + 1, totalPages),
                  prevNextClicked: true,
                })
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

export default LibraryPagination;
