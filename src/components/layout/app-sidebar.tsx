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
import {
  BookIcon,
  BookOpenIcon,
  BookSearchIcon,
  HistoryIcon,
  LibraryIcon,
  SparklesIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useMounted } from "@/hooks/ui";
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
  { title: "Library", href: "/books", icon: BookSearchIcon },
  { title: "Series", href: "/series", icon: LibraryIcon },
  { title: "History", href: "/history", icon: HistoryIcon },
  { title: "Recommendations", href: "/recommendations", icon: SparklesIcon },
];

export const AppSidebar = (): React.ReactElement => {
  const currentPathName = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  const isMounted = useMounted();

  const handleNavClick = (): void => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar className="h-full">
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
                  <Link
                    href={item.href}
                    className="mb-4 text-lg font-semibold"
                    onClick={handleNavClick}
                  >
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
            {!isMounted ? (
              <Spinner />
            ) : (
              <>
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
              </>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
};
