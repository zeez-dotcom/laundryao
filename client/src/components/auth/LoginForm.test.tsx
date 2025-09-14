import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { LoginForm } from "./LoginForm";
import { TranslationProvider } from "@/context/TranslationContext";

function renderLoginForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TranslationProvider>
        <LoginForm />
      </TranslationProvider>
    </QueryClientProvider>
  );
}

describe("LoginForm", () => {
  it("shows errors for empty fields", async () => {
    renderLoginForm();
    const btn = await screen.findByRole("button", { name: /sign in/i });
    fireEvent.click(btn);
    expect(await screen.findByText("Username is required")).toBeTruthy();
    expect(await screen.findByText("Password is required")).toBeTruthy();
  });
});
