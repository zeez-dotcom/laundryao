import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BranchManager } from "./BranchManager";
import AuthContext from "@/context/AuthContext";
import { TranslationProvider } from "@/context/TranslationContext";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useMutation: () => ({ mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/cities", () => ({
  getCities: () => Promise.resolve([]),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

(global as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("BranchManager", () => {
    it("toggles delivery option", async () => {
    const authValue = {
      user: undefined,
      branch: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: true,
      isSuperAdmin: false,
      isDeliveryAdmin: false,
      isDispatcher: false,
      isDriver: false,
    };
      render(
        <TranslationProvider>
          <AuthContext.Provider value={authValue}>
            <BranchManager />
          </AuthContext.Provider>
        </TranslationProvider>
      );
      await screen.findByText("Add Branch");
      fireEvent.click(screen.getByText("Add Branch"));
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("data-state")).toBe("checked");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("data-state")).toBe("unchecked");
  });
});
