import Header from "@/components/layout/header";

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
