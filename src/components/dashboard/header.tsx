"use client";

import { trpc } from "@/trpc/client";
import { useAuth } from "@clerk/nextjs";
import { BookIcon } from "lucide-react";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";

const Header = () => {
  const { userId } = useAuth();
  const { data, isLoading } = trpc.user.getUser.useQuery(userId!);

  if (isLoading || !data) {
    return null;
  }
  const user = data.user;

  return (
    <>
      <header className="flex w-full items-center justify-between gap-8 p-2 pt-4">
        <div className="flex gap-8">
          <SidebarTrigger size={"icon-lg"} className="size-8" />
          <div className="flex flex-col gap-y-2">
            <p className="flex items-center gap-x-4 font-serif text-4xl">
              <BookIcon className="size-8" /> Dashboard
            </p>
            <p className="text-xl">Welcome back, {user.name.split(" ")[0]}</p>
          </div>
        </div>
      </header>
      <Separator />
    </>
  );
};

export default Header;
