import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark";

// Theme tokens mirror the CSS variables used in index.css
export const lightTheme: Record<string, string> = {
  "--background": "hsl(210, 20%, 98%)",
  "--foreground": "hsl(222, 47%, 11%)",
  "--muted": "hsl(215, 28%, 92%)",
  "--muted-foreground": "hsl(215, 16%, 32%)",
  "--popover": "hsl(0, 0%, 100%)",
  "--popover-foreground": "hsl(222, 47%, 11%)",
  "--card": "hsl(0, 0%, 100%)",
  "--card-foreground": "hsl(222, 47%, 11%)",
  "--border": "hsl(215, 20%, 82%)",
  "--input": "hsl(215, 20%, 82%)",
  "--primary": "hsl(221, 83%, 53%)",
  "--primary-foreground": "hsl(210, 40%, 98%)",
  "--secondary": "hsl(161, 63%, 41%)",
  "--secondary-foreground": "hsl(210, 52%, 97%)",
  "--accent": "hsl(31, 95%, 52%)",
  "--accent-foreground": "hsl(24, 83%, 12%)",
  "--destructive": "hsl(0, 72%, 51%)",
  "--destructive-foreground": "hsl(0, 0%, 100%)",
  "--ring": "hsl(221, 83%, 53%)",
  "--focus": "hsl(199, 89%, 48%)",
  "--radius": "0.5rem",
  "--surface-muted": "hsl(210, 25%, 95%)",
  "--surface-elevated": "hsl(210, 40%, 100%)",
  "--shadow-soft": "0px 12px 24px -12px rgba(15, 23, 42, 0.24)",
  // Typography
  "--font-sans": "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  "--font-heading": "'Lexend', 'Inter', 'Segoe UI', system-ui, sans-serif",
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-md": "1rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.5rem",
  "--text-2xl": "2rem",
  "--line-height-tight": "1.25",
  "--line-height-snug": "1.35",
  "--line-height-relaxed": "1.6",
  // Spacing scale (4pt grid with expressive large steps)
  "--space-2xs": "0.25rem",
  "--space-xs": "0.5rem",
  "--space-sm": "0.75rem",
  "--space-md": "1rem",
  "--space-lg": "1.5rem",
  "--space-xl": "2rem",
  "--space-2xl": "3rem",
  // POS specific colors
  "--pos-primary": "hsl(221, 83%, 53%)",
  "--pos-secondary": "hsl(161, 63%, 41%)",
  "--pos-accent": "hsl(31, 95%, 52%)",
  "--pos-surface": "hsl(0, 0%, 100%)",
  "--pos-background": "hsl(214, 32%, 94%)",
  "--pos-error": "hsl(0, 72%, 51%)",
};

export const darkTheme: Record<string, string> = {
  "--background": "hsl(222, 47%, 11%)",
  "--foreground": "hsl(210, 40%, 96%)",
  "--muted": "hsl(221, 39%, 18%)",
  "--muted-foreground": "hsl(216, 20%, 72%)",
  "--popover": "hsl(224, 45%, 14%)",
  "--popover-foreground": "hsl(210, 40%, 96%)",
  "--card": "hsl(222, 43%, 13%)",
  "--card-foreground": "hsl(210, 40%, 96%)",
  "--border": "hsl(217, 27%, 32%)",
  "--input": "hsl(217, 27%, 32%)",
  "--primary": "hsl(217, 91%, 60%)",
  "--primary-foreground": "hsl(222, 47%, 11%)",
  "--secondary": "hsl(164, 61%, 44%)",
  "--secondary-foreground": "hsl(166, 72%, 10%)",
  "--accent": "hsl(29, 96%, 63%)",
  "--accent-foreground": "hsl(21, 92%, 16%)",
  "--destructive": "hsl(0, 82%, 63%)",
  "--destructive-foreground": "hsl(222, 47%, 11%)",
  "--ring": "hsl(217, 91%, 60%)",
  "--focus": "hsl(199, 95%, 66%)",
  "--radius": "0.5rem",
  "--surface-muted": "hsl(222, 47%, 17%)",
  "--surface-elevated": "hsl(224, 45%, 20%)",
  "--shadow-soft": "0px 16px 32px -12px rgba(8, 47, 73, 0.4)",
  // Typography
  "--font-sans": "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  "--font-heading": "'Lexend', 'Inter', 'Segoe UI', system-ui, sans-serif",
  "--text-xs": "0.75rem",
  "--text-sm": "0.875rem",
  "--text-md": "1rem",
  "--text-lg": "1.125rem",
  "--text-xl": "1.5rem",
  "--text-2xl": "2rem",
  "--line-height-tight": "1.25",
  "--line-height-snug": "1.35",
  "--line-height-relaxed": "1.6",
  // Spacing scale
  "--space-2xs": "0.25rem",
  "--space-xs": "0.5rem",
  "--space-sm": "0.75rem",
  "--space-md": "1rem",
  "--space-lg": "1.5rem",
  "--space-xl": "2rem",
  "--space-2xl": "3rem",
  // POS specific colors (dark adjustments)
  "--pos-primary": "hsl(217, 91%, 60%)",
  "--pos-secondary": "hsl(164, 61%, 44%)",
  "--pos-accent": "hsl(29, 96%, 63%)",
  "--pos-surface": "hsl(224, 45%, 14%)",
  "--pos-background": "hsl(222, 47%, 11%)",
  "--pos-error": "hsl(0, 82%, 63%)",
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

