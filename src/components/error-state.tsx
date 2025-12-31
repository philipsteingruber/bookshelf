import { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import { SearchAlertIcon, ShieldBan, ShieldXIcon } from "lucide-react";
import BaseState from "./base-state";

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

  return <BaseState Icon={Icon} text={text} />;
};

export default ErrorState;
