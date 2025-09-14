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

  const { data: requests = [], isLoading } = useQuery<DeliveryRequest[]>({
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

  return (
    <div className="p-4 space-y-4 overflow-auto">
      {requests.map((request) => (
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
              disabled={acceptMutation.isLoading}
            >
              Accept
            </Button>
          </CardContent>
        </Card>
      ))}
      {requests.length === 0 && (
        <p className="text-center text-gray-500">No requests</p>
      )}
    </div>
  );
}

