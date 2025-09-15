import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import { Order, DeliveryOrder } from "@shared/schema";

interface DeliveryRequest extends Order {
  delivery: DeliveryOrder;
}

export function DeliveryOrderRequests() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading, error } = useQuery<DeliveryRequest[], Error>({
    queryKey: ["/api/delivery-order-requests"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/delivery-order-requests");
      return res.json();
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(
        "PATCH",
        `/api/delivery-order-requests/${id}/accept`
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Request accepted" });
      queryClient.invalidateQueries({
        queryKey: ["/api/delivery-order-requests"],
      });
    },
    onError: () => {
      toast({
        title: "Failed to accept request",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  const safeRequests: DeliveryRequest[] = Array.isArray(requests) ? requests : [];

  const extractErrorMessage = (err: unknown): string => {
    const raw = (err as any)?.message || "Failed to load";
    const idx = raw.indexOf(":");
    if (idx !== -1) {
      const after = raw.slice(idx + 1).trim();
      try {
        const parsed = JSON.parse(after);
        if (parsed?.message) return parsed.message as string;
      } catch {
        // ignore
      }
      return after || raw;
    }
    return raw;
  };
  const errorText = error ? extractErrorMessage(error) : null;

  return (
    <div className="p-4 space-y-4 overflow-auto">
      {errorText && (
        <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-2 text-sm">
          {errorText}
        </div>
      )}
      {safeRequests.map((request) => (
        <Card key={request.id}>
          <CardHeader>
            <CardTitle>
              {t.orderNumber}: {request.orderNumber}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p>
                {t.customerName}: {request.customerName}
              </p>
              {request.delivery?.deliveryInstructions && (
                <p className="text-sm text-gray-600">
                  {request.delivery.deliveryInstructions}
                </p>
              )}
            </div>
            <Button
              onClick={() => acceptMutation.mutate(request.id)}
              disabled={(acceptMutation as any).isPending ?? (acceptMutation as any).isLoading}
            >
              Accept
            </Button>
          </CardContent>
        </Card>
      ))}
      {safeRequests.length === 0 && (
        <p className="text-center text-gray-500">No requests</p>
      )}
    </div>
  );
}
