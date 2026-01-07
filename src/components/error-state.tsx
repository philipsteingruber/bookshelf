import { TRPC_ERROR_CODE_KEY } from "@trpc/server";
import {
  SearchAlertIcon,
  ShieldBan,
  ShieldXIcon,
  WifiOffIcon,
} from "lucide-react";
import BaseState from "./base-state";

interface ErrorStateProps {
  code?: TRPC_ERROR_CODE_KEY;
  message?: string;
  linkText?: string;
  href?: string;
}

const ErrorState = ({
  code,
  message,
  linkText = "Click here to return to your Bookshelf",
  href = "/books",
}: ErrorStateProps) => {
  let text = "An error occurred.";
  let Icon = ShieldXIcon;

  // Check for network errors first
  if (message?.includes("network") || message?.includes("fetch")) {
    text = "Network error. Please check your connection and try again.";
    Icon = WifiOffIcon;
  } else if (code === "FORBIDDEN") {
    text = "You are not authorized to view this.";
    Icon = ShieldBan;
  } else if (code === "NOT_FOUND") {
    text = "No book found, go back and try again.";
    Icon = SearchAlertIcon;
  } else if (code === "UNAUTHORIZED") {
    text = "Please sign in to access this content.";
    Icon = ShieldBan;
  } else if (message) {
    // Use custom message if provided
    text = message;
  }

  return (
    <BaseState Icon={Icon} text={text} linkText={linkText} href={href} />
  );
};

export default ErrorState;
