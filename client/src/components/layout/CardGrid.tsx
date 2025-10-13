import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CardChecklistItem = {
  id: string;
  label: string;
  description?: string;
  initiallyChecked?: boolean;
};

export type CardAccordionSection = {
  id: string;
  title: string;
  summary?: string;
  content: ReactNode;
  defaultOpen?: boolean;
};

export type CardGridCard = {
  id: string;
  title: string;
  description?: string;
  badgeLabel?: string;
  icon?: ReactNode;
  accent?: "primary" | "secondary" | "neutral";
  actions?: ReactNode;
  footer?: ReactNode;
  checklist?: CardChecklistItem[];
  persistChecklistKey?: string;
  accordionSections?: CardAccordionSection[];
};

export type CardGridProps = {
  cards: CardGridCard[];
  className?: string;
  columns?: {
    base?: number;
    md?: number;
    lg?: number;
  };
};

const STORAGE_PREFIX = "laundryao.card-grid";

type ChecklistState = Record<string, boolean>;

function usePersistentChecklist(key: string | undefined, items: CardChecklistItem[] | undefined) {
  const storageKey = key ? `${STORAGE_PREFIX}.${key}` : undefined;
  const [state, setState] = useState<ChecklistState>(() => {
    if (!storageKey || typeof window === "undefined") {
      return {};
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        return JSON.parse(raw) as ChecklistState;
      }
    } catch (error) {
      console.warn("Failed to read checklist state", error);
    }
    if (!items) return {};
    return Object.fromEntries(items.map((item) => [item.id, Boolean(item.initiallyChecked)]));
  });

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn("Failed to persist checklist state", error);
    }
  }, [state, storageKey]);

  // Ensure new checklist items are available when definitions change
  useEffect(() => {
    if (!items) return;
    setState((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of items) {
        if (!(item.id in next)) {
          next[item.id] = Boolean(item.initiallyChecked);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [items]);

  const toggle = useCallback((itemId: string, checked: boolean) => {
    setState((prev) => ({ ...prev, [itemId]: checked }));
  }, []);

  return { state, toggle };
}

const GRID_CLASS_MAP: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

function gridClass(count: number, prefix?: string) {
  const safeCount = Math.max(1, Math.min(4, Math.floor(count)));
  const baseClass = GRID_CLASS_MAP[safeCount] ?? GRID_CLASS_MAP[1];
  return prefix ? `${prefix}:${baseClass}` : baseClass;
}

function buildGridClass(columns: CardGridProps["columns"] | undefined) {
  const base = columns?.base ?? 1;
  const md = columns?.md ?? (base > 1 ? base : 2);
  const lg = columns?.lg ?? Math.max(md, 3);
  return cn("grid w-full", gridClass(base), md > 1 ? gridClass(md, "md") : undefined, lg > 1 ? gridClass(lg, "xl") : undefined);
}

function CardGridItem({ card }: { card: CardGridCard }) {
  const { state, toggle } = usePersistentChecklist(card.persistChecklistKey ?? card.id, card.checklist);

  return (
    <Card
      id={`card-${card.id}`}
      className={cn(
        "flex h-full flex-col shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-[var(--focus)]",
        card.accent === "primary" && "border-primary/40 shadow-[var(--shadow-soft)]",
        card.accent === "secondary" && "border-secondary/40",
      )}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {card.icon ? (
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">{card.icon}</div>
            ) : null}
            <div>
              <CardTitle className="font-heading text-[var(--text-lg)] leading-[var(--line-height-tight)]">
                {card.title}
              </CardTitle>
              {card.description ? (
                <CardDescription className="text-[var(--text-sm)] leading-[var(--line-height-relaxed)]">
                  {card.description}
                </CardDescription>
              ) : null}
            </div>
          </div>
          {card.badgeLabel ? (
            <Badge variant={card.accent === "secondary" ? "secondary" : "default"}>{card.badgeLabel}</Badge>
          ) : null}
        </div>
        {card.actions ? <div className="flex flex-wrap gap-2">{card.actions}</div> : null}
      </CardHeader>

      {card.accordionSections?.length ? (
        <CardContent className="space-y-2">
          <Accordion
            type="multiple"
            defaultValue={card.accordionSections.filter((section) => section.defaultOpen).map((section) => section.id)}
            className="w-full"
          >
            {card.accordionSections.map((section) => (
              <AccordionItem key={section.id} value={section.id}>
                <AccordionTrigger className="text-left text-[var(--text-md)]">
                  <div className="flex flex-col items-start gap-1">
                    <span>{section.title}</span>
                    {section.summary ? (
                      <span className="text-[var(--text-sm)] text-muted-foreground">{section.summary}</span>
                    ) : null}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2">{section.content}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      ) : null}

      {card.checklist?.length ? (
        <CardContent className="mt-auto space-y-3 rounded-lg bg-[var(--surface-muted)] p-4">
          <div className="text-[var(--text-sm)] font-medium text-foreground">Contextual checklist</div>
          <ul className="space-y-2">
            {card.checklist.map((item) => (
              <li key={item.id} className="flex items-start gap-3 rounded-md bg-background/60 p-3">
                <Checkbox
                  id={`${card.id}-${item.id}`}
                  checked={Boolean(state[item.id])}
                  onCheckedChange={(checked) => toggle(item.id, Boolean(checked))}
                  aria-describedby={item.description ? `${card.id}-${item.id}-description` : undefined}
                  className="mt-1"
                />
                <div>
                  <label htmlFor={`${card.id}-${item.id}`} className="text-[var(--text-sm)] font-medium text-foreground">
                    {item.label}
                  </label>
                  {item.description ? (
                    <p id={`${card.id}-${item.id}-description`} className="text-[var(--text-xs)] text-muted-foreground">
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}

      {card.footer ? <CardFooter className="mt-auto flex flex-wrap gap-2">{card.footer}</CardFooter> : null}
    </Card>
  );
}

export function CardGrid({ cards, className, columns }: CardGridProps) {
  const gridClassName = useMemo(() => buildGridClass(columns), [columns]);

  return (
    <div
      className={cn(gridClassName, "gap-[var(--space-lg)]", className)}
      style={{
        gap: "var(--space-lg, 1.5rem)",
      }}
      data-testid="card-grid"
    >
      {cards.map((card) => (
        <CardGridItem key={card.id} card={card} />
      ))}
    </div>
  );
}

export default CardGrid;
