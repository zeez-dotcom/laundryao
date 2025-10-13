import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STORAGE_KEYS = {
  dismissed: "laundryao.tours.dismissed",
  progress: "laundryao.tours.progress",
  glossary: "laundryao.tours.glossary",
};

type TourStep = {
  id: string;
  title: string;
  description: string;
  ctaLabel?: string;
};

type TourDefinition = {
  id: string;
  title: string;
  description?: string;
  steps: TourStep[];
};

type GlossaryEntry = {
  term: string;
  description: string;
};

type TourContextValue = {
  registerTour: (tour: TourDefinition) => () => void;
  startTour: (tourId: string) => void;
  goToStep: (step: number) => void;
  completeStep: () => void;
  dismissTour: (tourId: string) => void;
  isTourDismissed: (tourId: string) => boolean;
  activeTourId: string | null;
  activeStepIndex: number;
  activeTour?: TourDefinition;
  registerGlossaryEntries: (entries: GlossaryEntry[]) => void;
  glossary: Record<string, GlossaryEntry>;
  seenGlossaryTerms: Set<string>;
  markGlossarySeen: (term: string) => void;
  availableTours: TourDefinition[];
};

const TourContext = createContext<TourContextValue | null>(null);

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn(`Failed to read local storage for ${key}`, error);
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to persist ${key}`, error);
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [tours, setTours] = useState<Record<string, TourDefinition>>({});
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [dismissedTours, setDismissedTours] = useState<string[]>(() => readLocalStorage(STORAGE_KEYS.dismissed, []));
  const [tourProgress, setTourProgress] = useState<Record<string, number>>(() => readLocalStorage(STORAGE_KEYS.progress, {}));
  const [glossary, setGlossary] = useState<Record<string, GlossaryEntry>>(() => readLocalStorage(STORAGE_KEYS.glossary, {}));
  const [seenGlossaryTerms, setSeenGlossaryTerms] = useState<Set<string>>(() => {
    const initial = readLocalStorage<string[]>(`${STORAGE_KEYS.glossary}.seen`, []);
    return new Set(initial);
  });
  const isDismissingRef = useRef(false);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.dismissed, dismissedTours);
  }, [dismissedTours]);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.progress, tourProgress);
  }, [tourProgress]);

  useEffect(() => {
    writeLocalStorage(STORAGE_KEYS.glossary, glossary);
  }, [glossary]);

  useEffect(() => {
    writeLocalStorage(`${STORAGE_KEYS.glossary}.seen`, Array.from(seenGlossaryTerms));
  }, [seenGlossaryTerms]);

  const registerTour = useCallback((tour: TourDefinition) => {
    setTours((current) => ({ ...current, [tour.id]: tour }));
    return () => {
      setTours((current) => {
        const next = { ...current };
        delete next[tour.id];
        return next;
      });
    };
  }, []);

  const startTour = useCallback(
    (tourId: string) => {
      if (dismissedTours.includes(tourId)) return;
      const tour = tours[tourId];
      if (!tour || tour.steps.length === 0) return;
      setActiveTourId(tourId);
      setActiveStepIndex(() => {
        const savedStep = tourProgress[tourId] ?? 0;
        return Math.min(savedStep, tour.steps.length - 1);
      });
    },
    [dismissedTours, tours, tourProgress],
  );

  const goToStep = useCallback(
    (index: number) => {
      if (!activeTourId) return;
      const tour = tours[activeTourId];
      if (!tour) return;
      const clamped = Math.max(0, Math.min(index, tour.steps.length - 1));
      setActiveStepIndex(clamped);
      setTourProgress((current) => ({ ...current, [activeTourId]: clamped }));
    },
    [activeTourId, tours],
  );

  const dismissTour = useCallback(
    (tourId: string) => {
      setDismissedTours((current) => (current.includes(tourId) ? current : [...current, tourId]));
      setTourProgress((current) => ({ ...current, [tourId]: 0 }));
      if (activeTourId === tourId) {
        isDismissingRef.current = true;
        setActiveTourId(null);
      }
    },
    [activeTourId],
  );

  const completeStep = useCallback(() => {
    if (!activeTourId) return;
    const tour = tours[activeTourId];
    if (!tour) return;
    const nextIndex = activeStepIndex + 1;
    if (nextIndex >= tour.steps.length) {
      dismissTour(tour.id);
      return;
    }
    setActiveStepIndex(nextIndex);
    setTourProgress((current) => ({ ...current, [tour.id]: nextIndex }));
  }, [activeTourId, activeStepIndex, dismissTour, tours]);

  useEffect(() => {
    if (!activeTourId || isDismissingRef.current) {
      isDismissingRef.current = false;
      return;
    }
    const tour = tours[activeTourId];
    if (!tour) {
      setActiveTourId(null);
      return;
    }
    setTourProgress((current) => ({ ...current, [tour.id]: activeStepIndex }));
  }, [activeTourId, activeStepIndex, tours]);

  const registerGlossaryEntries = useCallback((entries: GlossaryEntry[]) => {
    setGlossary((current) => {
      const next = { ...current };
      entries.forEach((entry) => {
        const key = entry.term.toLowerCase();
        next[key] = entry;
      });
      return next;
    });
  }, []);

  const markGlossarySeen = useCallback((term: string) => {
    setSeenGlossaryTerms((current) => {
      const next = new Set(current);
      next.add(term.toLowerCase());
      return next;
    });
  }, []);

  const isTourDismissed = useCallback((tourId: string) => dismissedTours.includes(tourId), [dismissedTours]);

  const activeTour = activeTourId ? tours[activeTourId] : undefined;

  const value = useMemo<TourContextValue>(
    () => ({
      registerTour,
      startTour,
      goToStep,
      completeStep,
      dismissTour,
      isTourDismissed,
      activeTourId,
      activeStepIndex,
      activeTour,
      registerGlossaryEntries,
      glossary,
      seenGlossaryTerms,
      markGlossarySeen,
      availableTours: Object.values(tours),
    }),
    [
      registerTour,
      startTour,
      goToStep,
      completeStep,
      dismissTour,
      isTourDismissed,
      activeTourId,
      activeStepIndex,
      activeTour,
      registerGlossaryEntries,
      glossary,
      seenGlossaryTerms,
      markGlossarySeen,
      tours,
    ],
  );

  const currentStep = activeTour ? activeTour.steps[activeStepIndex] : undefined;
  const progress = activeTour ? ((activeStepIndex + 1) / activeTour.steps.length) * 100 : 0;

  return (
    <TourContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(activeTour)} onOpenChange={(open) => !open && activeTour && dismissTour(activeTour.id)}>
        <DialogContent aria-describedby={currentStep ? `${currentStep.id}-description` : undefined}>
          {activeTour ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-[var(--text-lg)]">{activeTour.title}</DialogTitle>
                <DialogDescription className="text-[var(--text-sm)]">
                  {activeTour.description || "Follow each step to get oriented."}
                </DialogDescription>
              </DialogHeader>
              {currentStep ? (
                <div className="space-y-4">
                  <div className="rounded-lg bg-[var(--surface-muted)] p-4">
                    <div className="text-[var(--text-sm)] font-semibold" id={`${currentStep.id}-title`}>
                      {currentStep.title}
                    </div>
                    <p id={`${currentStep.id}-description`} className="text-[var(--text-sm)] text-muted-foreground">
                      {currentStep.description}
                    </p>
                  </div>
                  <Progress value={progress} aria-hidden={false} aria-label="Onboarding progress" />
                </div>
              ) : null}
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => activeTour && dismissTour(activeTour.id)}>
                  Skip tour
                </Button>
                {activeTour && currentStep ? (
                  <Button onClick={completeStep}>{currentStep.ctaLabel || "Next"}</Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </TourContext.Provider>
  );
}

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return context;
}

type GlossaryTooltipProps = {
  term: string;
  children?: ReactNode;
  className?: string;
};

export function GlossaryTooltip({ term, children, className }: GlossaryTooltipProps) {
  const { glossary, markGlossarySeen, seenGlossaryTerms } = useTour();
  const key = term.toLowerCase();
  const entry = glossary[key];

  if (!entry) {
    return <>{children ?? term}</>;
  }

  const hasSeen = seenGlossaryTerms.has(key);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onFocus={() => markGlossarySeen(term)}
          onMouseEnter={() => markGlossarySeen(term)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[var(--text-xs)]",
            hasSeen ? "bg-[var(--surface-muted)] text-muted-foreground" : "bg-primary/10 text-primary",
            className,
          )}
        >
          {children ?? entry.term}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-2">
        <div className="text-[var(--text-sm)] font-semibold">{entry.term}</div>
        <p className="text-[var(--text-xs)] text-muted-foreground">{entry.description}</p>
        <Button variant="ghost" size="sm" onClick={() => markGlossarySeen(term)}>
          Got it
        </Button>
      </TooltipContent>
    </Tooltip>
  );
}
