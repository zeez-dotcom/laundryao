import { render, screen, within, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { ReceiptModal } from "./receipt-modal";
import { TranslationProvider } from "@/context/TranslationContext";
import AuthContext from "@/context/AuthContext";

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
      items: [
        {
          serviceId: "svc1",
          serviceName: "Wash",
          balance: 3,
          totalCredits: 5,
          used: 0,
        },
      ],
    },
  ],
};

function renderReceipt() {
  render(
    <AuthContext.Provider value={authValue}>
      <TranslationProvider>
        <ReceiptModal transaction={transaction} isOpen={true} onClose={() => {}} />
      </TranslationProvider>
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

    render(
      <AuthContext.Provider value={authValue}>
        <TranslationProvider>
          <ReceiptModal
            transaction={transactionWithOrder}
            isOpen={true}
            onClose={() => {}}
          />
        </TranslationProvider>
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

  it("shows package service balances", async () => {
    localStorage.clear();
    renderReceipt();
    expect(await screen.findByText(/Wash Pack/)).toBeTruthy();
    const usedRows = await screen.findAllByText(/Used: 0/);
    expect(usedRows.length).toBeGreaterThan(0);
    const remainingRows = await screen.findAllByText(/Remaining: 3\/5/);
    expect(remainingRows.length).toBeGreaterThan(0);
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

    render(
      <AuthContext.Provider value={authValue}>
        <TranslationProvider>
          <ReceiptModal
            transaction={transactionWithCredits}
            isOpen={true}
            onClose={() => {}}
          />
        </TranslationProvider>
      </AuthContext.Provider>
    );

    expect(await screen.findByText("Subtotal: 4.000 KD")).toBeTruthy();
    expect(
      await screen.findByText("Package Credits: -2.000 KD")
    ).toBeTruthy();
    expect(await screen.findByText("Total: 2.000 KD")).toBeTruthy();
  });
});
