import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { CommandCenterTimelineEvent } from "./types";

interface CommandCenterTimelineProps {
  title: string;
  events: CommandCenterTimelineEvent[];
  emptyLabel?: string;
  dataCy?: string;
}

export function CommandCenterTimeline({ title, events, emptyLabel = "No events yet", dataCy }: CommandCenterTimelineProps) {
  return (
    <Card data-cy={dataCy}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-900">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-80 pr-2">
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">{emptyLabel}</p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => {
                const occurredAt = new Date(event.occurredAt);
                const isOptimistic = Boolean(event.optimistic);
                return (
                  <li
                    key={event.id}
                    className={cn(
                      "rounded-lg border border-slate-200 bg-white p-3 shadow-sm",
                      isOptimistic && "border-dashed opacity-80",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-slate-800">{event.title}</div>
                      <span className="text-xs text-slate-500">
                        {Number.isNaN(occurredAt.getTime())
                          ? "Unknown"
                          : formatDistanceToNow(occurredAt, { addSuffix: true })}
                      </span>
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{event.category}</div>
                    {event.details && <p className="mt-1 text-sm text-slate-600">{event.details}</p>}
                    {event.optimistic && (
                      <p className="mt-2 text-xs text-amber-600">Pending server confirmation…</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
