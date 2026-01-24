import { SignUpButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";

const steps: string[] = [
  "Import your book from Goodreads (or enter basic information manually)",
  "Track your progress as you read",
  "View your stats and hit your reading goals",
];

const StepByStep = (): React.ReactElement => {
  return (
    <div className="flex flex-col items-center justify-center gap-y-8">
      <h3 className="text-primary text-4xl font-semibold">
        Get Started in 3 Steps
      </h3>
      {steps.map((step, index) => (
        <div
          key={index}
          className="group flex w-full max-w-[800px] items-center justify-between gap-x-4 px-4"
        >
          <span className="bg-primary flex size-12 cursor-default items-center justify-center rounded-full text-2xl transition-transform group-hover:scale-110 lg:size-16 lg:text-4xl">
            {index + 1}
          </span>
          <span className="w-[90%] text-left text-lg font-normal lg:font-semibold">
            {step}
          </span>
        </div>
      ))}
      <SignUpButton>
        <Button
          size={"lg"}
          className="mt-8 w-full p-6 text-xl sm:w-1/2 lg:w-1/3"
        >
          Create Your BookShelf Now
        </Button>
      </SignUpButton>
    </div>
  );
};

export default StepByStep;
