import { useState, useEffect, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  deliveryStatusEnum,
  type DeliveryStatus,
} from "@shared/schema";
import type { LucideIcon } from "lucide-react";
import {
  Car,
  CheckCircle,
  Clock,
  Package,
  PackageCheck,
  RefreshCw,
  Truck,
  UserCheck,
  XCircle,
} from "lucide-react";

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
  status: DeliveryStatus | string;
  driverId?: string;
  driverName?: string;
}

const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["driver_enroute", "cancelled"],
  driver_enroute: ["picked_up", "cancelled"],
  picked_up: ["processing_started", "cancelled"],
  processing_started: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const isDeliveryStatus = (value: string): value is DeliveryStatus =>
  (deliveryStatusEnum as readonly DeliveryStatus[]).includes(value as DeliveryStatus);

export function DeliveryOrders() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | "all">("all");
  const [driverFilter, setDriverFilter] = useState("all");
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

  const { data: orders = [], isLoading, error } = useQuery<DeliveryOrder[], Error>({
    queryKey: ["/api/delivery-orders", statusFilter, driverFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (driverFilter !== "all") params.append("driverId", driverFilter);
      const res = await apiRequest(
        "GET",
        `/api/delivery-orders?${params.toString()}`
      );
      return res.json();
    },
  });

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws/delivery-orders`);
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
    } catch (err) {
      console.error("WebSocket connection failed for delivery orders:", err);
    }
    return () => ws?.close();
  }, [queryClient, statusFilter, driverFilter]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws/driver-location`);
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
    } catch (err) {
      console.error("WebSocket connection failed for driver location:", err);
    }
    return () => ws?.close();
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
    mutationFn: async ({ orderId, status }: { orderId: string; status: DeliveryStatus }) => {
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

  const deliveryStatusMeta: Record<DeliveryStatus, { label: string; icon: LucideIcon; badgeClass: string }> = useMemo(
    () => ({
      pending: {
        label: t.deliveryStatusPending,
        icon: Clock,
        badgeClass: "bg-yellow-100 text-yellow-800",
      },
      accepted: {
        label: t.deliveryStatusAccepted,
        icon: UserCheck,
        badgeClass: "bg-blue-100 text-blue-800",
      },
      driver_enroute: {
        label: t.deliveryStatusDriverEnroute,
        icon: Car,
        badgeClass: "bg-indigo-100 text-indigo-800",
      },
      picked_up: {
        label: t.deliveryStatusPickedUp,
        icon: Package,
        badgeClass: "bg-purple-100 text-purple-800",
      },
      processing_started: {
        label: t.deliveryStatusProcessingStarted,
        icon: RefreshCw,
        badgeClass: "bg-orange-100 text-orange-800",
      },
      ready: {
        label: t.deliveryStatusReady,
        icon: PackageCheck,
        badgeClass: "bg-teal-100 text-teal-800",
      },
      out_for_delivery: {
        label: t.deliveryStatusOutForDelivery,
        icon: Truck,
        badgeClass: "bg-blue-100 text-blue-800",
      },
      completed: {
        label: t.deliveryStatusCompleted,
        icon: CheckCircle,
        badgeClass: "bg-green-100 text-green-800",
      },
      cancelled: {
        label: t.deliveryStatusCancelled,
        icon: XCircle,
        badgeClass: "bg-red-100 text-red-800",
      },
    }),
    [t],
  );

  const statusOptions = deliveryStatusEnum.map((status) => ({
    value: status,
    label: deliveryStatusMeta[status].label,
  }));

  const safeDrivers: Driver[] = Array.isArray(drivers) ? drivers : [];
  const safeOrders: DeliveryOrder[] = Array.isArray(orders) ? orders : [];

  const getPrimaryTransition = (status: DeliveryStatus): DeliveryStatus | null => {
    const allowed = DELIVERY_STATUS_TRANSITIONS[status] ?? [];
    return allowed.find((s) => s !== "cancelled") ?? null;
  };

  const canCancelStatus = (status: DeliveryStatus): boolean =>
    (DELIVERY_STATUS_TRANSITIONS[status] ?? []).includes("cancelled");

  const extractErrorMessage = (err: unknown): string => {
    const raw = (err as any)?.message || "Failed to load";
    // Try to parse JSON portion after status code
    const idx = raw.indexOf(":");
    if (idx !== -1) {
      const after = raw.slice(idx + 1).trim();
      try {
        const parsed = JSON.parse(after);
        if (parsed?.message) return parsed.message as string;
      } catch {
        // fall through
      }
      return after || raw;
    }
    return raw;
  };
  const errorText = error ? extractErrorMessage(error) : null;

  return (
    <div className="p-4 space-y-4 overflow-auto">
      <div className="flex gap-4">
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as DeliveryStatus | "all")}
        >
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
            <SelectItem value="all">{t.all}</SelectItem>
            {safeDrivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {errorText && (
        <div className="rounded-md border border-red-300 bg-red-50 text-red-800 p-2 text-sm">
          {errorText}
        </div>
      )}

      {isLoading ? (
        <div>{t.loading}</div>
      ) : safeOrders.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground">{t.noOrdersFound}</div>
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
            {safeOrders.map((order) => (
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
                  {isDeliveryStatus(order.status) ? (
                    (() => {
                      const meta = deliveryStatusMeta[order.status];
                      const Icon = meta.icon;
                      return (
                        <Badge variant="outline" className={`${meta.badgeClass} flex items-center gap-1`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      );
                    })()
                  ) : (
                    order.status
                  )}
                </TableCell>
                <TableCell>{order.driverName || "-"}</TableCell>
                <TableCell>
                  {order.driverId &&
                  driverLocations[order.driverId] &&
                  isDeliveryStatus(order.status) &&
                  !["completed", "cancelled"].includes(order.status)
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
                  {isDeliveryStatus(order.status) && (
                    <>
                      {(() => {
                        const primaryTransition = getPrimaryTransition(order.status);
                        if (!primaryTransition) {
                          return null;
                        }
                        const nextMeta = deliveryStatusMeta[primaryTransition];
                        return (
                          <Button
                            key={`${order.id}-advance`}
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateStatusMutation.mutate({
                                orderId: order.id,
                                status: primaryTransition,
                              })
                            }
                            disabled={updateStatusMutation.isPending}
                            title={t.advanceDeliveryStatus}
                            aria-label={`${t.advanceDeliveryStatus}: ${nextMeta.label}`}
                          >
                            {nextMeta.label}
                          </Button>
                        );
                      })()}
                      {canCancelStatus(order.status) && !["cancelled", "completed"].includes(order.status) && (
                        <Button
                          key={`${order.id}-cancel`}
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            updateStatusMutation.mutate({
                              orderId: order.id,
                              status: "cancelled",
                            })
                          }
                          disabled={updateStatusMutation.isPending}
                        >
                          {t.cancelDelivery}
                        </Button>
                      )}
                    </>
                  )}
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
              {safeDrivers.map((d) => (
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
              disabled={!selectedDriver || (assignDriverMutation as any).isPending || (assignDriverMutation as any).isLoading}
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
