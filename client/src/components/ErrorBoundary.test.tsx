import type { JSX } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import ErrorBoundary from "./ErrorBoundary";
import * as errorReporting from "@/lib/error-reporting";

function Thrower(): JSX.Element {
  throw new Error("Failure with secret=123");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports captured errors through the reporting helper", async () => {
    const reportErrorSpy = vi
      .spyOn(errorReporting, "reportError")
      .mockResolvedValue();

    render(
      <ErrorBoundary fallback={<div role="status">fallback ui</div>}>
        <Thrower />
      </ErrorBoundary>,
    );

    await screen.findByRole("status");

    expect(reportErrorSpy).toHaveBeenCalledTimes(1);
    const [errorArg, metadataArg] = reportErrorSpy.mock.calls[0];
    expect(errorArg).toBeInstanceOf(Error);
    expect(metadataArg).toMatchObject({
      componentStack: expect.stringContaining("Thrower"),
      boundary: "ErrorBoundary",
    });
    expect(JSON.stringify(metadataArg)).not.toContain("secret=123");
  });
});
