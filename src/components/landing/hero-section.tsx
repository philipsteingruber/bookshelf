import Image from "next/image";

import { SignUpButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

const HeroSection = (): React.ReactElement => {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-y-6">
      <h1 className="text-primary text-2xl font-semibold tracking-tight xl:text-4xl xl:whitespace-nowrap">
        Track Your Reading Journey
      </h1>
      <h2 className="text-lg font-semibold tracking-tight text-pretty xl:text-2xl">
        Easily add your books, log your progress as you go and gain insights
        about your reading habits
      </h2>
      <SignUpButton>
        <Button size={"lg"} className="p-6 text-xl">
          Sign Up and Get Started
        </Button>
      </SignUpButton>
      <Image
        src="/bookshelf-screenshot.png"
        alt="Bookshelf"
        width={1280}
        height={720}
        className="hidden lg:flex"
      />
    </div>
  );
};

export default HeroSection;
