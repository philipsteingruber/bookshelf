import ThemeToggle from "../theme-toggle";
import { SidebarTrigger } from "../ui/sidebar";

const Header = () => {
  return (
    <header className="bg-sidebar flex h-14 items-center justify-between px-2 py-0">
      <SidebarTrigger />
      <ThemeToggle />
    </header>
  );
};

export default Header;
