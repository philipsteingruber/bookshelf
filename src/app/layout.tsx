import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TRPCProvider } from "@/trpc/client";

export const metadata: Metadata = {
  title: "BookShelf",
  description: "NextJS based reading tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TRPCProvider>
      <ClerkProvider>
        <html lang="en" suppressHydrationWarning>
          <body
            className={`flex h-full w-full flex-col antialiased`}
            suppressHydrationWarning
          >
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <SidebarProvider className="h-full w-full">
                <AppSidebar />
                <SidebarInset>
                  <div className="mb-6 flex flex-1 flex-col">{children}</div>
                </SidebarInset>
              </SidebarProvider>
            </ThemeProvider>
            <Toaster />
          </body>
        </html>
      </ClerkProvider>
    </TRPCProvider>
  );
}
