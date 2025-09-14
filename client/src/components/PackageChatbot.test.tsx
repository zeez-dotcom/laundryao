import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi } from "vitest";
import { PackageChatbot } from "./PackageChatbot";
import AuthContext from "@/context/AuthContext";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe.skip("PackageChatbot", () => {
  it("includes selected products in summary and payload", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const authValue = {
      user: undefined,
      branch: { code: "b1", id: "b1", name: "B1" } as any,
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      isSuperAdmin: false,
      isDeliveryAdmin: false,
      isDispatcher: false,
      isDriver: false,
    };

    let requestBody: any = null;
    const originalFetch = global.fetch;
    const mockFetch = vi.fn((url: RequestInfo, options?: RequestInit) => {
      if (typeof url === "string" && url.startsWith("/api/products")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                { id: "p1", name: "Prod1" },
                { id: "p2", name: "Prod2" },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
      if (typeof url === "string" && url.startsWith("/api/laundry-services")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([{ id: "s1", name: "Wash" }]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (typeof url === "string" && url.startsWith("/api/item-prices")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ price: 2 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      if (typeof url === "string" && url.startsWith("/api/packages")) {
        requestBody = JSON.parse(options?.body as string);
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    // @ts-ignore
    global.fetch = mockFetch;

    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authValue}>
          <PackageChatbot open={true} onClose={() => {}} />
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "MyPkg" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await screen.findByText("Prod1");

    fireEvent.click(screen.getByRole("button", { name: "Prod1" }));
    fireEvent.click(screen.getByRole("button", { name: "Prod2" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    fireEvent.click(screen.getByRole("button", { name: "Prod1" }));
    await screen.findByRole("button", { name: "Wash" });
    fireEvent.click(screen.getByRole("button", { name: "Wash" }));
    await screen.findByRole("button", { name: "Add another" });
    fireEvent.click(screen.getByRole("button", { name: "Add another" }));

    await screen.findByRole("button", { name: "Prod2" });
    fireEvent.click(screen.getByRole("button", { name: "Prod2" }));
    await screen.findByRole("button", { name: "Wash" });
    fireEvent.click(screen.getByRole("button", { name: "Wash" }));
    await screen.findByRole("button", { name: "Done" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await screen.findByText("How many paid credits?");

    let textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "10" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "2" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "0" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    await screen.findByText("Create another");

    await waitFor(() => {
      expect(screen.getByText(/Products: Prod1, Prod2\./)).toBeTruthy();
    });

    expect(requestBody).toBeTruthy();
    expect(requestBody.packageItems).toHaveLength(2);
    expect(requestBody.packageItems.map((p: any) => p.clothingItemId)).toEqual([
      "p1",
      "p2",
    ]);

    global.fetch = originalFetch;
  });
});

