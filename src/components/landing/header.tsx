import Link from "next/link";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { BookIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const LandingHeader = (): React.ReactElement => {
  return (
    <div className="flex w-full flex-col">
      <header className="sticky top-1 z-10 flex h-20 w-full items-center justify-between px-6">
        <Link href={"/"}>
          <p className="flex items-center gap-x-2 font-serif text-2xl lg:gap-x-4 lg:text-4xl">
            <BookIcon className="size-8" />
            <span className="no-underline">Dashboard</span>
          </p>
        </Link>
        <div className="flex gap-x-4">
          <SignUpButton>
            <Button variant={"outline"} size={"lg"} className="text-md">
              Sign Up
            </Button>
          </SignUpButton>
          <SignInButton>
            <Button size={"lg"} className="text-md">
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
