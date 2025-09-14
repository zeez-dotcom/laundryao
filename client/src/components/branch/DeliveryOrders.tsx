import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { ReceiptModal } from "@/components/receipt-modal";
import { useToast } from "@/hooks/use-toast";

interface Driver {
  id: string;
  name: string;
}

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress: string;
  total: number;
  status: string;
  driverId?: string;
  driverName?: string;
}

const nextStatus: Record<string, string | null> = {
  pending_pickup: "out_for_delivery",
  out_for_delivery: "delivered",
  delivered: null,
};

export function DeliveryOrders() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [assignOrder, setAssignOrder] = useState<DeliveryOrder | null>(null);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [driverLocations, setDriverLocations] = useState<Record<string, { lat: number; lng: number }>>({});

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ["/api/drivers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/drivers");
      return res.json();
    },
  });

  const { data: orders = [], isLoading } = useQuery<DeliveryOrder[]>({
    queryKey: ["/api/delivery-orders", statusFilter, driverFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (driverFilter) params.append("driverId", driverFilter);
      const res = await apiRequest(
        "GET",
        `/api/delivery-orders?${params.toString()}`
      );
      return res.json();
    },
  });

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws/delivery-orders`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        queryClient.setQueryData<DeliveryOrder[]>(
          ["/api/delivery-orders", statusFilter, driverFilter],
          (old) => {
            if (!old) return old;
            return old.map((o) =>
              o.id === data.orderId
                ? {
                    ...o,
                    status: data.deliveryStatus ?? o.status,
                    driverId: data.driverId ?? o.driverId,
                  }
                : o,
            );
          },
        );
      } catch {
        queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
      }
    };
    return () => ws.close();
  }, [queryClient, statusFilter, driverFilter]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws/driver-location`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDriverLocations((prev) => ({
          ...prev,
          [data.driverId]: { lat: data.lat, lng: data.lng },
        }));
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, []);

  const assignDriverMutation = useMutation({
    mutationFn: async ({ orderId, driverId }: { orderId: string; driverId: string }) => {
      const res = await apiRequest("PATCH", `/api/delivery-orders/${orderId}/driver`, {
        driverId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Driver assigned" });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
    onSettled: () => {
      setAssignOrder(null);
      setSelectedDriver("");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/delivery-orders/${orderId}/status`, {
        status,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders"] });
    },
    onError: () => {
      toast({ title: "Error", variant: "destructive" });
    },
  });

  const statusOptions = [
    { value: "pending_pickup", label: t.pendingPickup },
    { value: "out_for_delivery", label: t.outForDelivery },
    { value: "delivered", label: t.delivered },
  ];

  return (
    <div className="p-4 space-y-4 overflow-auto">
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t.filterByStatus} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.all}</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={driverFilter} onValueChange={setDriverFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t.filterByDriver} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t.all}</SelectItem>
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div>{t.loading}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.orderNumber}</TableHead>
              <TableHead>{t.customerName}</TableHead>
              <TableHead>{t.address}</TableHead>
              <TableHead>{t.total}</TableHead>
              <TableHead>{t.status}</TableHead>
              <TableHead>{t.driver}</TableHead>
              <TableHead>{t.locationLabel}</TableHead>
              <TableHead>{t.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.orderNumber}</TableCell>
                <TableCell>
                  {order.customerName}
                  {order.customerPhone && (
                    <div className="text-sm text-gray-500">
                      {order.customerPhone}
                    </div>
                  )}
                </TableCell>
                <TableCell>{order.deliveryAddress}</TableCell>
                <TableCell>{formatCurrency(order.total)}</TableCell>
                <TableCell>
                  {statusOptions.find((s) => s.value === order.status)?.label}
                </TableCell>
                <TableCell>{order.driverName || "-"}</TableCell>
                <TableCell>
                  {order.driverId && driverLocations[order.driverId] &&
                  order.status !== "delivered"
                    ? `${driverLocations[order.driverId].lat.toFixed(5)}, ${driverLocations[order.driverId].lng.toFixed(5)}`
                    : "-"}
                </TableCell>
                <TableCell className="space-x-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setAssignOrder(order);
                      setSelectedDriver(order.driverId || "");
                    }}
                  >
                    {t.assignDriver}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = nextStatus[order.status];
                      if (next) {
                        updateStatusMutation.mutate({ orderId: order.id, status: next });
                      }
                    }}
                    disabled={!nextStatus[order.status]}
                  >
                    {t.updateStatus}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedOrder(order)}
                  >
                    {t.viewDetails}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ReceiptModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      <Dialog open={!!assignOrder} onOpenChange={(open) => !open && setAssignOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.assignDriver}</DialogTitle>
          </DialogHeader>
          <Select value={selectedDriver} onValueChange={setSelectedDriver}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t.select} />
            </SelectTrigger>
            <SelectContent>
              {drivers.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAssignOrder(null)}>
              {t.cancel}
            </Button>
            <Button
              onClick={() =>
                assignOrder &&
                selectedDriver &&
                assignDriverMutation.mutate({
                  orderId: assignOrder.id,
                  driverId: selectedDriver,
                })
              }
              disabled={!selectedDriver || assignDriverMutation.isLoading}
            >
              {t.save}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DeliveryOrders;

