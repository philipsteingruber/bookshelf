import Link from "next/link";

import { PlusIcon } from "lucide-react";

import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const Header = () => {
  return (
    <header className="flex h-14 items-center justify-between py-0 pr-6 pl-2">
      <SidebarTrigger />
      <Link href={"/books/create"}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="cursor-pointer">
              <PlusIcon /> Add
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add a new book to your Bookshelf</p>
          </TooltipContent>
        </Tooltip>
      </Link>
    </header>
  );
};

export default Header;
