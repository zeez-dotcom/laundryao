import React from "react";
import { render, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, afterEach, expect, vi } from "vitest";
import { PackageForm, type Package } from "./package-form";
import { apiRequest } from "@/lib/queryClient";

vi.mock("@/lib/currency", () => ({
  useCurrency: () => ({ formatCurrency: (n: any) => n }),
}));
vi.mock("./PackageCard", () => ({ PackageCard: () => null }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

function renderWithClient(pkg?: Package) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PackageForm onClose={() => {}} branchId="b1" branchCode="code" pkg={pkg} />
    </QueryClientProvider>,
  );
}

const originalFetch = global.fetch;

describe("PackageForm", () => {
  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it("fetches clothing items", async () => {
    global.fetch = vi.fn((url: RequestInfo) => {
      if (typeof url === "string" && url.startsWith("/api/clothing-items")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    }) as any;

    renderWithClient();

    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls as any[];
      const ciCall = calls.find(([url]) =>
        typeof url === "string" && url.startsWith("/api/clothing-items"),
      );
      expect(ciCall).toBeTruthy();
    });
  });

  it("sends clothing and service credits", async () => {
    global.fetch = vi.fn((url: RequestInfo) => {
      if (typeof url === "string" && url.startsWith("/api/clothing-items")) {
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as any;

    const pkg: Package = {
      id: "p1",
      branchId: "b1",
      nameEn: "Test",
      nameAr: null,
      descriptionEn: null,
      descriptionAr: null,
      price: "0",
      maxItems: null,
      expiryDays: null,
      bonusCredits: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      packageItems: [
        {
          id: "",
          packageId: "",
          serviceId: "s1",
          clothingItemId: "c1",
          categoryId: null,
          credits: 5,
          paidCredits: 5,
        },
      ],
    };

    const { getByText } = renderWithClient(pkg);

    getByText("Update").click();

    await waitFor(() => {
      expect((apiRequest as any).mock.calls[0][2].packageItems[0]).toEqual({
        serviceId: "s1",
        clothingItemId: "c1",
        credits: 5,
      });
    });
  });
});
