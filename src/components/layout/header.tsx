import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";

const Header = () => {
  return (
    <header className="flex h-14 items-center justify-between py-0 pr-6 pl-2">
      <SidebarTrigger />
      <Link href={"/books/create"}>
        <Button className="cursor-pointer">
          <PlusIcon /> Add
        </Button>
      </Link>
    </header>
  );
};

export default Header;
