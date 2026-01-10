import type { ReadStatus } from "@/generated/prisma/enums";

export const parseReadStatus = (readStatus: ReadStatus) => {
  switch (readStatus) {
    case "TO_READ":
      return "To Read";
    case "READING":
      return "Reading";
    case "READ":
      return "Finished";
    case "DNF":
      return "DNF";
    case "READ_NEXT":
      return "Read Next";
  }
};

export const getStatusButtonStyle = (readStatus: ReadStatus) => {
  switch (readStatus) {
    case "TO_READ":
      return "bg-gradient-to-r from-orange-400 to-orange-700 hover:from-orange-500 hover:to-orange-800 text-white";
    case "READING":
      return "bg-gradient-to-r from-blue-500 to-blue-800 hover:from-blue-600 hover:to-blue-900 text-white";
    case "READ":
      return "bg-gradient-to-r from-green-500 to-green-800 hover:from-green-600 hover:to-green-900 text-white";
    case "DNF":
      return "bg-gradient-to-r from-red-500 to-red-800 hover:from-red-600 hover:to-red-900 text-white";
    case "READ_NEXT":
      return "bg-gradient-to-r from-purple-400 to-purple-700 hover:from-purple-500 hover:to-purple-800 text-white";
  }
};
