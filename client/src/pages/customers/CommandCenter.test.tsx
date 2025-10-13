import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import CommandCenterPage from "./CommandCenter";
import type { CommandCenterResponse } from "@/components/customers/types";
import { getQueryFn } from "@/lib/queryClient";

let queryClient: QueryClient;
const originalFetch = globalThis.fetch;

const responseFixture: CommandCenterResponse = {
  customer: {
    id: "cust-1",
    branchId: "b1",
    name: "Command Center Hero",
    phoneNumber: "+20111111111",
    email: "hero@example.com",
    loyaltyPoints: 42,
    isActive: true,
    createdAt: "2024-01-10T10:00:00.000Z",
  },
  financial: {
    balanceDue: 120.5,
    totalSpend: 2500,
    loyaltyPoints: 42,
    packageCredits: 5,
  },
  orders: [
    {
      id: "o-1",
      orderNumber: "1001",
      status: "completed",
      total: 220,
      paid: 220,
      remaining: 0,
      createdAt: "2024-03-10T09:00:00.000Z",
      promisedReadyDate: "2024-03-11T09:00:00.000Z",
      items: [],
    },
  ],
  packages: [
    {
      id: "pkg-1",
      name: "Premium",
      balance: 5,
      startsAt: "2024-01-01T00:00:00.000Z",
      expiresAt: "2024-06-01T00:00:00.000Z",
      totalCredits: 10,
    },
  ],
  outreachTimeline: [
    {
      id: "evt-1",
      occurredAt: "2024-03-05T09:00:00.000Z",
      category: "notification",
      title: "Receipt emailed",
      details: "email",
    },
  ],
  auditTrail: [
    {
      id: "audit-1",
      occurredAt: "2024-03-08T07:00:00.000Z",
      category: "engagement",
      title: "SMS follow-up",
      details: "Scheduled pickup",
    },
  ],
  actions: {
    issueCredit: {
      method: "POST",
      endpoint: "/api/customers/cust-1/payments",
      payloadExample: {},
    },
    schedulePickup: {
      method: "PUT",
      endpoint: "/api/customer-insights/cust-1/actions",
      payloadExample: {},
    },
    launchChat: {
      method: "PUT",
      endpoint: "/api/customer-insights/cust-1/actions",
      payloadExample: {},
    },
    queueCampaign: {
      method: "PUT",
      endpoint: "/api/customer-insights/cust-1/actions",
      payloadExample: {},
    },
  },
  insights: {
    customerId: "cust-1",
    summary: "Weekly customer with positive sentiment",
    purchaseFrequency: "Weekly",
    preferredServices: ["Wash & Fold"],
    sentiment: "positive",
    generatedAt: "2024-03-10T10:00:00.000Z",
  },
};

function createFetchMock(overrides: Record<string, Response> = {}) {
  let creditIssued = false;

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const method = init?.method?.toUpperCase() ?? "GET";
    const key = `${method} ${url}`;

    if (overrides[key]) {
      if (method !== "GET" && url.includes("/payments")) {
        creditIssued = true;
      }
      return overrides[key].clone();
    }

    if (url.endsWith("/command-center") && method === "GET") {
      if (!creditIssued) {
        return new Response(JSON.stringify(responseFixture), { status: 200 });
      }

      const updated = JSON.parse(JSON.stringify(responseFixture)) as CommandCenterResponse;
      const optimisticEvent = {
        id: "evt-optimistic",
        occurredAt: new Date().toISOString(),
        category: "payment" as const,
        title: "Issued manual credit (75.00)",
        details: "Recorded from inline action",
      };
      updated.financial.balanceDue = Math.max(updated.financial.balanceDue - 75, 0);
      updated.outreachTimeline = [optimisticEvent, ...updated.outreachTimeline];
      updated.auditTrail = [optimisticEvent, ...updated.auditTrail];
      return new Response(JSON.stringify(updated), { status: 200 });
    }

    if (method !== "GET") {
      if (url.includes("/payments")) {
        creditIssued = true;
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  });
}

describe("CommandCenterPage", () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          queryFn: getQueryFn({ on401: "throw" }),
          retry: false,
          refetchInterval: false,
          refetchOnWindowFocus: false,
          staleTime: Infinity,
        },
        mutations: { retry: false },
      },
    });
    queryClient.clear();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("renders dossier and timelines", async () => {
    const fetchMock = createFetchMock();
    globalThis.fetch = fetchMock as any;

    render(
      <QueryClientProvider client={queryClient}>
        <CommandCenterPage params={{ id: "cust-1" }} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/customers/cust-1/command-center", { credentials: "include" }),
    );

    await screen.findByText("Command Center Hero");
    expect(screen.getByText("Package credits remaining")).toBeTruthy();
    expect(screen.getByText(/Receipt emailed/)).toBeTruthy();
  });

  test("issues credit via inline action", async () => {
    const fetchMock = createFetchMock({
      "POST /api/customers/cust-1/payments": new Response(JSON.stringify({ id: "payment-1" }), { status: 200 }),
    });
    globalThis.fetch = fetchMock as any;

    render(
      <QueryClientProvider client={queryClient}>
        <CommandCenterPage params={{ id: "cust-1" }} />
      </QueryClientProvider>,
    );

    await screen.findByText("Command Center Hero");

    const amountInput = screen.getByLabelText("Amount");
    fireEvent.change(amountInput, { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: /Issue credit/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/customers/cust-1/payments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ amount: 75, paymentMethod: "credit", receivedBy: "Command Center", notes: "" }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getAllByText(/Issued manual credit/).length).toBeGreaterThan(0);
    });
  });
});
