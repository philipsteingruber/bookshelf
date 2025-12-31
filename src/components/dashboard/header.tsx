"use client";

import { BookIcon } from "lucide-react";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";

const Header = () => {
  return (
    <>
      <header className="flex w-full items-center justify-between gap-8 p-2 pt-4">
        <div className="flex gap-8">
          <SidebarTrigger size={"icon-lg"} className="size-8" />
          <div className="flex flex-col gap-y-2">
            <p className="flex items-center gap-x-4 font-serif text-4xl">
              <BookIcon className="size-8" /> Dashboard
            </p>
            <p className="text-xl">Welcome back to Bookshelf</p>
          </div>
        </div>
      </header>
      <Separator />
    </>
  );
};

export default Header;
