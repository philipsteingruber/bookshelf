"use client";

import { useState } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  ArrowUpDown,
  BookCheckIcon,
  BookmarkIcon,
  BookOpenIcon,
  CalendarPlusIcon,
  ClockIcon,
  FileTextIcon,
  FilterIcon,
  LibraryIcon,
  SearchIcon,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ChangeEvent } from "react";

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
import { useBooks } from "@/hooks/use-books";
import { DEFAULT_FILTER, DEFAULT_SORTING } from "@/lib/constants";

type SortItem = { Icon: LucideIcon; text: string; value: string };
const sortGroups: { text: string; items: SortItem[] }[] = [
  {
    text: "BY DATE",
    items: [
      {
        text: "Recently Updated",
        Icon: CalendarPlusIcon,
        value: "RECENTLY_UPDATED",
      },
      {
        text: "Recently Added",
        Icon: CalendarPlusIcon,
        value: "RECENTLY_ADDED",
      },
    ],
  },
  {
    text: "BY TITLE & AUTHOR",
    items: [
      { text: "Title A-Z", Icon: ArrowDownAZIcon, value: "TITLE_AZ" },
      { text: "Title Z-A", Icon: ArrowUpAZIcon, value: "TITLE_ZA" },
      { text: "Author A-Z", Icon: ArrowDownAZIcon, value: "AUTHOR_AZ" },
      { text: "Author Z-A", Icon: ArrowUpAZIcon, value: "AUTHOR_ZA" },
    ],
  },
  {
    text: "BY RATING & LENGTH",
    items: [
      { text: "Highest Rated", Icon: TrendingUp, value: "HIGHEST_RATED" },
      { text: "Lowest Rated", Icon: TrendingDown, value: "LOWEST_RATED" },
      { text: "Shortest First", Icon: FileTextIcon, value: "SHORTEST_FIRST" },
      { text: "Longest First", Icon: FileTextIcon, value: "LONGEST_FIRST" },
    ],
  },
] as const;
type SortOptions = (typeof sortGroups)[number]["items"][number]["value"];

type StatusFilterOption = {
  Icon: LucideIcon;
  text: string;
  value: ReadStatus | "ALL_BOOKS";
};
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
} as const;

const parseSelectedSort = (value: string) => {
  return (
    SORT_CONFIG[value as SortOptions] ?? {
      sortBy: "title",
      sortDirection: "asc",
    }
  );
};
const parseSelectedFilter = (value: ReadStatus | "ALL_BOOKS") => {
  if (value === "ALL_BOOKS") {
    return undefined;
  }
  return value;
};

const Page = () => {
  const [selectedSorting, setSelectedSorting] =
    useState<SortOptions>("RECENTLY_UPDATED");
  const [selectedFilter, setSelectedFilter] = useState<
    ReadStatus | "ALL_BOOKS"
  >("ALL_BOOKS");
  const [inputSearch, setInputSearch] = useState<string>("");
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputSearch(e.target.value);
  };

  const handleClearFilters = () => {
    setInputSearch("");
    setSelectedFilter(DEFAULT_FILTER);
    setSelectedSorting(DEFAULT_SORTING);
  };

  const { isSignedIn } = useAuth();

  const { sortBy, sortDirection } = parseSelectedSort(selectedSorting);
  const { books, isPending, isError, error } = useBooks({
    sortBy,
    sortDirection,
    search: inputSearch,
    status: parseSelectedFilter(selectedFilter),
  });

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
    <div className="flex w-full flex-col items-center">
      <LibraryFilterPicker
        selectedSorting={selectedSorting}
        onSortingChange={setSelectedSorting}
        inputSearch={inputSearch}
        onSearchChange={handleSearchChange}
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
        onClearFilters={handleClearFilters}
      />
      <div className="grid w-5/6 grid-cols-5 items-center gap-x-8 gap-y-4 pt-4">
        {books.map((book) => (
          <BookCard book={book} key={book.id} showStatusButton />
        ))}
      </div>
    </div>
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
}: {
  selectedSorting: SortOptions;
  onSortingChange: (value: SortOptions) => void;
  inputSearch: string;
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  selectedFilter: ReadStatus | "ALL_BOOKS";
  onFilterChange: (value: ReadStatus | "ALL_BOOKS") => void;
  onClearFilters: () => void;
}) => {
  const getSelectedSort = () => {
    return sortGroups
      .flatMap((group) => group.items)
      .find((item) => item.value === selectedSorting);
  };
  const getSelectedFilter = () => {
    return statusFilterOptions.find((item) => item.value === selectedFilter);
  };
  const hasActiveFilters =
    inputSearch !== "" ||
    selectedFilter !== DEFAULT_FILTER ||
    selectedSorting !== DEFAULT_SORTING;

  return (
    <Card className="flex w-5/6 flex-col items-center justify-center rounded-md px-6 py-4">
      <div className="flex w-full items-center justify-between">
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
      <div className="flex flex-col items-center gap-y-4">
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

export default Page;
