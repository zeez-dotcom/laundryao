import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { TranslationProvider } from "@/context/TranslationContext";

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TranslationProvider>
        <ForgotPasswordForm />
      </TranslationProvider>
    </QueryClientProvider>
  );
}

describe("ForgotPasswordForm", () => {
  it("shows error for empty username", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: /send reset link/i }));
    expect(await screen.findByText("Username is required")).toBeTruthy();
  });
});
