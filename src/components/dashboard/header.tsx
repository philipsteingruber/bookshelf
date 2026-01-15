"use client";

import Link from "next/link";

import { BookIcon, FlameIcon, PlusIcon } from "lucide-react";

import { useReadingStats } from "@/hooks/use-reading-stats";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";

const Header = () => {
  return (
    <>
      <header className="relative flex w-full items-center justify-between gap-8 p-2 pt-4">
        {process.env.NODE_ENV === "development" && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-amber-500 px-3 py-0.5 text-xl font-medium text-black">
            Development
          </div>
        )}
        <div className="flex gap-8">
          <SidebarTrigger size={"icon-lg"} className="size-8" />
          <div className="flex flex-col gap-y-2">
            <p className="flex items-center gap-x-4 font-serif text-4xl">
              <BookIcon className="size-8" /> Dashboard
            </p>
            <p className="text-xl">Welcome back to Bookshelf</p>
          </div>
        </div>
        <div className="flex items-center gap-x-8 pr-4">
          <StreakIndicator />
          <Link href={"/books/create"}>
            <Button className="cursor-pointer">
              <PlusIcon /> Add
            </Button>
          </Link>
        </div>
      </header>
      <Separator />
    </>
  );
};

const StreakIndicator = () => {
  const { isStreakActive, currentStreak, isPending } = useReadingStats();

  return (
    <div
      className={cn(
        isStreakActive ? "rounded-md border-2 font-semibold shadow-md" : null,
        "flex cursor-default items-center gap-x-2 px-4 py-2",
      )}
    >
      {isPending ? null : (
        <>
          <FlameIcon
            className={cn(isStreakActive ? "text-red-400" : "text-white")}
          />
          <span className="text-primary">
            {isStreakActive
              ? `You're on a ${currentStreak} day streak, keep it going!`
              : "You lost your streak, get back on the horse!"}
          </span>
        </>
      )}
    </div>
  );
};

export default Header;
