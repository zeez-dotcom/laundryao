import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { OrderManagementDashboard } from "./OrderManagementDashboard";

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: (options: unknown) => mockUseQuery(options),
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

const mockToast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuthContext: () => ({
    user: { id: "user-1", role: "admin" },
    branch: { id: "branch-1" },
  }),
}));

vi.mock("@/lib/currency", () => ({
  useCurrency: () => ({
    formatCurrency: (value: number) => `KWD ${value.toFixed(2)}`,
  }),
}));

const overdueOrder = {
  id: "order-1",
  orderNumber: "001",
  customerName: "Late Customer",
  customerPhone: "12345678",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-05T00:00:00.000Z",
  promisedReadyDate: "2024-01-02T00:00:00.000Z",
  promisedReadyOption: "tomorrow",
  status: "processing",
  items: [],
  total: "10",
  subtotal: "8",
  tax: "2",
  notes: null,
  deliveryOrder: undefined,
} as any;

const onTimeOrder = {
  id: "order-2",
  orderNumber: "002",
  customerName: "On Time Customer",
  customerPhone: "87654321",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T12:00:00.000Z",
  promisedReadyDate: "2024-01-03T00:00:00.000Z",
  promisedReadyOption: "day_after_tomorrow",
  status: "received",
  items: [],
  total: "20",
  subtotal: "18",
  tax: "2",
  notes: null,
  deliveryOrder: undefined,
} as any;

describe("OrderManagementDashboard lateness indicators", () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date("2024-01-02T12:00:00.000Z").getTime());
    mockUseQuery.mockReturnValue({ data: [overdueOrder, onTimeOrder], isLoading: false });
  });

  afterEach(() => {
    dateNowSpy?.mockRestore();
    vi.clearAllMocks();
    cleanup();
  });

  it("shows overdue badge and quick actions when an order is late", async () => {
    render(<OrderManagementDashboard />);

    await screen.findByText(/Overdue by/i);
    expect(screen.getByText(/Overdue by/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Notify Customer/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Escalate Order/i })).toBeTruthy();
  });

  it("renders on-time orders without overdue quick actions", async () => {
    render(<OrderManagementDashboard />);

    const onTimeCard = await screen.findByTestId("order-card-order-2");
    expect(within(onTimeCard).getByText(/On track/i)).toBeTruthy();
    expect(within(onTimeCard).queryByRole("button", { name: /Notify Customer/i })).toBeNull();
  });
});
