import { useEffect, useMemo } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useCommandPalette } from "@/hooks/useCommandPalette";
import { useLocation } from "wouter";
import { useTour } from "@/components/onboarding/TourProvider";
import { LifeBuoy, ListChecks, Package, Settings2, ShoppingCart, Users } from "lucide-react";

type GroupedCommand = {
  heading: string;
  items: {
    id: string;
    label: string;
    description?: string;
    shortcut?: string;
  }[];
};

export function CommandPalette() {
  const { isOpen, setOpen, registerCommands, commands, runCommand } = useCommandPalette();
  const [, setLocation] = useLocation();
  const { availableTours, startTour } = useTour();

  useEffect(() => {
    const unregister = registerCommands([
      {
        id: "navigate-pos",
        label: "Go to Point of Sale",
        description: "Jump to the primary sales workspace",
        group: "Navigation",
        shortcut: "G P",
        run: () => setLocation("/"),
      },
      {
        id: "navigate-admin",
        label: "Open Admin Dashboard",
        description: "Manage branches, users, and business settings",
        group: "Navigation",
        shortcut: "G A",
        run: () => setLocation("/admin"),
      },
      {
        id: "navigate-packages",
        label: "Review Packages",
        description: "View and configure subscription bundles",
        group: "Navigation",
        shortcut: "G K",
        run: () => setLocation("/packages"),
      },
      {
        id: "navigate-customers",
        label: "Customer Dashboard",
        description: "Check loyalty, rewards, and promotions",
        group: "Navigation",
        shortcut: "G C",
        run: () => setLocation("/customer-dashboard"),
      },
      {
        id: "navigate-driver",
        label: "Driver Console",
        description: "Monitor delivery routes and assignments",
        group: "Navigation",
        shortcut: "G D",
        run: () => setLocation("/driver"),
      },
    ]);

    return () => unregister();
  }, [registerCommands, setLocation]);

  useEffect(() => {
    if (!availableTours.length) return;
    const unregister = registerCommands(
      availableTours.map((tour) => ({
        id: `tour-${tour.id}`,
        label: `Start ${tour.title} tour`,
        description: "Launch guided onboarding",
        group: "Onboarding",
        shortcut: "?",
        run: () => startTour(tour.id),
      })),
    );
    return () => unregister();
  }, [availableTours, registerCommands, startTour]);

  const groupedCommands = useMemo<GroupedCommand[]>(() => {
    if (commands.length === 0) return [];
    const groups = new Map<string, GroupedCommand>();
    commands.forEach((command) => {
      const heading = command.group ?? "General";
      if (!groups.has(heading)) {
        groups.set(heading, { heading, items: [] });
      }
      groups.get(heading)?.items.push({
        id: command.id,
        label: command.label,
        description: command.description,
        shortcut: command.shortcut,
      });
    });
    return Array.from(groups.values()).map((group) => ({
      heading: group.heading,
      items: group.items.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [commands]);

  const leadingIcon = useMemo(() => {
    if (!isOpen) return null;
    const navigation = commands.find((cmd) => cmd.id === "navigate-pos");
    if (navigation) return <ShoppingCart className="size-5 text-primary" aria-hidden="true" />;
    return null;
  }, [commands, isOpen]);

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen}>
      <CommandInput placeholder="Search commands, pages, or tours…" />
      <CommandList>
        <CommandEmpty>No commands found. Try searching for a page or workflow.</CommandEmpty>
        {leadingIcon ? (
          <div className="flex items-center gap-2 px-4 py-2 text-[var(--text-sm)] text-muted-foreground">
            {leadingIcon}
            <span>Use ⌘K / Ctrl+K to toggle this palette from anywhere.</span>
          </div>
        ) : null}
        {groupedCommands.map((group, index) => (
          <div key={group.heading}>
            <CommandGroup heading={group.heading}>
              {group.items.map((item) => (
                <CommandItem key={item.id} onSelect={() => runCommand(item.id)} value={item.label}>
                  <GroupIcon heading={group.heading} />
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    {item.description ? (
                      <span className="text-[var(--text-xs)] text-muted-foreground">{item.description}</span>
                    ) : null}
                  </div>
                  {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {index < groupedCommands.length - 1 ? <CommandSeparator /> : null}
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

function GroupIcon({ heading }: { heading: string }) {
  switch (heading) {
    case "Navigation":
      return <ShoppingCart className="mr-3 size-4 text-primary" aria-hidden="true" />;
    case "Quick Actions":
      return <Settings2 className="mr-3 size-4 text-secondary" aria-hidden="true" />;
    case "Onboarding":
      return <LifeBuoy className="mr-3 size-4 text-accent" aria-hidden="true" />;
    case "Customers":
      return <Users className="mr-3 size-4 text-primary" aria-hidden="true" />;
    case "Operations":
      return <ListChecks className="mr-3 size-4 text-secondary" aria-hidden="true" />;
    case "Packages":
      return <Package className="mr-3 size-4 text-accent" aria-hidden="true" />;
    default:
      return <ShoppingCart className="mr-3 size-4 text-muted-foreground" aria-hidden="true" />;
  }
}

export default CommandPalette;
