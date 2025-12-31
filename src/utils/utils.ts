import { ReadStatus } from "@/app/generated/prisma/enums";

export const parseReadStatus = (readStatus: ReadStatus) => {
  switch (readStatus) {
    case "TO_READ":
      return "To Read";
      break;
    case "READING":
      return "Reading";
      break;
    case "READ":
      return "Finished";
      break;
    case "DNF":
      return "DNF";
      break;
    case "READ_NEXT":
      return "Read Next";
      break;
  }
};

export const getStatusButtonStyle = (readStatus: ReadStatus) => {
  switch (readStatus) {
    case "TO_READ":
      return "bg-gradient-to-r from-orange-400 to-orange-700 hover:from-orange-400/80 hover:to-orange-700/80 text-white hover:text-neutral-200";
    case "READING":
      return "bg-gradient-to-r from-blue-500 to-blue-800 hover:from-blue-500/80 hover:to-blue-800/80 text-white hover:text-neutral-200";
    case "READ":
      return "bg-gradient-to-r from-green-500 to-green-800 hover:from-green-500/80 hover:to-green-800/80 text-white hover:text-neutral-200";
    case "DNF":
      return "bg-gradient-to-r from-red-500 to-red-800 hover:from-red-500/80 hover:to-red-800/80 text-white hover:text-neutral-200";
    case "READ_NEXT":
      return "bg-gradient-to-r from-purple-400 to-purple-700 hover:from-purple-400/80 hover:to-purple-700/80 text-white hover:text-neutral-200";
  }
};
