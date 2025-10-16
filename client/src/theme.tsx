import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

// Theme tokens mirror the CSS variables used in index.css
export const lightTheme: Record<string, string> = {
  "--background": "hsl(210, 33%, 98%)",
  "--foreground": "hsl(222, 47%, 11%)",
  "--muted": "hsl(213, 29%, 92%)",
  "--muted-foreground": "hsl(218, 17%, 35%)",
  "--popover": "hsl(0, 0%, 100%)",
  "--popover-foreground": "hsl(222, 47%, 11%)",
  "--card": "hsl(0, 0%, 100%)",
  "--card-foreground": "hsl(222, 47%, 11%)",
  "--border": "hsl(213, 26%, 82%)",
  "--input": "hsl(213, 26%, 82%)",
  "--primary": "hsl(226, 71%, 45%)",
  "--primary-foreground": "hsl(210, 40%, 98%)",
  "--secondary": "hsl(168, 83%, 28%)",
  "--secondary-foreground": "hsl(166, 100%, 96%)",
  "--accent": "hsl(28, 84%, 52%)",
  "--accent-foreground": "hsl(23, 81%, 14%)",
  "--destructive": "hsl(0, 72%, 42%)",
  "--destructive-foreground": "hsl(0, 0%, 100%)",
  "--ring": "hsl(226, 71%, 45%)",
  "--focus": "hsl(202, 100%, 36%)",
  "--radius": "0.5rem",
  "--surface-muted": "hsl(213, 27%, 95%)",
  "--surface-elevated": "hsl(210, 40%, 99%)",
  "--shadow-soft": "0px 14px 28px -14px rgba(15, 23, 42, 0.25)",
  // Typography
  "--font-sans": "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  "--font-heading": "'Lexend', 'Inter', 'Segoe UI', system-ui, sans-serif",
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-md": "1rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.375rem",
  "--text-2xl": "1.75rem",
  "--text-3xl": "2.25rem",
  "--line-height-tight": "1.22",
  "--line-height-snug": "1.35",
  "--line-height-relaxed": "1.65",
  // Spacing scale (4pt grid with extended ranges)
  "--space-3xs": "0.125rem",
  "--space-2xs": "0.25rem",
  "--space-xs": "0.5rem",
  "--space-sm": "0.75rem",
  "--space-md": "1rem",
  "--space-lg": "1.5rem",
  "--space-xl": "2rem",
  "--space-2xl": "3rem",
  "--space-3xl": "4rem",
  "--space-4xl": "5rem",
  // POS specific colors
  "--pos-primary": "hsl(226, 71%, 45%)",
  "--pos-secondary": "hsl(168, 83%, 28%)",
  "--pos-accent": "hsl(28, 84%, 52%)",
  "--pos-surface": "hsl(0, 0%, 100%)",
  "--pos-background": "hsl(213, 33%, 94%)",
  "--pos-error": "hsl(0, 72%, 42%)",
};

export const darkTheme: Record<string, string> = {
  "--background": "hsl(222, 47%, 12%)",
  "--foreground": "hsl(210, 40%, 96%)",
  "--muted": "hsl(216, 32%, 20%)",
  "--muted-foreground": "hsl(215, 18%, 68%)",
  "--popover": "hsl(224, 45%, 16%)",
  "--popover-foreground": "hsl(210, 40%, 96%)",
  "--card": "hsl(222, 43%, 15%)",
  "--card-foreground": "hsl(210, 40%, 96%)",
  "--border": "hsl(215, 28%, 35%)",
  "--input": "hsl(215, 28%, 35%)",
  "--primary": "hsl(217, 91%, 60%)",
  "--primary-foreground": "hsl(222, 47%, 12%)",
  "--secondary": "hsl(162, 70%, 38%)",
  "--secondary-foreground": "hsl(168, 100%, 12%)",
  "--accent": "hsl(29, 92%, 60%)",
  "--accent-foreground": "hsl(23, 82%, 16%)",
  "--destructive": "hsl(0, 84%, 62%)",
  "--destructive-foreground": "hsl(222, 47%, 12%)",
  "--ring": "hsl(217, 91%, 60%)",
  "--focus": "hsl(199, 95%, 66%)",
  "--radius": "0.5rem",
  "--surface-muted": "hsl(222, 47%, 18%)",
  "--surface-elevated": "hsl(224, 45%, 22%)",
  "--shadow-soft": "0px 18px 36px -14px rgba(8, 47, 73, 0.45)",
  // Typography
  "--font-sans": "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  "--font-heading": "'Lexend', 'Inter', 'Segoe UI', system-ui, sans-serif",
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-md": "1rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.375rem",
  "--text-2xl": "1.75rem",
  "--text-3xl": "2.25rem",
  "--line-height-tight": "1.22",
  "--line-height-snug": "1.35",
  "--line-height-relaxed": "1.65",
  // Spacing scale
  "--space-3xs": "0.125rem",
  "--space-2xs": "0.25rem",
  "--space-xs": "0.5rem",
  "--space-sm": "0.75rem",
  "--space-md": "1rem",
  "--space-lg": "1.5rem",
  "--space-xl": "2rem",
  "--space-2xl": "3rem",
  "--space-3xl": "4rem",
  "--space-4xl": "5rem",
  // POS specific colors (dark adjustments)
  "--pos-primary": "hsl(217, 91%, 60%)",
  "--pos-secondary": "hsl(162, 70%, 38%)",
  "--pos-accent": "hsl(29, 92%, 60%)",
  "--pos-surface": "hsl(224, 45%, 16%)",
  "--pos-background": "hsl(222, 47%, 12%)",
  "--pos-error": "hsl(0, 84%, 62%)",
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

