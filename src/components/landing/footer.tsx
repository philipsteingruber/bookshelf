import { Separator } from "@/components/ui/separator";

const LandingFooter = (): React.ReactElement => {
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex h-16 w-full flex-col">
      <Separator></Separator>
      <footer className="text-muted-foreground flex h-full items-center justify-center">
        <span>{`© ${currentYear}`}</span>
      </footer>
    </div>
  );
};

export default LandingFooter;
