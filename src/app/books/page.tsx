"use client";

import { useState } from "react";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  ArrowUpDown,
  CalendarPlusIcon,
  FileTextIcon,
  FilterIcon,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import BookCard from "@/components/books/book-card";
import LoadingState from "@/components/loading-state";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { BookScalarFieldEnum } from "@/generated/prisma/internal/prismaNamespace";
import { useBooks } from "@/hooks/use-books";

type SortItem = { Icon: LucideIcon; text: string; value: string };
const sortGroups: { text: string; items: SortItem[] }[] = [
  {
    text: "BY DATE",
    items: [
      {
        text: "Recently Added",
        Icon: CalendarPlusIcon,
        value: "RECENTLY_ADDED",
      },
      /* 
        {
          text: "Recently Read",
          Icon: BookCheckIcon,
          value: "RECENTLY_READ",
        },
        */
      {
        text: "Oldest First",
        Icon: CalendarPlusIcon,
        value: "OLDEST_FIRST",
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

const SORT_CONFIG: Record<
  SortOptions,
  { sortBy: BookScalarFieldEnum; sortDirection: "asc" | "desc" }
> = {
  RECENTLY_ADDED: { sortBy: "createdAt", sortDirection: "desc" },
  OLDEST_FIRST: { sortBy: "createdAt", sortDirection: "asc" },
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

const Page = () => {
  const [selectedSorting, setSelectedSorting] =
    useState<SortOptions>("RECENTLY_ADDED");
  const { isSignedIn } = useAuth();

  const { sortBy, sortDirection } = parseSelectedSort(selectedSorting);
  const { books, isPending, isError, error } = useBooks({
    sortBy,
    sortDirection,
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
      />
      <div className="grid w-5/6 grid-cols-5 items-center gap-x-8 gap-y-4 pt-4">
        {books.map((book) => (
          <BookCard
            book={book}
            key={book.id}
            showStatusButton
            orientation="vertical"
          />
        ))}
      </div>
    </div>
  );
};

const LibraryFilterPicker = ({
  selectedSorting,
  onSortingChange,
}: {
  selectedSorting: SortOptions;
  onSortingChange: (value: SortOptions) => void;
}) => {
  const getSelectedItem = () => {
    return sortGroups
      .flatMap((group) => group.items)
      .find((item) => item.value === selectedSorting);
  };

  return (
    <Card className="flex w-5/6 flex-col items-center">
      <div className="flex w-full items-center justify-between px-6">
        <span className="flex items-center gap-x-2 text-sm">
          <FilterIcon />
          Filters & Sorting
        </span>
        <Select value={selectedSorting} onValueChange={onSortingChange}>
          <SelectTrigger className="w-[175px]">
            <span className="flex items-center gap-x-2">
              <ArrowUpDown /> {getSelectedItem()?.text}
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
    </Card>
  );
};

export default Page;
