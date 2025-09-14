import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { CustomerDialog } from "./customer-dialog";
import { TranslationProvider } from "@/context/TranslationContext";

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TranslationProvider>
        <CustomerDialog onSelectCustomer={() => {}} />
      </TranslationProvider>
    </QueryClientProvider>
  );
}

describe("CustomerDialog", () => {
  it("shows errors for missing data", async () => {
    renderDialog();
    await screen.findByText("Select Customer");
    fireEvent.click(screen.getByText("Select Customer"));
    fireEvent.click(screen.getByText("Add Customer"));
    expect(await screen.findByText("Phone number is required")).toBeTruthy();
    expect(await screen.findByText("Name is required")).toBeTruthy();
  });
});
