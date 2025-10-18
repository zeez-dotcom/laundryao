import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistance, endOfDay, isAfter, isValid } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OrderLog, OrderTimelineEvent } from "@shared/schema";

const ORDER_STATUS_LABELS: Record<string, string> = {
  received: "Received",
  start_processing: "Processing queued",
  processing: "Processing",
  ready: "Ready",
  handed_over: "Handed over",
  completed: "Completed",
};

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: "Pickup pending",
  accepted: "Request accepted",
  driver_enroute: "Driver en route",
  picked_up: "Picked up",
  processing_started: "Processing started",
  ready: "Delivery ready",
  out_for_delivery: "Out for delivery",
  completed: "Delivered",
  cancelled: "Delivery cancelled",
};

function humanizeStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getEventLabel(event: OrderTimelineEvent): string {
  if (event.context === "delivery") {
    return DELIVERY_STATUS_LABELS[event.status] ?? humanizeStatus(event.status);
  }
  return ORDER_STATUS_LABELS[event.status] ?? humanizeStatus(event.status);
}

function computeSlaStatus(log: OrderLog, events: OrderTimelineEvent[]) {
  if (!log.promisedReadyDate) return null;
  const promisedDate = new Date(log.promisedReadyDate);
  if (!isValid(promisedDate)) return null;

  const deadline = endOfDay(promisedDate);
  const readyEvent = events.find(
    (event) =>
      event.context === "order" &&
      ["ready", "handed_over", "completed"].includes(event.status),
  );

  if (readyEvent) {
    const readyTime = new Date(readyEvent.timestamp);
    if (!isValid(readyTime)) return null;
    if (!isAfter(readyTime, deadline)) {
      return {
        text: `Ready within SLA (${format(readyTime, "PPp")})`,
        variant: "secondary" as const,
      };
    }
    return {
      text: `Ready ${formatDistance(deadline, readyTime)} past SLA`,
      variant: "destructive" as const,
    };
  }

  const now = new Date();
  if (isAfter(now, deadline)) {
    return {
      text: `Past SLA by ${formatDistance(deadline, now)}`,
      variant: "destructive" as const,
    };
  }

  return {
    text: `Ready due in ${formatDistance(now, deadline)}`,
    variant: "outline" as const,
  };
}

function getActorName(actor?: string | null) {
  if (!actor || !actor.trim()) return "System";
  return actor;
}

export function OrderLogsTable() {
  const { data: logs = [] } = useQuery<any>({
    queryKey: ["/api/order-logs"],
    queryFn: async () => {
      const res = await fetch("/api/order-logs");
      const json = await res.json().catch(() => []);
      if (Array.isArray(json)) return json;
      if (json && Array.isArray(json.data)) return json.data;
      return [];
    },
  });

  const sortedLogs = useMemo(() => {
    const items: OrderLog[] = Array.isArray(logs)
      ? logs
      : Array.isArray((logs as any)?.data)
      ? (logs as any).data
      : [];
    return items
      .map((log) => ({
        ...log,
        events: [...(log.events ?? [])].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        ),
      }))
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [logs]);

  if (!sortedLogs.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No order activity recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedLogs.map((log) => {
        const slaState = computeSlaStatus(log, log.events);
        const statusLabel = ORDER_STATUS_LABELS[log.status] ?? humanizeStatus(log.status);

        return (
          <Card key={log.id} className="shadow-sm">
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Order {log.orderNumber}</CardTitle>
                <CardDescription className="space-y-1">
                  <p>{log.customerName}</p>
                  {log.packageName ? <p className="text-xs">Package: {log.packageName}</p> : null}
                  {log.createdAt ? (
                    <p className="text-xs text-muted-foreground">
                      Created {format(new Date(log.createdAt), "PPp")}
                    </p>
                  ) : null}
                </CardDescription>
              </div>
              <div className="flex flex-col items-start gap-2 md:items-end">
                <Badge variant="outline" className="uppercase tracking-wide">
                  {statusLabel}
                </Badge>
                {slaState ? <Badge variant={slaState.variant}>{slaState.text}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent>
              <ol className="relative border-l border-border pl-6">
                {log.events.map((event, index) => {
                  const occurredAt = new Date(event.timestamp);
                  const prev = index > 0 ? new Date(log.events[index - 1].timestamp) : null;
                  const delta = prev && isValid(prev) && isValid(occurredAt)
                    ? formatDistance(prev, occurredAt)
                    : null;

                  return (
                    <li key={event.id} className="mb-6 last:mb-0">
                      <span className="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            event.context === "delivery" ? "bg-blue-500" : "bg-emerald-500"
                          }`}
                        />
                      </span>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium leading-none">{getEventLabel(event)}</p>
                          <p className="text-xs text-muted-foreground">
                            by {getActorName(event.actor)}
                          </p>
                        </div>
                        <time className="text-xs text-muted-foreground">
                          {isValid(occurredAt) ? format(occurredAt, "PPp") : "Unknown"}
                        </time>
                      </div>
                      {delta ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {delta} since previous step
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default OrderLogsTable;
