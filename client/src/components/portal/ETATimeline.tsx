import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Clock } from "lucide-react";

export interface TimelineStage {
  id: string;
  label: string;
  description?: string;
  completed?: boolean;
  current?: boolean;
  timestamp?: string | null;
}

interface ETATimelineProps {
  stages: TimelineStage[];
  etaMinutes?: number | null;
  statusLabel?: string;
}

export function ETATimeline({ stages, etaMinutes, statusLabel }: ETATimelineProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">Status</p>
          <p className="text-lg font-semibold text-foreground">{statusLabel ?? "Tracking"}</p>
        </div>
        <div className="flex items-center space-x-2 rounded-full bg-muted px-3 py-1 text-sm font-medium">
          <Clock className="h-4 w-4" />
          <span>
            {etaMinutes != null
              ? `ETA ${Math.max(0, Math.round(etaMinutes))} min`
              : "ETA pending"}
          </span>
        </div>
      </div>

      <ol className="space-y-4">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          return (
            <li key={stage.id} className="relative flex items-start space-x-3">
              <span
                className={cn(
                  "mt-1 flex h-6 w-6 items-center justify-center rounded-full border-2",
                  stage.completed
                    ? "border-green-500 bg-green-500/10 text-green-600"
                    : stage.current
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted-foreground/40 text-muted-foreground",
                )}
              >
                {stage.completed ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{stage.label}</p>
                    {stage.description ? (
                      <p className="text-xs text-muted-foreground">{stage.description}</p>
                    ) : null}
                  </div>
                  {stage.timestamp ? (
                    <time className="text-xs text-muted-foreground" dateTime={stage.timestamp}>
                      {new Date(stage.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  ) : null}
                </div>
                {!isLast ? <div className="mt-4 ml-3 h-6 w-px bg-border" aria-hidden="true" /> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
