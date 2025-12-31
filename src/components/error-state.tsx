import { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { SearchAlertIcon, ShieldBan, ShieldXIcon } from "lucide-react";

const ErrorState = ({ code }: { code?: TRPC_ERROR_CODE_KEY }) => {
  let text = "An error occured.";
  let Icon = ShieldXIcon;
  if (code === "FORBIDDEN") {
    text = "You are not authorized to view this.";
    Icon = ShieldBan;
  } else if (code === "NOT_FOUND") {
    text = "No book found, go back and try again.";
    Icon = SearchAlertIcon;
  }

  return (
    <div className="flex size-full flex-col items-center justify-center">
      <Icon className="size-25" />
      <span className="mt-4 text-2xl">{text}</span>
    </div>
  );
};

export default ErrorState;
