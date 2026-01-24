"use client";

import Link from "next/link";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { BookIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useBreakPoint } from "@/hooks/use-breakpoint";

const LandingHeader = (): React.ReactElement => {
  const breakpoint = useBreakPoint();

  return (
    <div className="flex w-full flex-col">
      <header className="sticky top-1 z-10 flex h-20 w-full items-center justify-between px-6">
        <Link href={"/"}>
          <p className="text-primary group flex items-center gap-x-2 font-serif text-2xl lg:gap-x-4 lg:text-4xl">
            <BookIcon className="size-8 transition-transform group-hover:scale-110 group-hover:-rotate-12" />
            <span className="no-underline group-hover:underline group-hover:decoration-2">
              BookShelf
            </span>
          </p>
        </Link>
        <div className="flex items-center gap-x-2 md:gap-x-4">
          <SignUpButton>
            <Button
              variant={"outline"}
              size={breakpoint === "sm" ? "default" : "lg"}
              className="text-md"
            >
              Sign Up
            </Button>
          </SignUpButton>
          <SignInButton>
            <Button
              size={breakpoint === "sm" ? "default" : "lg"}
              className="text-md"
            >
              Sign In
            </Button>
          </SignInButton>
        </div>
      </header>
      <Separator />
    </div>
  );
};

export default LandingHeader;
