"use client"; // Required since we use hooks
import { useEffect, useState } from "react";

import { motion } from "framer-motion";
import { Moon, Sun } from "lucide-react"; // Or any other icons
import { useTheme } from "next-themes";

import { Button } from "./ui/button";

const ThemeToggle = (): React.ReactElement | null => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // Avoid hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) {
    return null; // Or a loading skeleton
  }
  return (
    <Button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="cursor-pointer"
    >
      <motion.div
        key={theme}
        initial={{ opacity: 0, rotate: -30 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: 0.2 }}
      >
        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
      </motion.div>
    </Button>
  );
};

export default ThemeToggle;
