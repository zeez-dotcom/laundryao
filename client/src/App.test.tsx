import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ThemeProvider, useTheme } from "@/theme";
// Mock TranslationProvider to avoid async locale loading/spinner
vi.mock("@/context/TranslationContext", async () => {
  const React = await import("react");
  const enMessages = (await import("@/locales/en.json")).default;
  const defaultValue = { t: enMessages, language: "en" as const, setLanguage: () => {} };
  const TranslationContext = React.createContext(defaultValue);
  return {
    TranslationProvider: ({ children }: { children: React.ReactNode }) => (
      <TranslationContext.Provider value={defaultValue}>{children}</TranslationContext.Provider>
    ),
    useTranslationContext: () => defaultValue,
    TranslationContext,
  };
});
import { TranslationProvider } from "@/context/TranslationContext";
import { darkTheme, lightTheme } from "@/theme";

// Mock AuthContext to avoid network calls and simplify routing
vi.mock("@/context/AuthContext", async () => {
  return {
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuthContext: () => ({
      user: undefined,
      branch: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      isSuperAdmin: false,
      isDeliveryAdmin: false,
      isDispatcher: false,
      isDriver: false,
    }),
  };
});

vi.mock(
  "react-leaflet",
  () => {
    const MockContainer = ({ children }: { children: React.ReactNode }) => (
      <div data-testid="mock-map">{children}</div>
    );
    const MockComponent = ({ children }: { children?: React.ReactNode }) => (
      <>{children}</>
    );
    return {
      MapContainer: MockContainer,
      TileLayer: MockComponent,
      CircleMarker: MockComponent,
      Popup: MockComponent,
    };
  },
  { virtual: true },
);

import App from "./App";

// Helper to mock prefers-color-scheme
function mockPrefersDark(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" ? matches : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("App theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    const root = document.documentElement;
    // Clear any previously set CSS variables
    Object.keys({ ...lightTheme, ...darkTheme }).forEach((k) => root.style.removeProperty(k));
  });

  it("defaults to prefers-color-scheme when no saved theme", () => {
    mockPrefersDark(true);
    render(
      <TranslationProvider>
        <App />
      </TranslationProvider>,
    );
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.getPropertyValue("--background").trim()).toBe(darkTheme["--background"]);
  });

  it("toggle switches theme and updates localStorage", () => {
    mockPrefersDark(false);
    function TestToggle() {
      const { toggleTheme } = useTheme();
      return (
        <button aria-label="Toggle theme" onClick={toggleTheme}>
          Toggle
        </button>
      );
    }
    render(
      <TranslationProvider>
        <ThemeProvider>
          <TestToggle />
        </ThemeProvider>
      </TranslationProvider>,
    );

    const button = screen.getByRole("button", { name: /toggle theme/i });
    const root = document.documentElement;

    // initial should be light
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.getPropertyValue("--background").trim()).toBe(lightTheme["--background"]);
    expect(localStorage.getItem("theme")).toBe("light");

    fireEvent.click(button);

    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.getPropertyValue("--background").trim()).toBe(darkTheme["--background"]);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("applies tokens to the root element", () => {
    mockPrefersDark(true);
    render(
      <TranslationProvider>
        <App />
      </TranslationProvider>,
    );
    const root = document.documentElement;
    // spot check a few tokens
    expect(root.style.getPropertyValue("--foreground").trim()).toBe(darkTheme["--foreground"]);
    expect(root.style.getPropertyValue("--primary").trim()).toBe(darkTheme["--primary"]);
  });
});
