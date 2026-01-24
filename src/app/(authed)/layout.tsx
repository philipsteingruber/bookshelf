import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement => {
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
