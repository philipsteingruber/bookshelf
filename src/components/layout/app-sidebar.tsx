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
import type { LucideIcon } from "lucide-react";
import { BookIcon, BookOpenIcon, LibraryIcon, ScrollIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
      <SidebarContent className="overflow-hidden">
        <SidebarMenuItem className="flex h-8 items-center justify-center">
          <SidebarMenuButton
            asChild
            className="flex items-center justify-center"
          >
            <Link href="/">
              <BookOpenIcon />
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarGroup>
          <SidebarGroupContent className="mt-4">
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
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
