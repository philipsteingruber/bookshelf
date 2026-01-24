import LandingFooter from "@/components/landing/footer";
import LandingHeader from "@/components/landing/header";

const Layout = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  return (
    <div className="flex h-full w-full flex-col">
      <LandingHeader />
      <div className="flex h-full w-full flex-1 flex-col">{children}</div>
      <LandingFooter />
    </div>
  );
};

export default Layout;
