"use client";

import { Suspense } from "react";

import LibraryPage from "@/components/books/library-page";
import LoadingState from "@/components/loading-state";

const Page = (): React.ReactElement => {
  return (
    <Suspense fallback={<LoadingState />}>
      <LibraryPage />
    </Suspense>
  );
};

export default Page;
