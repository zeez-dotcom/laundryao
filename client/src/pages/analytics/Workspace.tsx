import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useAuthContext } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface WorkspaceView {
  id: string;
  name: string;
  description?: string | null;
  layout: {
    widgets: Array<{ id: string; type: WidgetType; metric: MetricKey; span?: number }>;
  };
  filters?: Record<string, unknown>;
}

interface WorkspaceDataResponse {
  metric: MetricKey;
  historical: Array<{ date: string; orders: number; revenue: number }>;
  forecasts: Array<{
    targetDate: string;
    value: number;
    lowerBound: number;
    upperBound: number;
  }>;
  accuracy: {
    meanAbsolutePercentageError: number;
    meanAbsoluteError: number;
    sampleSize: number;
  };
}

interface CohortOption {
  id: string;
  label: string;
  description?: string;
}

type MetricKey = "revenue" | "orders" | "average_order_value";
type WidgetType = "area" | "line" | "bar" | "stat";

interface WidgetDefinition {
  id: string;
  metric: MetricKey;
  label: string;
  type: WidgetType;
  description: string;
}

const AVAILABLE_WIDGETS: WidgetDefinition[] = [
  {
    id: "revenue-trend",
    metric: "revenue",
    type: "area",
    label: "Revenue forecast",
    description: "Rolling revenue with forecast band",
  },
  {
    id: "orders-trend",
    metric: "orders",
    type: "line",
    label: "Order volume",
    description: "Daily order counts with 30-day history",
  },
  {
    id: "aov",
    metric: "average_order_value",
    type: "bar",
    label: "Average order value",
    description: "Historical AOV compared to forecast",
  },
  {
    id: "forecast-accuracy",
    metric: "revenue",
    type: "stat",
    label: "Forecast accuracy",
    description: "Mean absolute percentage error over the last 30 days",
  },
];

const RANGE_OPTIONS: Array<{ id: string; label: string; days: number }> = [
  { id: "7", label: "7d", days: 7 },
  { id: "30", label: "30d", days: 30 },
  { id: "90", label: "90d", days: 90 },
];

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return value.toLocaleString();
}

function buildWidgetLayout(view?: WorkspaceView | null): Array<{ id: string; type: WidgetType; metric: MetricKey; span?: number }> {
  if (view?.layout?.widgets?.length) {
    return view.layout.widgets;
  }
  return AVAILABLE_WIDGETS.slice(0, 3).map((widget, idx) => ({
    id: widget.id,
    metric: widget.metric,
    type: widget.type,
    span: idx === 0 ? 2 : 1,
  }));
}

export default function AnalyticsWorkspacePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { branch } = useAuthContext();
  const branchId = branch?.id ?? null;
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [range, setRange] = useState(RANGE_OPTIONS[1]);
  const [selectedCohortId, setSelectedCohortId] = useState<string>("all");
  const [drillTarget, setDrillTarget] = useState<WidgetDefinition | null>(null);

  const { data: viewsResponse } = useQuery<{ views: WorkspaceView[] }>({
    queryKey: ["analytics", "workspace", "views"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/workspace/views", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load workspace views");
      }
      return res.json();
    },
  });

  const views = viewsResponse?.views ?? [];
  const selectedView = useMemo(
    () => views.find((view) => view.id === selectedViewId) ?? views[0] ?? null,
    [views, selectedViewId],
  );

  const [activeWidgets, setActiveWidgets] = useState(() => buildWidgetLayout(selectedView));

  useEffect(() => {
    if (!views.length) return;
    if (!selectedViewId) {
      const defaultView = views[0];
      setSelectedViewId(defaultView.id);
      setActiveWidgets(buildWidgetLayout(defaultView));
      if (defaultView?.filters?.cohortId && typeof defaultView.filters.cohortId === "string") {
        setSelectedCohortId(defaultView.filters.cohortId);
      }
      if (defaultView?.filters?.range && typeof defaultView.filters.range === "string") {
        const option = RANGE_OPTIONS.find((entry) => entry.id === defaultView.filters.range);
        if (option) {
          setRange(option);
        }
      }
    }
  }, [views, selectedViewId]);

  const { data: cohortsResponse } = useQuery<{ cohorts: CohortOption[] }>({
    queryKey: ["analytics", "workspace", "cohorts"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/workspace/cohorts", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load cohorts");
      }
      return res.json();
    },
  });

  const cohorts = cohortsResponse?.cohorts ?? [];

  const metrics = useMemo(
    () => Array.from(new Set(activeWidgets.map((widget) => widget.metric))),
    [activeWidgets],
  );

  const metricsQueries = useQueries({
    queries: metrics.map((metric) => ({
      queryKey: [
        "analytics",
        "workspace",
        "data",
        metric,
        selectedCohortId,
        range.id,
        branchId,
      ],
      queryFn: async (): Promise<WorkspaceDataResponse> => {
        const params = new URLSearchParams({
          metric,
          rangeDays: String(range.days),
          cohortId: selectedCohortId,
        });
        if (branchId) params.set("branchId", branchId);
        const res = await fetch(`/api/analytics/workspace/data?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`Failed to load metric ${metric}`);
        }
        return res.json();
      },
      enabled: metrics.length > 0,
      staleTime: 60_000,
    })),
  });

  const dataByMetric = useMemo(() => {
    const lookup = new Map<MetricKey, WorkspaceDataResponse>();
    metricsQueries.forEach((query, index) => {
      if (query.data) {
        lookup.set(metrics[index] as MetricKey, query.data);
      }
    });
    return lookup;
  }, [metrics, metricsQueries]);

  const saveViewMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string | null }) => {
      const res = await fetch("/api/analytics/workspace/views", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          layout: { widgets: activeWidgets },
          filters: { cohortId: selectedCohortId, range: range.id },
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics", "workspace", "views"] });
      toast({ title: "View saved", description: "Dashboard layout has been stored." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to save view", description: error.message, variant: "destructive" });
    },
  });

  const updateViewMutation = useMutation({
    mutationFn: async (payload: { id: string }) => {
      const res = await fetch(`/api/analytics/workspace/views/${payload.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout: { widgets: activeWidgets },
          filters: { cohortId: selectedCohortId, range: range.id },
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analytics", "workspace", "views"] });
      toast({ title: "View updated", description: "Workspace layout saved." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update view", description: error.message, variant: "destructive" });
    },
  });

  const { data: drillData } = useQuery({
    queryKey: [
      "analytics",
      "workspace",
      "drilldown",
      drillTarget?.id,
      selectedCohortId,
      range.id,
      branchId,
    ],
    enabled: Boolean(drillTarget),
    queryFn: async () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(end.getDate() - range.days);
      const params = new URLSearchParams({
        cohortId: selectedCohortId,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      if (branchId) params.set("branchId", branchId);
      const res = await fetch(`/api/analytics/workspace/drilldown?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load drill down data");
      return res.json() as Promise<{ rows: Array<{ id: string; orderNumber: string; customerName: string; total: number; createdAt: string }> }>;
    },
  });

  const cohortBadges = useMemo(() => {
    const selected = cohorts.find((cohort) => cohort.id === selectedCohortId);
    return selected ? [selected] : [];
  }, [cohorts, selectedCohortId]);

  const activeMetricsReady = metrics.every((metric) => dataByMetric.has(metric));

  const currentCurrency = branch?.currency ?? "EGP";

  const handleSelectView = (viewId: string) => {
    setSelectedViewId(viewId);
    const view = views.find((entry) => entry.id === viewId);
    if (view?.filters?.cohortId && typeof view.filters.cohortId === "string") {
      setSelectedCohortId(view.filters.cohortId);
    }
    if (view?.filters?.range && typeof view.filters.range === "string") {
      const option = RANGE_OPTIONS.find((opt) => opt.id === view.filters.range);
      if (option) {
        setRange(option);
      }
    }
    setActiveWidgets(buildWidgetLayout(view));
  };

  const handleAddWidget = (widget: WidgetDefinition) => {
    setActiveWidgets((prev) => {
      if (prev.some((existing) => existing.id === widget.id)) {
        return prev;
      }
      return [...prev, { id: widget.id, metric: widget.metric, type: widget.type, span: 1 }];
    });
  };

  const handleRemoveWidget = (widgetId: string) => {
    setActiveWidgets((prev) => prev.filter((widget) => widget.id !== widgetId));
  };

  return (
    <div className="flex-1 overflow-auto bg-muted/30">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Analytics workspace</h1>
            <p className="text-muted-foreground">
              Assemble dashboards with saved views, cohort filters, and drill-through insights.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedView?.id} onValueChange={handleSelectView}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select view" />
              </SelectTrigger>
              <SelectContent>
                {views.map((view) => (
                  <SelectItem key={view.id} value={view.id}>
                    {view.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() =>
                saveViewMutation.mutate({
                  name: `Workspace ${new Date().toLocaleDateString()}`,
                })
              }
            >
              Save as new view
            </Button>
            {selectedView?.id && selectedView.id !== "default" && (
              <Button
                variant="secondary"
                onClick={() => updateViewMutation.mutate({ id: selectedView.id })}
              >
                Update current view
              </Button>
            )}
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Switch cohorts, ranges, and widgets without leaving the workspace.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">Cohort</span>
                <Select value={selectedCohortId} onValueChange={setSelectedCohortId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Choose cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    {cohorts.map((cohort) => (
                      <SelectItem key={cohort.id} value={cohort.id}>
                        {cohort.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">Date range</span>
                <Tabs value={range.id} onValueChange={(value) => {
                  const option = RANGE_OPTIONS.find((entry) => entry.id === value);
                  if (option) setRange(option);
                }} className="w-fit">
                  <TabsList>
                    {RANGE_OPTIONS.map((option) => (
                      <TabsTrigger key={option.id} value={option.id}>
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex flex-1 flex-wrap gap-2">
                {cohortBadges.map((cohort) => (
                  <Badge key={cohort.id} variant="outline">
                    {cohort.label}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted-foreground">Add widgets</span>
              <div className="flex flex-wrap gap-3">
                {AVAILABLE_WIDGETS.map((widget) => {
                  const isActive = activeWidgets.some((active) => active.id === widget.id);
                  return (
                    <Button
                      key={widget.id}
                      variant={isActive ? "secondary" : "outline"}
                      size="sm"
                      className={cn("justify-start", "w-56")}
                      onClick={() => (isActive ? handleRemoveWidget(widget.id) : handleAddWidget(widget))}
                    >
                      <div className="text-left">
                        <div className="font-medium">{widget.label}</div>
                        <div className="text-xs text-muted-foreground">{widget.description}</div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeWidgets.map((widget) => {
            const definition = AVAILABLE_WIDGETS.find((entry) => entry.id === widget.id);
            const metricData = definition ? dataByMetric.get(definition.metric) : undefined;
            return (
              <Card key={widget.id} className={cn(widget.span === 2 && "xl:col-span-2")}
               >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base font-semibold">
                      {definition?.label ?? widget.id}
                    </CardTitle>
                    <CardDescription>{definition?.description}</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => definition && setDrillTarget(definition)}>
                    Drill-through
                  </Button>
                </CardHeader>
                <CardContent>
                  {!metricData && !activeMetricsReady && (
                    <p className="text-sm text-muted-foreground">Loading metric…</p>
                  )}
                  {metricData && definition && (
                    <WidgetBody
                      widget={definition}
                      data={metricData}
                      currency={currentCurrency}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      </div>

      <Dialog open={Boolean(drillTarget)} onOpenChange={(open) => !open && setDrillTarget(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{drillTarget?.label ?? "Drill-down"}</DialogTitle>
            <DialogDescription>
              Cohort {selectedCohortId} · Last {range.label}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto">
            {!drillData && <p className="text-sm text-muted-foreground">Loading records…</p>}
            {drillData && drillData.rows.length === 0 && (
              <p className="text-sm text-muted-foreground">No matching records for this slice.</p>
            )}
            {drillData && drillData.rows.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Placed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillData.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.orderNumber}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{formatCurrency(row.total, currentCurrency)}</TableCell>
                      <TableCell>{new Date(row.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WidgetBody({
  widget,
  data,
  currency,
}: {
  widget: WidgetDefinition;
  data: WorkspaceDataResponse;
  currency: string;
}) {
  const historicalSeries = useMemo(
    () =>
      data.historical.map((row) => ({
        date: row.date,
        value: widget.metric === "revenue" ? row.revenue : widget.metric === "orders" ? row.orders : row.revenue / Math.max(1, row.orders),
      })),
    [data.historical, widget.metric],
  );

  const forecastSeries = useMemo(
    () =>
      data.forecasts.map((row) => ({
        date: row.targetDate,
        value: row.value,
        lower: row.lowerBound,
        upper: row.upperBound,
      })),
    [data.forecasts],
  );

  if (widget.type === "stat") {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-3xl font-semibold">
          {data.accuracy.sampleSize === 0
            ? "–"
            : `${(1 - data.accuracy.meanAbsolutePercentageError) * 100 < 0 ? 0 : ((1 - data.accuracy.meanAbsolutePercentageError) * 100).toFixed(1)}%`}
        </div>
        <p className="text-sm text-muted-foreground">
          Accuracy across {data.accuracy.sampleSize} samples. Mean absolute error {formatCurrency(data.accuracy.meanAbsoluteError, currency)}.
        </p>
      </div>
    );
  }

  const combined = [...historicalSeries, ...forecastSeries];
  const chartConfig = {
    value: {
      label: widget.label,
      theme: {
        light: "#2563eb",
        dark: "#60a5fa",
      },
    },
  } as const;

  if (widget.type === "area") {
    return (
      <ChartContainer config={chartConfig} className="h-60">
        <AreaChart data={combined}>
          <defs>
            <linearGradient id="fillForecast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" hide tickFormatter={(value) => new Date(value).toLocaleDateString()} />
          <YAxis tickFormatter={(value) => formatNumber(value)} width={60} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area dataKey="value" stroke="var(--color-value)" fill="url(#fillForecast)" strokeWidth={2} />
        </AreaChart>
      </ChartContainer>
    );
  }

  if (widget.type === "line") {
    return (
      <ChartContainer config={chartConfig} className="h-60">
        <LineChart data={combined}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" hide tickFormatter={(value) => new Date(value).toLocaleDateString()} />
          <YAxis tickFormatter={(value) => formatNumber(value)} width={60} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-60">
      <BarChart data={combined}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" hide tickFormatter={(value) => new Date(value).toLocaleDateString()} />
        <YAxis tickFormatter={(value) => formatNumber(value)} width={60} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
