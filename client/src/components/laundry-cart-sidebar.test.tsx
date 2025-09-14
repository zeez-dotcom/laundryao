import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@tanstack/react-query", async () => {
  const actual: any = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn() };
});
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { LaundryCartSidebar, computeReadyBy } from "./laundry-cart-sidebar";
import type { LaundryCartSummary } from "@shared/schema";
import { TranslationProvider } from "@/context/TranslationContext";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/currency", () => ({ useCurrency: () => ({ formatCurrency: (n: any) => n }) }));
vi.mock("@/lib/tax", () => ({ getTaxRate: () => 0 }));
vi.mock("@/components/customer-dialog", () => ({ CustomerDialog: () => <div /> }));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TranslationProvider>{ui}</TranslationProvider>
    </QueryClientProvider>,
  );
}

describe("LaundryCartSidebar", () => {
  it("defaults ready by to tomorrow", async () => {
    vi.mocked(useQuery).mockReturnValue({ data: [] } as any);
    const summary: LaundryCartSummary = {
      items: [
        {
          id: '1',
          clothingItem: { name: 'Item' } as any,
          service: { name: 'Service', price: 0 } as any,
          quantity: 1,
          total: 0,
        },
      ],
      subtotal: 0,
      tax: 0,
      total: 0,
      itemCount: 1,
    };
    renderWithClient(
      <LaundryCartSidebar
        cartSummary={summary}
        paymentMethod="cash"
        selectedCustomer={null}
        onUpdateQuantity={() => {}}
        onRemoveItem={() => {}}
        onClearCart={() => {}}
        onSelectPayment={() => {}}
        onSelectCustomer={() => {}}
        onCheckout={(
          _p: number,
          _o: string,
          _d: Date,
          _u?: {
            packageId: string;
            items: {
              serviceId: string;
              clothingItemId: string;
              quantity: number;
            }[];
          },
        ) => {}}
        isVisible={true}
        onClose={() => {}}
      />
    );
    const radio = await screen.findByLabelText("Tomorrow");
    expect(radio.getAttribute("data-state")).toBe("checked");
  });

  it("shows service names for package items", async () => {
    const packages = [
      {
        id: "pkg1",
        nameEn: "Test Package",
        balance: 5,
        totalCredits: 5,
        items: [
          { serviceId: "svc1", clothingItemId: "ci1", serviceName: "Wash", balance: 3, totalCredits: 3 },
        ],
      },
    ];
    vi.mocked(useQuery).mockReturnValue({ data: packages } as any);
    const summary: LaundryCartSummary = {
      items: [
        {
          id: "1",
          clothingItem: { name: "Item" } as any,
          service: { name: "Dry", price: 0 } as any,
          quantity: 1,
          total: 0,
        },
      ],
      subtotal: 0,
      tax: 0,
      total: 0,
      itemCount: 1,
    };
    renderWithClient(
      <LaundryCartSidebar
        cartSummary={summary}
        paymentMethod="cash"
        selectedCustomer={{
          id: "c1",
          name: "John",
          nickname: "",
          phoneNumber: "123",
          balanceDue: "0",
          loyaltyPoints: 0,
        } as any}
        onUpdateQuantity={() => {}}
        onRemoveItem={() => {}}
        onClearCart={() => {}}
        onSelectPayment={() => {}}
        onSelectCustomer={() => {}}
        onCheckout={(
          _p: number,
          _o: string,
          _d: Date,
          _u?: {
            packageId: string;
            items: {
              serviceId: string;
              clothingItemId: string;
              quantity: number;
            }[];
          },
        ) => {}}
        isVisible={true}
        onClose={() => {}}
      />
    );
    expect(await screen.findByText(/Wash/)).toBeTruthy();
    vi.mocked(useQuery).mockReset();
  });
});

describe("computeReadyBy", () => {
  it("calculates day after tomorrow", () => {
    const result = computeReadyBy("day_after_tomorrow");
    const expected = new Date();
    expected.setDate(expected.getDate() + 2);
    expect(result.toDateString()).toBe(expected.toDateString());
  });
});
