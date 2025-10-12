import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, afterEach } from "vitest";
import { OrderLogsTable } from "./order-logs-table";
import { TranslationProvider } from "@/context/TranslationContext";

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TranslationProvider>
        <OrderLogsTable />
      </TranslationProvider>
    </QueryClientProvider>
  );
}

const originalFetch = global.fetch;

describe("OrderLogsTable", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it("renders order timeline with events", async () => {
    const mockLogs = [
      {
        id: "1",
        orderNumber: "001",
        customerName: "Alice",
        packageName: "Basic",
        status: "ready",
        createdAt: "2023-01-01T00:00:00.000Z",
        promisedReadyDate: "2023-01-02T00:00:00.000Z",
        events: [
          {
            id: "evt1",
            status: "received",
            actor: "System",
            timestamp: "2023-01-01T00:00:00.000Z",
            context: "order",
          },
          {
            id: "evt2",
            status: "ready",
            actor: "Alice",
            timestamp: "2023-01-01T10:00:00.000Z",
            context: "order",
          },
        ],
      },
    ];

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockLogs), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;

    renderWithClient();

    await waitFor(() => {
      expect(screen.getByText("Order 001")).toBeTruthy();
    });
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Package: Basic")).toBeTruthy();
    expect(screen.getByText(/Ready within SLA/)).toBeTruthy();
    expect(screen.getByText("Received")).toBeTruthy();
    expect(screen.getByText("by Alice")).toBeTruthy();
  });
});
