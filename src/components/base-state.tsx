import { LucideIcon } from "lucide-react";
import { Spinner } from "./ui/spinner";

interface Props {
  Icon: LucideIcon | typeof Spinner;
  text: string;
}

const BaseState = ({ Icon, text }: Props) => {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <Icon className="size-25" />
      <span className="mt-4 text-2xl italic">{text}</span>
    </div>
  );
};

export default BaseState;
