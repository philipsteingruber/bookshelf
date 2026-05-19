import "@/app/globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";

import { SidebarProvider } from "@/components/ui/sidebar";
import { TRPCProvider } from "@/trpc/client";

export const metadata: Metadata = {
  title: "BookShelf",
  description: "NextJS based reading tracker",
};

const Layout = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  return (
    <ClerkProvider>
      <TRPCProvider>
        <html
          lang="en"
          suppressHydrationWarning
          style={{ scrollbarGutter: "stable" }}
        >
          <body
            className={`flex h-full w-full flex-col overflow-y-scroll antialiased`}
            suppressHydrationWarning
          >
            <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
              >
                <SidebarProvider className="h-full w-full" style={{ "--sidebar-width": "13rem" } as React.CSSProperties}>
                  <NuqsAdapter>{children}</NuqsAdapter>
                </SidebarProvider>
              </ThemeProvider>
              <Toaster />
          </body>
        </html>
      </TRPCProvider>
    </ClerkProvider>
  );
};

export default Layout;
