import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, vi, expect, afterEach } from "vitest";
import { ProductGrid } from "./product-grid";
import { TranslationProvider } from "@/context/TranslationContext";
import AuthContext from "@/context/AuthContext";

const matchMediaMock = vi.fn().mockReturnValue({
  matches: false,
  media: "",
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});
// @ts-ignore
window.matchMedia = matchMediaMock as any;

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-ignore
global.ResizeObserver = ResizeObserver;

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const authValue = {
    user: undefined,
    branch: null,
    isLoading: false,
    isAuthenticated: false,
    isAdmin: false,
    isSuperAdmin: false,
    isDeliveryAdmin: false,
    isDispatcher: false,
    isDriver: false,
  } as any;
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue}>
        <TranslationProvider>
          <ProductGrid
            onAddToCart={() => {}}
            cartItemCount={0}
            onToggleCart={() => {}}
          />
        </TranslationProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const originalFetch = global.fetch;

describe("ProductGrid", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    matchMediaMock.mockClear();
    cleanup();
  });

  it("renders fetched categories", async () => {
    const mockCategories = [
      { id: "c1", name: "Cat 1" },
      { id: "c2", name: "Cat 2" },
    ];

    global.fetch = vi.fn((url: RequestInfo) => {
      if (typeof url === "string" && url.startsWith("/api/product-categories")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockCategories), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (typeof url === "string" && url.startsWith("/api/products")) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], total: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error("Unknown URL"));
    }) as any;

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("Cat 1")).toBeTruthy();
      expect(screen.getByText("Cat 2")).toBeTruthy();
    });
  });

  it("shows fallback when categories fail to load", async () => {
    global.fetch = vi.fn((url: RequestInfo) => {
      if (typeof url === "string" && url.startsWith("/api/product-categories")) {
        return Promise.resolve(new Response(null, { status: 500 }));
      }
      if (typeof url === "string" && url.startsWith("/api/products")) {
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], total: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.reject(new Error("Unknown URL"));
    }) as any;

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("Categories unavailable")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getAllByText("No products found").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("All Items")).toBeNull();
  });
});
