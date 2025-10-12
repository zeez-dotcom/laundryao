import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { FinancialReportsManager } from "./FinancialReportsManager";
import AuthContext from "@/context/AuthContext";

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (options: any) => mockUseQuery(options),
  };
});

vi.mock("@/lib/currency", () => ({
  useCurrency: () => ({
    formatCurrency: (value: number) => value.toFixed(2),
  }),
}));

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(globalThis as any).ResizeObserver = ResizeObserver;

describe("FinancialReportsManager", () => {
  beforeEach(() => {
    mockUseQuery.mockImplementation(({ queryKey, enabled }: { queryKey: any[]; enabled?: boolean }) => {
      if (enabled === false) {
        return { data: undefined };
      }

      const key = Array.isArray(queryKey) ? queryKey[0] : queryKey;

      if (key === "/api/report/summary") {
        const currentDate = new Date().toISOString();

        return {
          data: {
            transactions: [],
            orders: [
              {
                id: "order-1",
                createdAt: currentDate,
              },
            ],
            customers: [],
            payments: [
              {
                id: "payment-1",
                amount: "120",
                paymentMethod: "cash",
                createdAt: currentDate,
              },
            ],
          },
        };
      }

      if (key === "/api/branches") {
        return {
          data: {
            expensesEnabled: false,
          },
        };
      }

      return { data: undefined };
    });
  });

  afterEach(() => {
    mockUseQuery.mockReset();
  });

  it("shows finite growth with zero baseline and surfaces a helper badge", async () => {
    const authValue = {
      user: {
        id: "admin-1",
        role: "admin",
      },
      branch: {
        id: "branch-1",
      },
      isLoading: false,
      isAuthenticated: true,
      isAdmin: true,
      isSuperAdmin: false,
      isDeliveryAdmin: false,
      isDispatcher: false,
      isDriver: false,
    };

    render(
      <AuthContext.Provider value={authValue as any}>
        <FinancialReportsManager />
      </AuthContext.Provider>
    );

    await screen.findByText("Monthly Revenue", undefined, { timeout: 2000 });

    expect(screen.queryByText(/Infinity/)).toBeNull();
    expect(screen.getAllByText("0.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
  });
});

