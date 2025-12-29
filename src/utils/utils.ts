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
  }
};

export const getStatusButtonStyle = (readStatus: ReadStatus) => {
  switch (readStatus) {
    case "TO_READ":
      return "bg-orange-500 hover:bg-orange-500/80 text-white hover:text-neutral-200";
    case "READING":
      return "bg-blue-600 hover:bg-blue-600/80 text-white hover:text-neutral-200";
    case "READ":
      return "bg-green-600 hover:bg-green-600/80 text-white hover:text-neutral-200";
    case "DNF":
      return "bg-red-600 hover:bg-red-600/80 text-white hover:text-neutral-200";
  }
};
