import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useAuthContext } from "@/context/AuthContext";
import SmartComposer, { SmartComposerSuggestion } from "@/components/orders/SmartComposer";
import { CheckCircle, ClipboardList } from "lucide-react";

export default function CreateOrderPage() {
  const { branch, user } = useAuthContext();
  const [customerId, setCustomerId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [selectedSuggestions, setSelectedSuggestions] = useState<SmartComposerSuggestion[]>([]);

  const composerCustomerId = useMemo(() => {
    const trimmed = customerId.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, [customerId]);

  const branchId = branch?.id ?? user?.branchId ?? "";

  const handleSuggestionSelect = (suggestion: SmartComposerSuggestion) => {
    setSelectedSuggestions((prev) => {
      if (prev.some((existing) => existing.id === suggestion.id)) {
        return prev;
      }
      return [...prev, suggestion];
    });
  };

  return (
    <div className="full-bleed grid w-full gap-6 px-4 py-6 lg:grid-cols-[1fr_340px] max-w-none">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-indigo-500" /> Draft new order
            </CardTitle>
            <CardDescription>
              Capture order details on the left and use smart suggestions on the right to add items quickly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Customer ID</label>
              <Input
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                placeholder="Search by customer ID or phone"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">Special instructions</label>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add customer notes, delivery preferences, or finishing requests"
                rows={4}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CheckCircle className="h-4 w-4 text-emerald-500" /> Suggested items
              </div>
              {selectedSuggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Suggestions you apply will appear here for quick reference when assembling the order ticket.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedSuggestions.map((suggestion) => (
                    <Badge key={suggestion.id} variant="secondary" className="capitalize">
                      {suggestion.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button type="button" disabled>
                Save draft
              </Button>
            </div>
          </CardContent>
        </Card>
        {!branchId && (
          <Alert variant="destructive">
            <AlertTitle>Branch unavailable</AlertTitle>
            <AlertDescription>
              Assign a branch to your user before generating smart order recommendations.
            </AlertDescription>
          </Alert>
        )}
      </div>
      <div className="lg:sticky lg:top-6">
        {branchId ? (
          <SmartComposer
            branchId={branchId}
            customerId={composerCustomerId}
            onSuggestionSelect={handleSuggestionSelect}
          />
        ) : (
          <Card className="p-4">
            <CardHeader className="p-0">
              <CardTitle className="text-base">Smart composer</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-4 text-sm text-muted-foreground">
              Link your account to a branch to unlock recommendation insights and anomaly alerts.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
