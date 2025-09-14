import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TranslationProvider } from "@/context/TranslationContext";
import { useTranslation } from "@/lib/i18n";

function TestComponent() {
  const { t, setLanguage } = useTranslation();
  return (
    <div>
      <span data-testid="sales">{t.sales}</span>
      <span data-testid="delivery">{t.deliveryOrders}</span>
      <span data-testid="ready">{t.ready}</span>
      <button onClick={() => setLanguage("ar")}>change</button>
    </div>
  );
}

describe("TranslationProvider", () => {
  it("updates direction and text on language change", async () => {
    render(
      <TranslationProvider>
        <TestComponent />
      </TranslationProvider>
    );

    expect(document.dir).toBe("ltr");
    await screen.findByTestId("sales");
    expect(screen.getByTestId("sales").textContent).toBe("Sales");
    expect(screen.getByTestId("delivery").textContent).toBe("Delivery Orders");
    expect(screen.getByTestId("ready").textContent).toBe("Ready");

    fireEvent.click(screen.getByText("change"));

    await screen.findByText("المبيعات");
    expect(document.dir).toBe("rtl");
    expect(screen.getByTestId("sales").textContent).toBe("المبيعات");
    expect(screen.getByTestId("delivery").textContent).toBe("طلبات التوصيل");
    expect(screen.getByTestId("ready").textContent).toBe("جاهز");
  });
});

