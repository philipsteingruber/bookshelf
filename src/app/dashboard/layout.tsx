import Header from "@/components/dashboard/header";

const Layout = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  return (
    <>
      <Header />
      {children}
    </>
  );
};

export default Layout;
