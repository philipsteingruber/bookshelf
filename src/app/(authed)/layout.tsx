"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { useTimezoneSync } from "@/hooks/ui";

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement => {
  // Auto-sync browser timezone with server
  useTimezoneSync();

  return (
    <>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <div className="mb-6 flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </>
  );
};

export default RootLayout;
