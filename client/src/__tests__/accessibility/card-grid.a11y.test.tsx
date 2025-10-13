import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, it, expect } from "vitest";
import CardGrid, { type CardGridCard } from "@/components/layout/CardGrid";
import { Button } from "@/components/ui/button";

describe("CardGrid accessibility", () => {
  const cards: CardGridCard[] = [
    {
      id: "demo",
      title: "Demo card",
      description: "A sample card used for accessibility validation.",
      icon: <span aria-hidden="true">🔍</span>,
      accordionSections: [
        {
          id: "summary",
          title: "Summary",
          summary: "High level summary",
          defaultOpen: true,
          content: <p>Progressive disclosure keeps this content tucked away until needed.</p>,
        },
        {
          id: "actions",
          title: "Actions",
          summary: "Available tasks",
          content: <Button variant="outline">Run task</Button>,
        },
      ],
    },
  ];

  it("passes axe checks", async () => {
    const { container } = render(<CardGrid cards={cards} columns={{ base: 1 }} />);
    expect(await axe(container)).toHaveNoViolations();
    expect(container).toMatchSnapshot();
  });
});
