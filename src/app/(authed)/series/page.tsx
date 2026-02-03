"use client";

import Image from "next/image";
import Link from "next/link";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

import ErrorState from "@/components/error-state";
import LoadingState from "@/components/loading-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBreakPoint } from "@/hooks/ui";
import { BOOK_COVER_PLACEHOLDER_URL } from "@/lib/constants";
import { trpc } from "@/trpc/client";

type CSSVars = {
  [key: `--${string}`]: string | number;
};

const Page = (): React.ReactElement => {
  const { data, isPending } = trpc.book.getSeriesList.useQuery();
  const { userId } = useAuth();
  const breakPoint = useBreakPoint();

  if (isPending) {
    return <LoadingState />;
  }
  if (!userId) {
    <RedirectToSignIn />;
  }

  const numCoversToShow =
    breakPoint === "sm" || breakPoint === "md"
      ? 0
      : breakPoint === "lg" || breakPoint === "xl"
        ? 2
        : 5;
  const coversToShow = !data
    ? []
    : data.seriesData.map((series) => {
        return {
          name: series.name,
          coverUrls: series.books
            .slice(0, numCoversToShow)
            .toSorted((a, b) => b.seriesIndex! - a.seriesIndex!)
            .map((book) => book.coverUrl ?? BOOK_COVER_PLACEHOLDER_URL),
          fullBookCount: series.bookCount,
        };
      });

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <Card className="w-full lg:w-3/4">
        <CardContent className="flex w-full flex-col items-center justify-center gap-y-4 lg:gap-x-8">
          {data ? (
            <>
              <CardHeader className="w-full text-center text-2xl lg:text-4xl">
                <CardTitle>All Series</CardTitle>
              </CardHeader>
              {coversToShow.map((series) => (
                <Link
                  key={series.name}
                  href={`/books?q=${series.name}&sort=SERIES_ORDER`}
                  className="min-h-300px w-full"
                >
                  <Card className="h-full w-full">
                    <CardContent className="h-full">
                      <div className="flex h-full w-full items-center justify-between px-4">
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="border-primary rounded-md border-2 p-4 text-xl whitespace-nowrap lg:text-3xl">{`${series.name} (${series.fullBookCount})`}</span>
                        </div>
                        <div className="group relative hidden h-[300px] w-[260px] shrink-0 items-center xl:flex">
                          {series.coverUrls.map((entry, index) => {
                            const overlapAmount = 80;
                            const hoverSpreadAmount = 24;
                            const rotationAmount = 1.5;
                            const style: React.CSSProperties & CSSVars = {
                              right: index * overlapAmount,
                              zIndex: 10 + index,
                              transform: `rotate(${index * rotationAmount}deg)`,
                              "--spread": `-${index * hoverSpreadAmount}px`,
                            };

                            return (
                              <Image
                                key={entry}
                                src={entry}
                                alt={`Cover of book in ${series.name}`}
                                height={300}
                                width={200}
                                className="top-00 absolute h-[300px] w-[200px] rounded-md transition-transform duration-300 ease-out group-hover:translate-x-(--spread)"
                                style={style}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </>
          ) : (
            <ErrorState
              code="NOT_FOUND"
              message="You haven't added any books that are part of a series yet. Go add some!"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Page;
