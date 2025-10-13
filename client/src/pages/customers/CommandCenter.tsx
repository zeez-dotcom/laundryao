import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommandCenterDossier } from "@/components/customers/CommandCenterDossier";
import { CommandCenterActions } from "@/components/customers/CommandCenterActions";
import { CommandCenterTimeline } from "@/components/customers/CommandCenterTimeline";
import { CommandCenterPackages } from "@/components/customers/CommandCenterPackages";
import type { CommandCenterOrder, CommandCenterResponse } from "@/components/customers/types";

interface CommandCenterPageProps {
  params: {
    id: string;
  };
}

function buildOrderTimeline(orders: CommandCenterOrder[]) {
  return orders
    .map((order) => ({
      id: `order-${order.id}`,
      occurredAt: order.createdAt ?? new Date().toISOString(),
      category: "order" as const,
      title: `Order ${order.orderNumber} (${order.status ?? "unknown"})`,
      details: `Total E£ ${order.total.toFixed(2)} • Remaining E£ ${order.remaining.toFixed(2)}`,
    }))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export default function CommandCenterPage({ params }: CommandCenterPageProps) {
  const [_, navigate] = useLocation();
  const customerId = params?.id;
  const queryKey = useMemo(() => [`/api/customers/${customerId}/command-center`], [customerId]);

  const { data, isLoading, error, refetch } = useQuery<CommandCenterResponse>({
    queryKey,
    enabled: Boolean(customerId),
  });

  if (!customerId) {
    return (
      <Card className="mx-auto mt-10 max-w-3xl">
        <CardHeader>
          <CardTitle>Customer not specified</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">Pick a customer from the directory to open the command center.</p>
          <Button variant="secondary" onClick={() => navigate("/customers")}>Go to customers</Button>
        </CardContent>
      </Card>
    );
  }

  const orderEvents = useMemo(() => buildOrderTimeline(data?.orders ?? []), [data?.orders]);

  if (isLoading) {
    return (
      <Card className="mx-auto mt-10 max-w-4xl">
        <CardHeader>
          <CardTitle>Loading customer dossier…</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">Fetching orders, balances, and insights.</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="mx-auto mt-10 max-w-4xl">
        <CardHeader>
          <CardTitle>Unable to load command center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            {(error as Error | undefined)?.message || "The command center endpoint returned no data."}
          </p>
          <Button onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 px-4 pb-10 pt-6" data-cy="command-center-page">
      <CommandCenterDossier customer={data.customer} financial={data.financial} insights={data.insights} />
      <CommandCenterActions actions={data.actions} queryKey={queryKey} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CommandCenterTimeline title="Order history" events={orderEvents} dataCy="order-history" />
        <CommandCenterTimeline
          title="Outreach timeline"
          events={data.outreachTimeline}
          dataCy="outreach-timeline"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CommandCenterPackages packages={data.packages} />
        <CommandCenterTimeline title="Audit trail" events={data.auditTrail} dataCy="audit-trail" />
      </div>
    </div>
  );
}
