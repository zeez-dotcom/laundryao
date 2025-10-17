import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ServiceSelectionModal } from "./service-selection-modal";
import { TranslationProvider } from "@/context/TranslationContext";
import type { ClothingItem } from "@shared/schema";

vi.mock("@/lib/currency", () => ({
  useCurrency: () => ({ formatCurrency: (value: any) => value }),
}));

const apiRequestMock = vi.hoisted(() =>
  vi.fn<(method: string, url: string) => Promise<Response>>(),
);

vi.mock("@/lib/queryClient", () => ({
  apiRequest: apiRequestMock,
}));

afterEach(() => {
  apiRequestMock.mockReset();
  cleanup();
});

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

describe("ServiceSelectionModal", () => {
  it("fetches services from the product endpoint when clothing item lacks a clothingItemId", async () => {
    apiRequestMock.mockImplementation((_method: string, url: string) => {
      if (url === "/api/categories?type=service") {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.startsWith("/api/products/prod-123/services")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "svc-1",
                name: "Pressing",
                description: "Pressing service",
                categoryId: "cat-1",
                itemPrice: "12.00",
                userId: "user-1",
              },
            ]),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      throw new Error(`Unexpected request for ${url}`);
    });

    const fallbackProduct = {
      id: "prod-123",
      name: "Shirt",
      description: "Fallback shirt product",
      categoryId: "cat-1",
      userId: "user-1",
      productId: "prod-123",
      clothingItemId: null,
    } as unknown as ClothingItem & { productId: string; clothingItemId: null };

    renderWithClient(
      <ServiceSelectionModal
        isOpen={true}
        onClose={() => {}}
        clothingItem={fallbackProduct}
        onAddToCart={() => {}}
        branchCode="br-1"
      />,
    );

    await waitFor(() => {
      const serviceCall = apiRequestMock.mock.calls.find(([, url]) =>
        typeof url === "string" && url.startsWith("/api/products/prod-123/services"),
      );
      expect(serviceCall).toBeTruthy();
    });

    expect(await screen.findByText("Pressing")).toBeTruthy();
  });
});
