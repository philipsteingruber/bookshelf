"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  ClerkLoaded,
  ClerkLoading,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import type { LucideIcon } from "lucide-react";
import { BookIcon, BookOpenIcon, LibraryIcon, ScrollIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import ThemeToggle from "../theme-toggle";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

type SidebarItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

const sidebarItems: SidebarItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: BookIcon },
  { title: "Library", href: "/books", icon: LibraryIcon },
  { title: "Journal", href: "/journal", icon: ScrollIcon },
];

export const AppSidebar = (): React.ReactElement => {
  const currentPathName = usePathname();

  return (
    <Sidebar>
      <SidebarHeader />
      <SidebarContent className="justify-between overflow-hidden">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenuItem className="mb-8 flex h-8 items-center justify-center">
              <SidebarMenuButton
                asChild
                className="flex items-center justify-center"
              >
                <Link href="/">
                  <BookOpenIcon />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {sidebarItems.map((item) => (
              <SidebarMenuItem
                key={item.title}
                className={cn(
                  currentPathName === item.href
                    ? "bg-neutral-200 dark:bg-neutral-800"
                    : null,
                  "rounded-md",
                )}
              >
                <SidebarMenuButton asChild>
                  <Link href={item.href} className="mb-4 text-lg font-semibold">
                    <item.icon className="size-4" /> {item.title}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent className="flex items-center justify-center gap-x-8">
            <ThemeToggle />
            <ClerkLoading>
              <Spinner />
            </ClerkLoading>
            <ClerkLoaded>
              <SignedOut>
                <SignInButton>
                  <Button>Sign In</Button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <UserButton />
              </SignedIn>
            </ClerkLoaded>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
};
