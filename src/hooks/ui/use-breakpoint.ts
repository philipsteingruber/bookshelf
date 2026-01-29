import { useEffect, useState } from "react";

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 2560, //1440p and up
};

/* TESTED DEVTOOLS BREAKPOINTS:
sm: Mobile L
md: Tablet L
lg: Laptop
xl: 1080p Display
2xl: 1440p Display
*/

export type BreakPoint = "sm" | "md" | "lg" | "xl" | "2xl";

const getBreakPointFromWidth = (width: number): BreakPoint => {
  if (width >= breakpoints["2xl"]) {
    return "2xl";
  } else if (width >= breakpoints.xl) {
    return "xl";
  } else if (width >= breakpoints.lg) {
    return "lg";
  } else if (width >= breakpoints.md) {
    return "md";
  } else {
    return "sm";
  }
};

export const useBreakPoint = (): BreakPoint => {
  const [currentBreakPoint, setCurrentBreakPoint] = useState<
    BreakPoint | undefined
  >(undefined);

  useEffect(() => {
    const updateBreakPoint = (): void => {
      setCurrentBreakPoint(getBreakPointFromWidth(window.innerWidth));
    };

    updateBreakPoint();

    window.addEventListener("resize", updateBreakPoint);

    return () => window.removeEventListener("resize", updateBreakPoint);
  }, []);
  return currentBreakPoint ?? "xl";
};
