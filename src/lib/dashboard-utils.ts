import type { BreakPoint } from "@/hooks/use-breakpoint";

export const getDashboardMaxReadingBooksCount = (
  breakPoint: BreakPoint,
): number => {
  switch (breakPoint) {
    case "sm":
      return 2;
    case "md":
      return 1;
    case "lg":
      return 2;
    case "xl":
      return 3;
    case "2xl":
      return 3;
  }
};
export const getDashboardMaxReadNextBooksCount = (
  breakPoint: BreakPoint,
): number => {
  switch (breakPoint) {
    case "sm":
      return 2;
    case "md":
      return 2;
    case "lg":
      return 2;
    case "xl":
      return 4;
    case "2xl":
      return 5;
  }
};
export const getDashboardRecentlyReadBooksCount = (
  breakPoint: BreakPoint,
): number => {
  switch (breakPoint) {
    case "sm":
      return 1;
    case "md":
      return 2;
    case "lg":
      return 2;
    case "xl":
      return 3;
    case "2xl":
      return 3;
  }
};
