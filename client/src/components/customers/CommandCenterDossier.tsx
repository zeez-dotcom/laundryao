import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";
import type {
  CommandCenterCustomer,
  CommandCenterFinancials,
  CommandCenterInsightsSummary,
} from "./types";

function formatCurrency(value: number): string {
  return `E£ ${value.toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

interface CommandCenterDossierProps {
  customer: CommandCenterCustomer;
  financial: CommandCenterFinancials;
  insights: CommandCenterInsightsSummary;
}

export function CommandCenterDossier({ customer, financial, insights }: CommandCenterDossierProps) {
  const sentimentTone: Record<CommandCenterInsightsSummary["sentiment"], string> = {
    positive: "bg-emerald-100 text-emerald-900",
    neutral: "bg-slate-100 text-slate-900",
    negative: "bg-rose-100 text-rose-900",
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3" data-cy="command-center-dossier">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-2xl font-semibold text-slate-900">
              {customer.name}
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {customer.phoneNumber || "No phone"}
              {customer.email ? ` • ${customer.email}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline">Branch: {customer.branchId || "—"}</Badge>
              {customer.isActive === false && <Badge variant="destructive">Inactive</Badge>}
              <Badge className={sentimentTone[insights.sentiment]}>Sentiment: {insights.sentiment}</Badge>
            </div>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>Insights refreshed {formatDistanceToNow(new Date(insights.generatedAt), { addSuffix: true })}</p>
            <p className="mt-1">Customer since {formatDate(customer.createdAt)}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          <div>
            <h3 className="text-sm font-medium text-slate-600">AI Summary</h3>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">{insights.summary}</p>
            {insights.preferredServices.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {insights.preferredServices.map((service) => (
                  <Badge key={service} variant="secondary">
                    {service}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Financial Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm text-slate-600">Balance due</p>
            <p className="text-xl font-semibold text-slate-900">{formatCurrency(financial.balanceDue)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm text-slate-600">Lifetime spend</p>
            <p className="text-xl font-semibold text-slate-900">{formatCurrency(financial.totalSpend)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm text-slate-600">Package credits remaining</p>
            <p className="text-xl font-semibold text-slate-900">{financial.packageCredits}</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm text-slate-600">Loyalty points</p>
            <p className="text-xl font-semibold text-slate-900">{financial.loyaltyPoints}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
