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

  it("renders logs with formatted dates", async () => {
    const mockLogs = [
      {
        id: "1",
        orderNumber: "001",
        customerName: "Alice",
        packageName: "Basic",
        status: "ready",
        statusHistory: [],
        receivedAt: "2023-01-01T00:00:00.000Z",
        processedAt: "2023-01-02T00:00:00.000Z",
        readyAt: "2023-01-03T00:00:00.000Z",
        deliveredAt: "2023-01-04T00:00:00.000Z",
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
      expect(screen.getByText("001")).toBeTruthy();
    });
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Basic")).toBeTruthy();
    expect(screen.getByText("Jan 1, 2023")).toBeTruthy();
  });
});
