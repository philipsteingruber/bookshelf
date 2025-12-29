import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import ThemeToggle from "../theme-toggle";
import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";

const Header = () => {
  return (
    <header className="bg-sidebar flex h-14 items-center justify-between py-0 pr-6 pl-2">
      <SidebarTrigger />
      <div className="flex items-center gap-x-8">
        <ThemeToggle />
        <SignedOut>
          <SignInButton>
            <Button>Sign In</Button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
};

export default Header;
