import type { ReactElement } from "react";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { ReportsDashboard } from "./reports-dashboard";

vi.mock("./order-logs-table", () => ({
  OrderLogsTable: () => <div data-testid="order-logs-table" />,
}));

vi.mock("@/lib/currency", () => ({
  useCurrency: () => ({
    formatCurrency: (value: number | string) => {
      const num = typeof value === "string" ? Number.parseFloat(value) : value;
      return `$${Number.isFinite(num) ? num.toFixed(2) : "0.00"}`;
    },
  }),
}));

const originalFetch = global.fetch;

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe("ReportsDashboard", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("fetches aggregated endpoints with date filters and limited transactions", async () => {
    const summaryResponse = {
      totalOrders: 2,
      totalRevenue: 100,
      averageOrderValue: 50,
      daily: [{ date: "2024-01-01", orders: 2, revenue: 100 }],
    };
    const servicesResponse = { services: [{ service: "Wash", count: 3, revenue: 45 }] };
    const clothingResponse = { items: [{ item: "Shirt - Wash", count: 3, revenue: 45 }] };
    const paymentsResponse = { methods: [{ method: "cash", count: 2, revenue: 80 }] };
    const transactionsResponse = [
      {
        id: "txn-1",
        createdAt: new Date().toISOString(),
        paymentMethod: "cash",
        total: "25",
        subtotal: "20",
        tax: "5",
        items: [],
        sellerName: "User",
      },
    ];

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/reports/summary")) {
        return Promise.resolve(new Response(JSON.stringify(summaryResponse), { status: 200 }));
      }
      if (url.startsWith("/api/reports/service-breakdown")) {
        return Promise.resolve(new Response(JSON.stringify(servicesResponse), { status: 200 }));
      }
      if (url.startsWith("/api/reports/clothing-breakdown")) {
        return Promise.resolve(new Response(JSON.stringify(clothingResponse), { status: 200 }));
      }
      if (url.startsWith("/api/reports/payment-methods")) {
        return Promise.resolve(new Response(JSON.stringify(paymentsResponse), { status: 200 }));
      }
      if (url.startsWith("/api/reports/top-packages")) {
        return Promise.resolve(new Response(JSON.stringify({ packages: [] }), { status: 200 }));
      }
      if (url.startsWith("/api/transactions")) {
        return Promise.resolve(new Response(JSON.stringify(transactionsResponse), { status: 200 }));
      }
      return Promise.resolve(new Response("[]", { status: 200 }));
    });

    renderWithClient(<ReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("$100.00")).toBeTruthy();
    });

    const calls = (global.fetch as any).mock.calls.map(([req]: any[]) => (typeof req === "string" ? req : req.url));
    const summaryCall = calls.find((url: string) => url.startsWith("/api/reports/summary"));
    expect(summaryCall).toBeTruthy();
    const summaryUrl = new URL(summaryCall!, "http://localhost");
    expect(summaryUrl.searchParams.get("start")).toBeTruthy();
    expect(summaryUrl.searchParams.get("end")).toBeTruthy();

    const transactionCall = calls.find((url: string) => url.startsWith("/api/transactions"));
    const transactionUrl = new URL(transactionCall!, "http://localhost");
    expect(transactionUrl.searchParams.get("limit")).toBe("50");
  });

  it("paginates exports when generating CSV", async () => {
    const summaryResponse = {
      totalOrders: 5,
      totalRevenue: 200,
      averageOrderValue: 40,
      daily: [],
    };
    const servicesResponse = { services: [] };
    const clothingResponse = { items: [{ item: "Dress - Dry", count: 4, revenue: 120 }] };
    const paymentsResponse = { methods: [] };
    const recentTransactions = [];
    const exportBatch = Array.from({ length: 100 }, (_, idx) => ({
      id: `exp-${idx}`,
      createdAt: new Date().toISOString(),
      paymentMethod: "card",
      total: "15",
      subtotal: "15",
      tax: "0",
      items: [],
      sellerName: "User",
    }));
    const finalBatch = [
      {
        id: "exp-final",
        createdAt: new Date().toISOString(),
        paymentMethod: "card",
        total: "10",
        subtotal: "10",
        tax: "0",
        items: [],
        sellerName: "User",
      },
    ];

    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.startsWith("/api/reports/summary")) {
        return Promise.resolve(new Response(JSON.stringify(summaryResponse), { status: 200 }));
      }
      if (url.startsWith("/api/reports/service-breakdown")) {
        return Promise.resolve(new Response(JSON.stringify(servicesResponse), { status: 200 }));
      }
      if (url.startsWith("/api/reports/clothing-breakdown")) {
        return Promise.resolve(new Response(JSON.stringify(clothingResponse), { status: 200 }));
      }
      if (url.startsWith("/api/reports/payment-methods")) {
        return Promise.resolve(new Response(JSON.stringify(paymentsResponse), { status: 200 }));
      }
      if (url.startsWith("/api/reports/top-packages")) {
        return Promise.resolve(new Response(JSON.stringify({ packages: [] }), { status: 200 }));
      }
      if (url.startsWith("/api/transactions")) {
        const params = new URL(url, "http://localhost").searchParams;
        const limit = params.get("limit");
        const offset = params.get("offset");
        if (limit === "50") {
          return Promise.resolve(new Response(JSON.stringify(recentTransactions), { status: 200 }));
        }
        if (limit === "100" && offset === "0") {
          return Promise.resolve(new Response(JSON.stringify(exportBatch), { status: 200 }));
        }
        if (limit === "100" && offset === "100") {
          return Promise.resolve(new Response(JSON.stringify(finalBatch), { status: 200 }));
        }
      }
      return Promise.resolve(new Response("[]", { status: 200 }));
    });

    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock" as any);
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string, options?: any) => {
      const element = originalCreateElement(tagName, options) as any;
      if (tagName.toLowerCase() === "a") {
        element.click = clickSpy;
      }
      return element;
    });

    renderWithClient(<ReportsDashboard />);

    await waitFor(() => {
      expect(screen.getByText("$200.00")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalled();
    });

    const transactionCalls = (global.fetch as any).mock.calls
      .map(([req]: any[]) => (typeof req === "string" ? req : req.url))
      .filter((url: string) => url.startsWith("/api/transactions"));

    const exportCalls = transactionCalls.filter((url: string) => {
      const params = new URL(url, "http://localhost").searchParams;
      return params.get("limit") === "100";
    });

    expect(exportCalls).toHaveLength(2);
    expect(new URL(exportCalls[0], "http://localhost").searchParams.get("offset")).toBe("0");
    expect(new URL(exportCalls[1], "http://localhost").searchParams.get("offset")).toBe("100");
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();
  });
});
