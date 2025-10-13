import { useEffect, useMemo, useState } from "react";
import PackageList from "@/components/package-list";
import { Button } from "@/components/ui/button";
import PackageChatbot from "@/components/PackageChatbot";
import CardGrid, { type CardGridCard } from "@/components/layout/CardGrid";
import { Package } from "lucide-react";
import { GlossaryTooltip, useTour } from "@/components/onboarding/TourProvider";

export default function PackagesPage() {
  const [showChatbot, setShowChatbot] = useState(false);
  const { registerTour, startTour, isTourDismissed, registerGlossaryEntries } = useTour();

  useEffect(() => {
    registerGlossaryEntries([
      {
        term: "Progressive disclosure",
        description: "Expand accordions to move from package setup to enablement without leaving the page.",
      },
      {
        term: "Package assistant",
        description: "An AI helper that answers eligibility questions and suggests upsell bundles.",
      },
    ]);
    const cleanup = registerTour({
      id: "packages",
      title: "Package operations tour",
      description: "Understand how the new card keeps configuration and coaching side by side.",
      steps: [
        {
          id: "packages-catalog",
          title: "Catalog accordion",
          description: "Expand the catalog section to edit bundles and pricing without losing context.",
        },
        {
          id: "packages-assistant",
          title: "Assistant",
          description: "Use the package assistant to answer customer questions during configuration.",
        },
      ],
    });
    if (!isTourDismissed("packages")) {
      startTour("packages");
    }
    return () => cleanup();
  }, [isTourDismissed, registerGlossaryEntries, registerTour, startTour]);

  const cards = useMemo<CardGridCard[]>(
    () => [
      {
        id: "packages",
        title: "Package studio",
        description: "Design, publish, and explain bundles in one view.",
        icon: <Package className="size-5" aria-hidden="true" />,
        accent: "secondary",
        accordionSections: [
          {
            id: "packages-workspace",
            title: "Package catalog",
            summary: "Create and manage subscriptions across branches.",
            defaultOpen: true,
            content: <PackageList />,
          },
          {
            id: "packages-assistant",
            title: "Package assistant",
            summary: "Answer customer questions with AI guidance.",
            content: (
              <div className="space-y-3">
                <Button onClick={() => setShowChatbot((prev) => !prev)} variant="outline" size="sm">
                  {showChatbot ? "Hide assistant" : "Launch assistant"}
                </Button>
                <PackageChatbot open={showChatbot} onClose={() => setShowChatbot(false)} />
              </div>
            ),
          },
        ],
        checklist: [
          {
            id: "validate-eligibility",
            label: "Validate eligibility",
            description: "Confirm bundle targeting rules before publishing.",
          },
          {
            id: "sync-copy",
            label: "Sync marketing copy",
            description: "Align package descriptions with the marketing team.",
          },
          {
            id: "demo-assistant",
            label: "Demo the assistant",
            description: "Show teammates how to use the AI helper during customer calls.",
          },
        ],
        persistChecklistKey: "packages-studio",
      },
    ],
    [showChatbot],
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-foreground">
      <header className="border-b bg-[var(--surface-elevated)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6">
          <h1 className="text-[var(--text-xl)] font-semibold">Packages & campaigns</h1>
          <p className="text-[var(--text-sm)] text-muted-foreground">
            Pair <GlossaryTooltip term="Progressive disclosure" className="ml-1" /> with the
            <GlossaryTooltip term="Package assistant" className="ml-1" /> to configure bundles efficiently.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <CardGrid cards={cards} columns={{ base: 1 }} />
      </main>
    </div>
  );
}
