import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { useEffect } from "react";
import { describe, it, expect } from "vitest";
import CommandPalette from "@/components/navigation/CommandPalette";
import { CommandPaletteProvider, useCommandPalette } from "@/hooks/useCommandPalette";
import { TourProvider } from "@/components/onboarding/TourProvider";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverMock as unknown as typeof window.ResizeObserver
}

if (!(globalThis as any).ResizeObserver) {
  ;(globalThis as any).ResizeObserver = ResizeObserverMock
}

function PaletteHarness() {
  const { setOpen, registerCommands } = useCommandPalette();

  useEffect(() => {
    const unregister = registerCommands([
      {
        id: "demo-command",
        label: "Demo command",
        description: "A sample action used for testing",
        group: "Testing",
        run: () => undefined,
      },
    ]);
    setOpen(true);
    return () => {
      unregister();
      setOpen(false);
    };
  }, [registerCommands, setOpen]);

  return <CommandPalette />;
}

describe("CommandPalette accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <CommandPaletteProvider>
        <TourProvider>
          <PaletteHarness />
        </TourProvider>
      </CommandPaletteProvider>,
    );

    expect(await axe(container)).toHaveNoViolations();
    expect(container).toMatchSnapshot();
  });
});
