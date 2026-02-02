"use client";

import { Suspense } from "react";

import LibraryPage from "@/components/books/library-page";

const Page = (): React.ReactElement => {
  return (
    <Suspense>
      <LibraryPage />
    </Suspense>
  );
};

export default Page;
