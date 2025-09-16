import { render, screen, within, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { ReceiptModal } from "./receipt-modal";
import { TranslationProvider } from "@/context/TranslationContext";
import AuthContext from "@/context/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
};

  const transaction: any = {
    id: "trx1",
    items: [
      {
        service: "Wash (\u063a\u0633\u064a\u0644)",
        name: "Shirt (\u0642\u0645\u064a\u0635)",
        quantity: 2,
        price: 1.5,
        total: 3,
      },
    ],
  createdAt: new Date().toISOString(),
  paymentMethod: "cash",
  subtotal: 3,
  tax: 0,
  total: 3,
  packages: [
    {
      id: "pkg1",
      nameEn: "Wash Pack",
      nameAr: "حزمة الغسيل",
      balance: 3,
      totalCredits: 5,
      startsAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      expiresAt: new Date("2024-12-31T00:00:00Z").toISOString(),
      items: [
        {
          serviceId: "svc1",
          serviceName: "Wash",
          clothingItemName: "Shirt",
          balance: 3,
          totalCredits: 5,
          used: 0,
        },
      ],
    },
  ],
};

const customer = { id: "cust1", name: "John Doe" } as any;

function renderReceipt() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <AuthContext.Provider value={authValue}>
      <QueryClientProvider client={queryClient}>
        <TranslationProvider>
          <ReceiptModal
            transaction={transaction}
            customer={customer}
            isOpen={true}
            onClose={() => {}}
          />
        </TranslationProvider>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}

describe("ReceiptModal", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders bilingual rows with duplicated values", async () => {
    localStorage.clear();
    renderReceipt();
    const value = transaction.id.slice(-6).toUpperCase();
    const english = await screen.findByText(`Receipt #: ${value}`);
    const row = english.parentElement as HTMLElement;
    const arabic = within(row).getByText(/رقم الإيصال/);
    expect(arabic.textContent).toContain(value);
    expect(row.getAttribute("dir")).toBe("rtl");
    expect(within(row).getAllByText(value, { exact: false })).toHaveLength(2);
  });

  it("uses order number when available", async () => {
    localStorage.clear();
    const transactionWithOrder: any = {
      ...transaction,
      id: "trx2",
      orderNumber: "ORDER123",
      paymentMethod: "cash",
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <TranslationProvider>
            <ReceiptModal
              transaction={transactionWithOrder}
              isOpen={true}
              onClose={() => {}}
            />
          </TranslationProvider>
        </QueryClientProvider>
      </AuthContext.Provider>
    );

    const english = await screen.findByText("Receipt #: ORDER123");
    const row = english.parentElement as HTMLElement;
    const arabic = within(row).getByText(/رقم الإيصال/);
    expect(arabic.textContent).toContain("ORDER123");
    expect(within(row).getAllByText("ORDER123", { exact: false })).toHaveLength(2);
  });

  it("stacks bilingual item descriptions and shows price once", async () => {
    localStorage.clear();
    renderReceipt();

    const english = await screen.findByText("Shirt - Wash × 2");
    const container = english.parentElement as HTMLElement;
    expect(container.className).toContain("flex-col");

    const arabic = within(container).getByText("قميص - غسيل × 2");
    expect(arabic.getAttribute("dir")).toBe("rtl");

    expect(english.textContent).toBe("Shirt - Wash × 2");
    expect(arabic.textContent).toBe("قميص - غسيل × 2");

    expect(screen.getAllByText("Shirt - Wash × 2")).toHaveLength(1);
    expect(screen.getAllByText("قميص - غسيل × 2")).toHaveLength(1);

    const row = container.parentElement as HTMLElement;
    const directSpanChildren = Array.from(row.children).filter(
      (el) => el.tagName === "SPAN"
    );
    expect(directSpanChildren).toHaveLength(1);
  });

  it("does not duplicate single-language custom messages", async () => {
    localStorage.clear();
    localStorage.setItem(
      "laundrySettings",
      JSON.stringify({
        receiptHeaderEn: "HEADER_EN_ONLY",
        receiptFooterAr: "رسالة_سفلية"
      })
    );
    renderReceipt();
    expect(await screen.findByText("HEADER_EN_ONLY")).toBeTruthy();
    expect(screen.getAllByText("HEADER_EN_ONLY")).toHaveLength(1);
    expect(await screen.findByText("رسالة_سفلية")).toBeTruthy();
    expect(screen.getAllByText("رسالة_سفلية")).toHaveLength(1);
  });

  it("displays package usage details", async () => {
    localStorage.clear();
    const transactionWithUsage: any = {
      id: "trx-usage",
      items: [],
      createdAt: new Date().toISOString(),
      paymentMethod: "cash",
      subtotal: 0,
      tax: 0,
      total: 0,
      packages: [
        {
          id: "pkg1",
          nameEn: "Wash Pack",
          nameAr: "حزمة الغسيل",
          balance: 3,
          totalCredits: 5,
          used: 2,
          expiresAt: new Date("2024-12-31T00:00:00Z").toISOString(),
          items: [
            {
              serviceId: "svc1",
              serviceName: "Wash",
              clothingItemName: "Shirt",
              balance: 3,
              totalCredits: 5,
              used: 2,
            },
          ],
        },
      ],
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <TranslationProvider>
            <ReceiptModal
              transaction={transactionWithUsage}
              isOpen={true}
              onClose={() => {}}
            />
          </TranslationProvider>
        </QueryClientProvider>
      </AuthContext.Provider>
    );

    expect(await screen.findByText(/Wash Pack/)).toBeTruthy();
    expect(await screen.findByText(/Credits used: 2/)).toBeTruthy();
    expect(await screen.findByText(/Credits remaining: 3\/5/)).toBeTruthy();
    expect((await screen.findAllByText(/Expires on/)).length).toBeGreaterThan(0);
  });

  it("applies package credits to totals", async () => {
    localStorage.clear();
    localStorage.setItem("taxRate", "0");

      const transactionWithCredits: any = {
        id: "trx3",
        items: [
          {
            service: { id: "svc1", name: "Wash" },
            clothingItem: { id: "item1", name: "Shirt" },
            quantity: 2,
            price: 2,
            total: 4,
          },
        ],
      createdAt: new Date().toISOString(),
      paymentMethod: "cash",
      subtotal: 4,
      tax: 0,
      total: 2,
      packages: [
        {
          id: "pkg1",
          nameEn: "Wash Pack",
          nameAr: "حزمة الغسيل",
          balance: 4,
          totalCredits: 5,
          used: 1,
          items: [
            {
              serviceId: "svc1",
              serviceName: "Wash",
              clothingItemId: "item1",
              balance: 4,
              totalCredits: 5,
              used: 1,
            },
          ],
        },
      ],
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <AuthContext.Provider value={authValue}>
        <QueryClientProvider client={queryClient}>
          <TranslationProvider>
            <ReceiptModal
              transaction={transactionWithCredits}
              isOpen={true}
              onClose={() => {}}
            />
          </TranslationProvider>
        </QueryClientProvider>
      </AuthContext.Provider>
    );

    expect(await screen.findByText("Subtotal: 4.000 KD")).toBeTruthy();
    expect(
      await screen.findByText("Package Credits: -2.000 KD")
    ).toBeTruthy();
    expect(await screen.findByText("Total: 2.000 KD")).toBeTruthy();
  });
});
