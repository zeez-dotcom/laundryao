import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

// Theme tokens mirror the CSS variables used in index.css
export const lightTheme: Record<string, string> = {
  "--background": "hsl(0, 0%, 100%)",
  "--foreground": "hsl(20, 14.3%, 4.1%)",
  "--muted": "hsl(60, 4.8%, 95.9%)",
  "--muted-foreground": "hsl(25, 5.3%, 44.7%)",
  "--popover": "hsl(0, 0%, 100%)",
  "--popover-foreground": "hsl(20, 14.3%, 4.1%)",
  "--card": "hsl(0, 0%, 100%)",
  "--card-foreground": "hsl(20, 14.3%, 4.1%)",
  "--border": "hsl(20, 5.9%, 90%)",
  "--input": "hsl(20, 5.9%, 90%)",
  "--primary": "hsl(207, 90%, 54%)",
  "--primary-foreground": "hsl(211, 100%, 99%)",
  "--secondary": "hsl(123, 38%, 57%)",
  "--secondary-foreground": "hsl(60, 9.1%, 97.8%)",
  "--accent": "hsl(60, 4.8%, 95.9%)",
  "--accent-foreground": "hsl(24, 9.8%, 10%)",
  "--destructive": "hsl(0, 84.2%, 60.2%)",
  "--destructive-foreground": "hsl(60, 9.1%, 97.8%)",
  "--ring": "hsl(20, 14.3%, 4.1%)",
  "--radius": "0.5rem",
  // POS specific colors
  "--pos-primary": "hsl(207, 90%, 54%)",
  "--pos-secondary": "hsl(123, 38%, 57%)",
  "--pos-accent": "hsl(36, 100%, 47%)",
  "--pos-surface": "hsl(0, 0%, 100%)",
  "--pos-background": "hsl(240, 9%, 98%)",
  "--pos-error": "hsl(354, 70%, 54%)",
};

export const darkTheme: Record<string, string> = {
  "--background": "hsl(240, 10%, 3.9%)",
  "--foreground": "hsl(0, 0%, 98%)",
  "--muted": "hsl(240, 3.7%, 15.9%)",
  "--muted-foreground": "hsl(240, 5%, 64.9%)",
  "--popover": "hsl(240, 10%, 3.9%)",
  "--popover-foreground": "hsl(0, 0%, 98%)",
  "--card": "hsl(240, 10%, 3.9%)",
  "--card-foreground": "hsl(0, 0%, 98%)",
  "--border": "hsl(240, 3.7%, 15.9%)",
  "--input": "hsl(240, 3.7%, 15.9%)",
  "--primary": "hsl(207, 90%, 54%)",
  "--primary-foreground": "hsl(211, 100%, 99%)",
  "--secondary": "hsl(240, 3.7%, 15.9%)",
  "--secondary-foreground": "hsl(0, 0%, 98%)",
  "--accent": "hsl(240, 3.7%, 15.9%)",
  "--accent-foreground": "hsl(0, 0%, 98%)",
  "--destructive": "hsl(0, 62.8%, 30.6%)",
  "--destructive-foreground": "hsl(0, 0%, 98%)",
  "--ring": "hsl(240, 4.9%, 83.9%)",
  "--radius": "0.5rem",
  // POS specific colors (keep the same in dark for brand consistency)
  "--pos-primary": "hsl(207, 90%, 54%)",
  "--pos-secondary": "hsl(123, 38%, 57%)",
  "--pos-accent": "hsl(36, 100%, 47%)",
  "--pos-surface": "hsl(240, 10%, 3.9%)",
  "--pos-background": "hsl(240, 10%, 6%)",
  "--pos-error": "hsl(354, 70%, 54%)",
};

export function getInitialTheme(): Theme {
  const stored = (typeof window !== "undefined" && localStorage.getItem("theme")) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  if (typeof window !== "undefined" && window.matchMedia) {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }
  return "light";
}

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeVars(theme: Theme) {
  const vars = theme === "dark" ? darkTheme : lightTheme;
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    // Persist
    localStorage.setItem("theme", theme);
    // CSS class for Tailwind dark: variants
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    // Apply tokens as CSS variables for non-Tailwind consumers
    applyThemeVars(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

