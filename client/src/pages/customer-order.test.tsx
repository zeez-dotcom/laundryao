import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CustomerOrderPage from "./customer-order";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TranslationProvider } from "@/context/TranslationContext";

// Mock routing hooks from wouter
const setLocationMock = vi.fn();
vi.mock("wouter", async (orig) => {
  const mod: any = await orig();
  return {
    ...mod,
    useLocation: () => ["/order", setLocationMock] as const,
    useSearch: () => "?qr=TESTQR",
  };
});

// Mock apiRequest to resolve QR data quickly
vi.mock("@/lib/queryClient", async (orig) => {
  const mod: any = await orig();
  return {
    ...mod,
    apiRequest: vi.fn(async (_method: string, url: string) => {
      if (url.startsWith("/api/qr/")) {
        return {
          ok: true,
          json: async () => ({
            qrCode: { id: "1", branchId: "b1", qrCode: "TESTQR", isActive: true, createdAt: new Date().toISOString() },
            branch: { id: "b1", name: "had1", code: "HAD", address: "addr", phone: "123" },
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }),
  };
});

describe("CustomerOrderPage", () => {
  it("navigates to auth with next=ordering when starting chat assistant", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TranslationProvider>
          <CustomerOrderPage />
        </TranslationProvider>
      </QueryClientProvider>
    );

    // Wait for the page to load the QR data and render buttons
    const chatBtn = await screen.findByTestId("button-start-chat");
    fireEvent.click(chatBtn);

    await waitFor(() => {
      expect(setLocationMock).toHaveBeenCalledWith("/customer-auth?qr=TESTQR&next=ordering");
    });
  });
});

