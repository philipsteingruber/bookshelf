"use client";

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
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import type { LucideIcon } from "lucide-react";
import { BookIcon, BookOpenIcon, LibraryIcon, ScrollIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "../theme-toggle";
import { Button } from "../ui/button";

type SidebarItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

const sidebarItems: SidebarItem[] = [
  { title: "Dashboard", href: "/", icon: BookIcon },
  { title: "Library", href: "/books", icon: LibraryIcon },
  { title: "Journal", href: "/journal", icon: ScrollIcon },
];

export function AppSidebar() {
  const currentPathName = usePathname();

  return (
    <Sidebar>
      <SidebarHeader />
      <SidebarContent className="justify-between overflow-hidden">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenuItem className="mb-4 flex h-8 items-center justify-center">
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
                  "rounded-sm",
                )}
              >
                <SidebarMenuButton asChild>
                  <Link href={item.href} className="mb-4 text-lg">
                    <item.icon className="size-4" /> {item.title}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent className="flex items-center justify-between p-1">
            <ThemeToggle />
            <SignedOut>
              <SignInButton>
                <Button>Sign In</Button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
