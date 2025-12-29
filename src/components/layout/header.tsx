import { SidebarTrigger } from "../ui/sidebar";

const Header = () => {
  return (
    <header className="bg-sidebar flex h-14 items-center justify-between py-0 pr-6 pl-2">
      <SidebarTrigger />
    </header>
  );
};

export default Header;
