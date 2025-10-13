import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import type { CommandCenterPackage } from "./types";

interface CommandCenterPackagesProps {
  packages: CommandCenterPackage[];
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "dd MMM yyyy");
}

export function CommandCenterPackages({ packages }: CommandCenterPackagesProps) {
  return (
    <Card data-cy="command-center-packages">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-900">Package usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {packages.length === 0 ? (
          <p className="text-sm text-slate-500">No packages assigned.</p>
        ) : (
          packages.map((pkg) => {
            const total = pkg.totalCredits ?? 0;
            const remaining = pkg.balance ?? 0;
            const used = total > 0 ? Math.max(total - remaining, 0) : 0;
            const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;
            return (
              <div key={pkg.id} className="rounded-lg border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{pkg.name || "Package"}</p>
                    <p className="text-xs text-slate-500">
                      Started {formatDate(pkg.startsAt)} • Expires {formatDate(pkg.expiresAt)}
                    </p>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    {remaining} credits remaining
                  </div>
                </div>
                <Progress value={percentage} className="mt-3" />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
