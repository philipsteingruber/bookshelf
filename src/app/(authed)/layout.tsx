"use client";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { useBreakPoint } from "@/hooks/ui";

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement => {
  const breakPoint = useBreakPoint();

  return (
    <>
      {process.env.NODE_ENV === "development" && (
        <span className="fixed top-0 left-0 z-50 bg-red-500 p-2 text-white">
          {breakPoint} - {window.innerWidth ?? 0}px
        </span>
      )}
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <div className="mb-6 flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </>
  );
};

export default RootLayout;
