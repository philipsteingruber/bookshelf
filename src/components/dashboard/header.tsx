"use client";

import Link from "next/link";

import { BookIcon, FlameIcon, PlusIcon } from "lucide-react";

import ExportDataDialog from "@/components/settings/export-data-dialog";
import ImportDataDialog from "@/components/settings/import-data-dialog";
import StreakThresholdSetting from "@/components/settings/streak-threshold-setting";
import { useReadingStats } from "@/hooks/reading";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";

const Header = (): React.ReactElement => {
  return (
    <>
      <header className="relative flex w-full items-center justify-between gap-4 overflow-hidden p-2 py-4">
        {process.env.NODE_ENV === "development" && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-amber-500 px-3 py-0.5 text-xl font-medium text-black">
            Development
          </div>
        )}
        <div className="flex items-center gap-8">
          <SidebarTrigger className="[&>svg]:text-muted-foreground [&>svg]:size-6!" />
          <div className="flex flex-col gap-y-2">
            <p className="flex items-center gap-x-2 font-serif text-2xl lg:gap-x-4 lg:text-4xl">
              <BookIcon className="size-8" /> BookShelf
            </p>
          </div>
        </div>
        <div className="flex items-center gap-x-8 pr-4">
          <StreakThresholdSetting>
            <StreakIndicator className="hidden md:flex" />
          </StreakThresholdSetting>
          <div className="flex items-center gap-x-4">
            <ImportDataDialog />
            <ExportDataDialog />
            <Link href={"/books/create"}>
              <Button className="cursor-pointer">
                <PlusIcon /> Add
              </Button>
            </Link>
          </div>
        </div>
      </header>
      <Separator />
    </>
  );
};

const StreakIndicator = ({
  className,
}: {
  className?: string;
}): React.ReactElement => {
  const { isStreakActive, currentStreak, isPending } = useReadingStats();

  const hasStreak = currentStreak > 0;

  const getMessage = (): string => {
    if (isStreakActive) {
      return `You're on a ${currentStreak} day streak, keep it going!`;
    }
    if (hasStreak) {
      return `You have a ${currentStreak} day streak, read today to keep it!`;
    }
    return "You lost your streak, get back on the horse!";
  };
  const getShortMessage = (): string => {
    if (isStreakActive || hasStreak) {
      return `On a ${currentStreak} day streak`;
    }
    return "You lost your streak, get back on the horse!";
  };

  return (
    <div
      className={cn(
        hasStreak ? "rounded-md border-2 font-semibold shadow-md" : null,
        "flex cursor-default items-center gap-x-2 px-4 py-2",
        className,
      )}
    >
      {isPending ? null : (
        <>
          <FlameIcon
            className={cn(hasStreak ? "text-red-400" : "text-white")}
          />
          <span className="text-primary hidden lg:flex">{getMessage()}</span>
          <span className="text-primary flex lg:hidden">
            {getShortMessage()}
          </span>
        </>
      )}
    </div>
  );
};

export default Header;
