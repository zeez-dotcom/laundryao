import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

export interface RescheduleWindow {
  start: string;
  end: string;
  label?: string;
}

interface RescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  windows: RescheduleWindow[];
  submitting?: boolean;
  onSubmit: (window: RescheduleWindow) => Promise<void> | void;
  policy?: { minimumNoticeMinutes: number; remainingReschedules: number };
}

export function RescheduleDialog({
  open,
  onOpenChange,
  windows,
  onSubmit,
  submitting,
  policy,
}: RescheduleDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    const window = windows.find((slot) => slot.start === selected);
    if (!window) {
      setError("Please choose a time window");
      return;
    }
    await Promise.resolve(onSubmit(window));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reschedule delivery</DialogTitle>
          <DialogDescription>
            Choose a new window that works for you. We&apos;ll notify the driver automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {policy ? (
            <p className="text-xs text-muted-foreground">
              Minimum notice {policy.minimumNoticeMinutes} minutes. Remaining reschedules: {policy.remainingReschedules}.
            </p>
          ) : null}

          <RadioGroup value={selected ?? ""} onValueChange={(value) => setSelected(value)} className="space-y-3">
            {windows.map((window) => (
              <Label
                key={window.start}
                htmlFor={`slot-${window.start}`}
                className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition hover:border-primary"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {window.label ?? `${new Date(window.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    `}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(window.start).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {" · "}
                    {new Date(window.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" – "}
                    {new Date(window.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <RadioGroupItem value={window.start} id={`slot-${window.start}`} />
              </Label>
            ))}
          </RadioGroup>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || !windows.length}>
            {submitting ? "Updating…" : "Confirm reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
