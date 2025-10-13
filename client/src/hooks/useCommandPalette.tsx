import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";

type CommandAction = {
  id: string;
  label: string;
  description?: string;
  group?: string;
  keywords?: string[];
  shortcut?: string;
  run: () => void;
};

type CommandPaletteContextValue = {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  commands: CommandAction[];
  registerCommands: (commands: CommandAction[]) => () => void;
  runCommand: (id: string) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

function normalizeCommands(commands: CommandAction[]) {
  const map = new Map<string, CommandAction>();
  commands.forEach((command) => {
    map.set(command.id, command);
  });
  return Array.from(map.values());
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [commands, setCommands] = useState<CommandAction[]>([]);

  const registerCommands = useCallback((newCommands: CommandAction[]) => {
    setCommands((existing) => {
      return normalizeCommands([...existing, ...newCommands]);
    });

    return () => {
      setCommands((existing) => existing.filter((command) => !newCommands.some((item) => item.id === command.id)));
    };
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const runCommand = useCallback(
    (id: string) => {
      const command = commands.find((item) => item.id === id);
      if (!command) return;
      command.run();
      setIsOpen(false);
    },
    [commands],
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === "k") {
        event.preventDefault();
        toggle();
      } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && (key === "p" || key === " ")) {
        event.preventDefault();
        toggle();
      } else if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [toggle]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      isOpen,
      setOpen,
      toggle,
      commands,
      registerCommands,
      runCommand,
    }),
    [commands, isOpen, registerCommands, runCommand, toggle],
  );

  return <CommandPaletteContext.Provider value={value}>{children}</CommandPaletteContext.Provider>;
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (!context) {
    throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  }
  return context;
}

export function useCommandRegistration(commands: CommandAction[], deps: DependencyList = []) {
  const { registerCommands } = useCommandPalette();
  useEffect(() => {
    const unregister = registerCommands(commands);
    return () => unregister();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCommands, ...deps]);
}

export type { CommandAction };
