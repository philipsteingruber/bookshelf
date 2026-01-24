import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

import FeaturesSection from "@/components/landing/features-section";
import HeroSection from "@/components/landing/hero-section";
import StepByStep from "@/components/landing/step-by-step";
import { Separator } from "@/components/ui/separator";

const Page = async (): Promise<React.ReactElement> => {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="mt-20 mb-20 flex h-full min-h-screen w-full flex-col items-center justify-center gap-y-16 p-2 xl:mt-60">
      <HeroSection />
      <Separator />
      <FeaturesSection />
      <Separator />
      <StepByStep />
    </div>
  );
};

export default Page;
