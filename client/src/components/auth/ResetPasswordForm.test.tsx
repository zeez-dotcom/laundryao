import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { TranslationProvider } from "@/context/TranslationContext";

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TranslationProvider>
        <ResetPasswordForm token="test" />
      </TranslationProvider>
    </QueryClientProvider>
  );
}

describe("ResetPasswordForm", () => {
  it("validates password requirements", async () => {
    renderForm();
    fireEvent.change(await screen.findByLabelText(/New Password/i), { target: { value: "short" } });
    fireEvent.change(await screen.findByLabelText(/Confirm Password/i), { target: { value: "short" } });
    fireEvent.click(await screen.findByRole("button", { name: /reset password/i }));
    expect(
      await screen.findByText(
        "Password must be at least 8 characters long and include uppercase, lowercase letters and a number",
      ),
    ).toBeTruthy();
  });
});
