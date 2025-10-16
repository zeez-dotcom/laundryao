import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Lightbulb, Package, Sparkles } from "lucide-react";

export interface SmartComposerSuggestion {
  id: string;
  label: string;
  reason: string;
  score: number;
  category: "repeat" | "seasonal" | "upsell";
  metadata?: Record<string, unknown>;
}

export interface SmartComposerSeasonalHighlight {
  id: string;
  label: string;
  relevance: number;
  description: string;
  season: string;
}

export interface SmartComposerPackageImpact {
  id: string;
  packageId: string;
  name: string;
  remainingCredits: number;
  utilizationRate: number;
  estimatedSavings: number;
  expiresAt: string | null;
  recommendation: string;
}

export interface SmartComposerAnomaly {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

interface SmartComposerResponse {
  suggestions: SmartComposerSuggestion[];
  seasonalHighlights: SmartComposerSeasonalHighlight[];
  packageImpact: SmartComposerPackageImpact[];
  anomalies: SmartComposerAnomaly[];
  metrics: {
    averageOrderValue: number;
    averageLineValue: number;
    orderCount: number;
  };
  generatedAt: string;
}

export interface SmartComposerProps {
  branchId: string;
  customerId?: string;
  onSuggestionSelect?: (suggestion: SmartComposerSuggestion) => void;
}

function buildQueryKey(branchId: string, customerId?: string) {
  return ["/api/orders/smart", branchId, customerId ?? "anonymous"] as const;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "EGP" }).format(value);
}

function severityVariant(severity: SmartComposerAnomaly["severity"]): "default" | "destructive" | "secondary" {
  if (severity === "high") return "destructive";
  if (severity === "medium") return "secondary";
  return "default";
}

export function SmartComposer({ branchId, customerId, onSuggestionSelect }: SmartComposerProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<SmartComposerResponse>({
    queryKey: buildQueryKey(branchId, customerId),
    queryFn: async () => {
      const params = new URLSearchParams({ branchId });
      if (customerId) params.set("customerId", customerId);
      const res = await fetch(`/api/orders/smart?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load smart order insights");
      }
      return (await res.json()) as SmartComposerResponse;
    },
    enabled: Boolean(branchId),
  });

  const lastGenerated = useMemo(() => {
    if (!data?.generatedAt) return null;
    const date = new Date(data.generatedAt);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }, [data?.generatedAt]);

  if (isLoading) {
    return (
      <Card className="space-y-4 p-4">
        <CardHeader className="p-0">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-indigo-500" /> Smart suggestions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-0 pt-4">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-20" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-4">
        <CardHeader className="p-0">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-indigo-500" /> Smart suggestions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load insights</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>Check the connection and try again.</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <CardHeader className="space-y-1 p-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-indigo-500" /> Smart suggestions
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            Refresh
          </Button>
        </div>
        {lastGenerated && (
          <p className="text-xs text-muted-foreground">Generated {lastGenerated}</p>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 p-0">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lightbulb className="h-4 w-4 text-amber-500" /> Recommendations
            </h3>
            <Badge variant="secondary">{data.metrics.orderCount} orders analysed</Badge>
          </div>
          <div className="grid gap-3">
            {data.suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-start justify-between gap-4 rounded-md border border-border bg-card/40 p-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{suggestion.label}</p>
                  <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      {suggestion.category}
                    </Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="ghost" className="text-xs">
                            Score {suggestion.score.toFixed(1)}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Higher scores combine recency and frequency.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                {onSuggestionSelect && (
                  <Button size="sm" onClick={() => onSuggestionSelect(suggestion)}>
                    Apply
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        {data.packageImpact.length > 0 && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Package className="h-4 w-4 text-emerald-500" /> Package impact
            </h3>
            <div className="grid gap-3">
              {data.packageImpact.map((pkg) => (
                <div key={pkg.id} className="rounded-md border border-border bg-card/30 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{pkg.name}</p>
                      <p className="text-xs text-muted-foreground">{pkg.recommendation}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>Remaining {pkg.remainingCredits.toFixed(1)} credits</div>
                      <div>Utilization {(pkg.utilizationRate * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Estimated value {formatCurrency(pkg.estimatedSavings)}</span>
                    {pkg.expiresAt && (
                      <span>Expires {new Date(pkg.expiresAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.anomalies.length > 0 && (
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Alerts
            </h3>
            <div className="grid gap-2">
              {data.anomalies.map((anomaly) => (
                <Alert key={anomaly.id} variant={severityVariant(anomaly.severity)}>
                  <AlertTitle className="flex items-center justify-between text-sm font-semibold">
                    {anomaly.message}
                    <Badge variant="outline" className="capitalize">
                      {anomaly.severity}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground">
                    Detected {new Date(anomaly.occurredAt).toLocaleString()}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default SmartComposer;
