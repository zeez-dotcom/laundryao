import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { AlertTriangle, FlaskConical, RefreshCw, Rocket } from "lucide-react";

interface CatalogExperimentChange {
  id: string;
  serviceId: string;
  serviceName: string;
  baselinePrice: number;
  proposedPrice: number;
  expectedVolume: number;
}

interface CatalogExperimentForecast {
  baselineRevenue: number;
  projectedRevenue: number;
  revenueLift: number;
  demandMultiplier: number;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  assumptions: { demandShift: number; seasonality: number };
}

interface CatalogExperiment {
  id: string;
  branchId: string;
  name: string;
  hypothesis: string;
  status: "draft" | "forecasted" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
  changes: CatalogExperimentChange[];
  forecast?: CatalogExperimentForecast;
  approvals: Array<{ actor: string; role: string; at: string }>;
  publishedAt?: string;
  notes?: string;
}

interface CreateExperimentForm {
  name: string;
  hypothesis: string;
  serviceId: string;
  serviceName: string;
  baselinePrice: string;
  proposedPrice: string;
  expectedVolume: string;
}

export default function CatalogExperimentsPage() {
  const { branch } = useAuthContext();
  const branchId = branch?.id ?? "";
  const { toast } = useToast();
  const [form, setForm] = useState<CreateExperimentForm>({
    name: "",
    hypothesis: "",
    serviceId: "",
    serviceName: "",
    baselinePrice: "",
    proposedPrice: "",
    expectedVolume: "100",
  });

  const { data, isLoading, isError, refetch } = useQuery<CatalogExperiment[]>({
    queryKey: ["/api/catalog/experiments"],
    queryFn: async () => {
      const res = await fetch("/api/catalog/experiments");
      if (!res.ok) {
        throw new Error("Failed to load experiments");
      }
      return (await res.json()) as CatalogExperiment[];
    },
  });

  const createExperiment = useMutation({
    mutationFn: async () => {
      const payload = {
        branchId: branchId || form.serviceId || "global",
        name: form.name,
        hypothesis: form.hypothesis,
        changes: [
          {
            serviceId: form.serviceId || crypto.randomUUID(),
            serviceName: form.serviceName || "Unnamed service",
            baselinePrice: Number.parseFloat(form.baselinePrice || "0"),
            proposedPrice: Number.parseFloat(form.proposedPrice || "0"),
            expectedVolume: Number.parseFloat(form.expectedVolume || "100"),
          },
        ],
      };
      const res = await fetch("/api/catalog/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to create experiment");
      }
      return (await res.json()) as CatalogExperiment;
    },
    onSuccess: () => {
      toast({ title: "Experiment drafted", description: "Forecast to evaluate impact before publishing." });
      void refetch();
      setForm({
        name: "",
        hypothesis: "",
        serviceId: "",
        serviceName: "",
        baselinePrice: "",
        proposedPrice: "",
        expectedVolume: "100",
      });
    },
  });

  const forecastMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/catalog/experiments/${id}/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandShift: 0 }),
      });
      if (!res.ok) {
        throw new Error("Forecast failed");
      }
      return (await res.json()) as CatalogExperiment;
    },
    onSuccess: (experiment) => {
      toast({
        title: "Forecast ready",
        description: `Projected lift ${experiment?.forecast?.revenueLift?.toFixed(2) ?? 0} E£`,
      });
      void refetch();
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/catalog/experiments/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) {
        const message = await res.json().catch(() => ({ message: "Publish failed" }));
        throw new Error(message.message || "Publish failed");
      }
      return (await res.json()) as CatalogExperiment;
    },
    onSuccess: () => {
      toast({ title: "Experiment published", description: "Changes are ready for controlled rollout." });
      void refetch();
    },
    onError: (error) => {
      toast({ title: "Publish blocked", description: (error as Error).message, variant: "destructive" });
    },
  });

  const handleInputChange = (key: keyof CreateExperimentForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const experiments = useMemo(() => data ?? [], [data]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="h-5 w-5 text-indigo-500" /> Catalog experiments
          </CardTitle>
          <CardDescription>
            Model price or service adjustments in a sandbox, forecast potential impact, and promote only when guardrails pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="experiment-name">Experiment name</Label>
              <Input
                id="experiment-name"
                value={form.name}
                onChange={(event) => handleInputChange("name", event.target.value)}
                placeholder="Ramadan express wash uplift"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="service-name">Service</Label>
              <Input
                id="service-name"
                value={form.serviceName}
                onChange={(event) => handleInputChange("serviceName", event.target.value)}
                placeholder="Wash & Fold"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="hypothesis">Hypothesis</Label>
            <Input
              id="hypothesis"
              value={form.hypothesis}
              onChange={(event) => handleInputChange("hypothesis", event.target.value)}
              placeholder="If we introduce an express tier, loyal customers will pay a 10% premium"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="baseline-price">Baseline price (E£)</Label>
              <Input
                id="baseline-price"
                type="number"
                value={form.baselinePrice}
                onChange={(event) => handleInputChange("baselinePrice", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="proposed-price">Proposed price (E£)</Label>
              <Input
                id="proposed-price"
                type="number"
                value={form.proposedPrice}
                onChange={(event) => handleInputChange("proposedPrice", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expected-volume">Expected weekly volume</Label>
              <Input
                id="expected-volume"
                type="number"
                value={form.expectedVolume}
                onChange={(event) => handleInputChange("expectedVolume", event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => createExperiment.mutateAsync()}
              disabled={createExperiment.isPending || !form.name.trim()}
            >
              Draft experiment
            </Button>
          </div>
          {createExperiment.isError && (
            <Alert variant="destructive">
              <AlertTitle>Unable to create experiment</AlertTitle>
              <AlertDescription>Check inputs and try again.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">Experiment backlog</CardTitle>
            <CardDescription>Track forecasts, risk level, and approvals before roll-out.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {isError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load experiments</AlertTitle>
              <AlertDescription>Ensure you have catalog permissions.</AlertDescription>
            </Alert>
          ) : experiments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Rocket className="h-6 w-6 text-indigo-500" />
              Draft your first experiment to compare projected and baseline revenue.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Forecast</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiments.map((experiment) => (
                    <TableRow key={experiment.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{experiment.name}</span>
                          <span className="text-xs text-muted-foreground">{experiment.hypothesis}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {experiment.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {experiment.forecast ? (
                          <div className="text-xs text-muted-foreground">
                            <div>
                              Lift {experiment.forecast.revenueLift.toFixed(2)} E£ ({experiment.forecast.riskLevel} risk)
                            </div>
                            <div>
                              Demand ×{experiment.forecast.demandMultiplier.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No forecast</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {experiment.forecast ? (
                          <Badge variant="secondary">{Math.round(experiment.forecast.confidence * 100)}%</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => forecastMutation.mutateAsync(experiment.id)}
                          disabled={forecastMutation.isPending}
                        >
                          Forecast
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => publishMutation.mutateAsync(experiment.id)}
                          disabled={publishMutation.isPending || experiment.status !== "forecasted"}
                        >
                          Publish
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {(forecastMutation.isError || publishMutation.isError) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Action failed</AlertTitle>
          <AlertDescription>Review the experiment inputs or rerun the forecast.</AlertDescription>
        </Alert>
      )}

      <Separator />
      <div className="text-xs text-muted-foreground">
        Experiments update the catalog only after publishing. Use forecasts and approvals to validate pricing guardrails.
      </div>
    </div>
  );
}
