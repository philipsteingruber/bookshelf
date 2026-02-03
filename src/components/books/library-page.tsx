"use client";

import { type ChangeEvent, Suspense } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import {
  ArrowUpDown,
  BookCheckIcon,
  BookmarkIcon,
  BookOpenIcon,
  ClockIcon,
  FilterIcon,
  LibraryIcon,
  SearchIcon,
} from "lucide-react";
import { throttle, useQueryStates } from "nuqs";

import BookCard from "@/components/books/book-card";
import LoadingState from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { ReadStatus } from "@/generated/prisma/enums";
import type { BookScalarFieldEnum } from "@/generated/prisma/internal/prismaNamespace";
import { useBooks } from "@/hooks/book";
import {
  DEBOUNCE_INTERVAL,
  DEFAULT_FILTER,
  DEFAULT_SORTING,
  sortGroups,
} from "@/lib/constants";
import { librarySearchParams } from "@/lib/schemas/url-state";
import type { SortItem, SortOptions, StatusFilterOption } from "@/lib/types";
import { cn } from "@/lib/utils";

const SORT_CONFIG: Record<
  SortOptions,
  { sortBy: BookScalarFieldEnum; sortDirection: "asc" | "desc" }
> = {
  RECENTLY_UPDATED: { sortBy: "updatedAt", sortDirection: "desc" },
  RECENTLY_ADDED: { sortBy: "createdAt", sortDirection: "desc" },
  TITLE_AZ: { sortBy: "title", sortDirection: "asc" },
  TITLE_ZA: { sortBy: "title", sortDirection: "desc" },
  AUTHOR_AZ: { sortBy: "author", sortDirection: "asc" },
  AUTHOR_ZA: { sortBy: "author", sortDirection: "desc" },
  HIGHEST_RATED: { sortBy: "rating", sortDirection: "desc" },
  LOWEST_RATED: { sortBy: "rating", sortDirection: "asc" },
  SHORTEST_FIRST: { sortBy: "pageCount", sortDirection: "asc" },
  LONGEST_FIRST: { sortBy: "pageCount", sortDirection: "desc" },
  SERIES_ORDER: { sortBy: "series", sortDirection: "asc" },
} as const;

const statusFilterOptions: StatusFilterOption[] = [
  {
    Icon: LibraryIcon,
    text: "All Books",
    value: "ALL_BOOKS",
  },
  {
    Icon: BookmarkIcon,
    text: "To Read",
    value: "TO_READ",
  },
  {
    Icon: ClockIcon,
    text: "Read Next",
    value: "READ_NEXT",
  },
  {
    Icon: BookOpenIcon,
    text: "Reading",
    value: "READING",
  },
  {
    Icon: BookCheckIcon,
    text: "Read",
    value: "READ",
  },
];

const parseSelectedSort = (
  value: string,
): { sortBy: BookScalarFieldEnum; sortDirection: "asc" | "desc" } => {
  return (
    SORT_CONFIG[value as SortOptions] ?? {
      sortBy: "title" as BookScalarFieldEnum,
      sortDirection: "asc" as const,
    }
  );
};
const parseSelectedFilter = (
  value: ReadStatus | "ALL_BOOKS",
): ReadStatus | undefined => {
  if (value === "ALL_BOOKS") {
    return undefined;
  }
  return value;
};

const LibraryPage = (): React.ReactElement => {
  // Custom hooks
  const { isSignedIn } = useAuth();
  const [params, setParams] = useQueryStates(librarySearchParams, {
    shallow: false,
    history: "push",
    limitUrlUpdates: throttle(DEBOUNCE_INTERVAL),
  });

  // Derived values
  const { sortBy, sortDirection } = parseSelectedSort(params.sort);

  // Custom hooks (depends on derived values)
  const { books, isPending, isError, error } = useBooks({
    sortBy,
    sortDirection,
    search: params.q,
    status: parseSelectedFilter(params.status),
  });

  // Callbacks
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setParams({ q: e.target.value });
  };
  const handleClearFilters = (): void => {
    setParams(null);
  };

  // Early returns
  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }
  if (isError) {
    return <div>Error loading books: {error?.message}</div>;
  }
  if (!books || isPending) {
    return <LoadingState />;
  }

  return (
    <Suspense>
      <div className="flex w-full flex-col items-center px-2 sm:px-0">
        <LibraryFilterPicker
          selectedSorting={params.sort}
          onSortingChange={(newSort) => setParams({ sort: newSort })}
          inputSearch={params.q}
          onSearchChange={handleSearchChange}
          selectedFilter={params.status}
          onFilterChange={(newFilter) => setParams({ status: newFilter })}
          onClearFilters={handleClearFilters}
          className="w-full md:w-5/6"
        />
        <div className="grid w-full grid-cols-2 items-center gap-4 px-4 pt-4 sm:grid-cols-3 md:w-5/6 md:grid-cols-4 md:px-0 xl:grid-cols-5 2xl:grid-cols-6">
          {books.map((book) => (
            <BookCard key={book.id} book={book} showStatusButton />
          ))}
        </div>
      </div>
    </Suspense>
  );
};

const LibraryFilterPicker = ({
  selectedSorting,
  onSortingChange,
  inputSearch,
  onSearchChange,
  selectedFilter,
  onFilterChange,
  onClearFilters,
  className,
}: {
  selectedSorting: SortOptions;
  onSortingChange: (value: SortOptions) => void;
  inputSearch: string;
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  selectedFilter: ReadStatus | "ALL_BOOKS";
  onFilterChange: (value: ReadStatus | "ALL_BOOKS") => void;
  onClearFilters: () => void;
  className?: string;
}): React.ReactElement => {
  // Derived values
  const hasActiveFilters =
    inputSearch !== "" ||
    selectedFilter !== DEFAULT_FILTER ||
    selectedSorting !== DEFAULT_SORTING;

  // Callbacks
  const getSelectedSort = (): SortItem | undefined => {
    return sortGroups
      .flatMap((group) => group.items)
      .find((item) => item.value === selectedSorting);
  };
  const getSelectedFilter = (): StatusFilterOption | undefined => {
    return statusFilterOptions.find((item) => item.value === selectedFilter);
  };

  return (
    <Card
      className={cn(
        "flex flex-col items-center justify-center rounded-md px-4 py-4 md:px-6",
        className,
      )}
    >
      <div className="flex w-full flex-col items-center gap-y-4 sm:gap-y-2 md:flex-row md:justify-between">
        <span className="flex items-center gap-x-2 text-sm">
          <FilterIcon className="size-6" />
          Filters & Sorting
        </span>

        <Select value={selectedSorting} onValueChange={onSortingChange}>
          <SelectTrigger className="w-[175px]">
            <span className="flex items-center gap-x-2">
              <ArrowUpDown /> {getSelectedSort()?.text}
            </span>
          </SelectTrigger>
          <SelectContent position="popper">
            {sortGroups.map((sortGroup) => (
              <SelectGroup key={sortGroup.text}>
                {sortGroup.items.map((item) => (
                  <SelectItem
                    value={item.value}
                    key={item.text}
                    className="flex items-center justify-between gap-x-2"
                  >
                    <span className="flex items-center gap-x-1">
                      <item.Icon />
                      {item.text}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-full">
        <div className="bg-background flex w-full items-center gap-x-1 rounded-md border px-4 py-2">
          <SearchIcon />
          <Input
            value={inputSearch}
            onChange={onSearchChange}
            className="dark:bg-background border-0 focus-visible:ring-0"
            placeholder="Search"
            autoFocus
          />
        </div>
      </div>
      <div className="flex flex-col items-center gap-y-4 md:flex-row md:gap-x-4 md:gap-y-0">
        <Select
          value={selectedFilter ?? undefined}
          onValueChange={onFilterChange}
        >
          <SelectTrigger>
            <FilterIcon /> {getSelectedFilter()?.text}
          </SelectTrigger>
          <SelectContent position="popper">
            {statusFilterOptions.map((item) => (
              <SelectItem
                className="flex items-center gap-x-1"
                key={item.text}
                value={item.value}
              >
                <item.Icon />
                {item.text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onClearFilters} disabled={!hasActiveFilters}>
          Reset Filters
        </Button>
      </div>
    </Card>
  );
};

export default LibraryPage;
