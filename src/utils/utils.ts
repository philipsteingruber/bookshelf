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
      return "bg-blue-100 text-blue-900";
    case "READING":
      return "bg-yellow-100 text-yellow-900";
    case "READ":
      return "bg-green-100 text-green-900";
    case "DNF":
      return "bg-red-100 text-red-900";
  }
};
