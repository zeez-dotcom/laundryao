import { useState, useEffect, useMemo, useRef } from "react";
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
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
  orderId: string;
  deliveryId?: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress: string;
  deliveryAddressLabel?: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  total: number;
  status: DeliveryStatus | string;
  driverId?: string;
  driverName?: string;
  etaMinutes?: number | null;
  distanceKm?: number | null;
  driverLat?: number | null;
  driverLng?: number | null;
  driverLocationTimestamp?: string | null;
}

type DriverTelemetry = { lat: number; lng: number; timestamp?: string };

const DEFAULT_DRIVER_SPEED_KMH = 35;
const FALLBACK_CENTER: [number, number] = [47.9774, 29.3759];
const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

interface DeliveryMapCellProps {
  driverLocation?: DriverTelemetry | null;
  deliveryLocation?: { lat: number; lng: number } | null;
  etaMinutes?: number | null;
  distanceKm?: number | null;
  noTelemetryLabel: string;
}

function DeliveryMapCell({
  driverLocation,
  deliveryLocation,
  etaMinutes,
  distanceKm,
  noTelemetryLabel,
}: DeliveryMapCellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ driver?: maplibregl.Marker; delivery?: maplibregl.Marker }>({});
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: deliveryLocation
        ? [deliveryLocation.lng, deliveryLocation.lat]
        : driverLocation
        ? [driverLocation.lng, driverLocation.lat]
        : FALLBACK_CENTER,
      zoom: driverLocation || deliveryLocation ? 11 : 3,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;
    map.on("load", () => setMapReady(true));
    return () => {
      markersRef.current.driver?.remove();
      markersRef.current.delivery?.remove();
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
    // We only want to initialize once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const updateMarker = (
      key: "driver" | "delivery",
      coords: { lat: number; lng: number } | null | undefined,
      color: string,
    ) => {
      if (!coords) {
        markersRef.current[key]?.remove();
        markersRef.current[key] = undefined;
        return;
      }
      if (!markersRef.current[key]) {
        markersRef.current[key] = new maplibregl.Marker({ color }).addTo(map);
      }
      markersRef.current[key]!.setLngLat([coords.lng, coords.lat]);
    };

    updateMarker("driver", driverLocation ?? undefined, "#2563eb");
    updateMarker("delivery", deliveryLocation ?? undefined, "#16a34a");

    const points: [number, number][] = [];
    if (driverLocation) points.push([driverLocation.lng, driverLocation.lat]);
    if (deliveryLocation) points.push([deliveryLocation.lng, deliveryLocation.lat]);

    if (points.length === 0) {
      map.easeTo({ center: FALLBACK_CENTER, zoom: 3, duration: 500 });
    } else if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: 12, duration: 500 });
    } else if (points.length === 2) {
      const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
      bounds.extend(points[1]);
      map.fitBounds(bounds, { padding: 24, maxZoom: 14, duration: 500 });
    }
  }, [driverLocation, deliveryLocation, mapReady]);

  const formatter = useMemo(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }), []);

  const computedDistanceKm = useMemo(() => {
    if (driverLocation && deliveryLocation) {
      return Math.round(
        haversineDistanceKm(driverLocation.lat, driverLocation.lng, deliveryLocation.lat, deliveryLocation.lng) * 100,
      ) / 100;
    }
    return distanceKm ?? null;
  }, [driverLocation, deliveryLocation, distanceKm]);

  const computedEta = useMemo(() => {
    if (computedDistanceKm == null) {
      return etaMinutes ?? null;
    }
    if (computedDistanceKm === 0) {
      return 0;
    }
    return Math.round(((computedDistanceKm / DEFAULT_DRIVER_SPEED_KMH) * 60) * 10) / 10;
  }, [computedDistanceKm, etaMinutes]);

  const summaryText = computedDistanceKm != null && computedEta != null
    ? `~${formatter.format(computedDistanceKm)} km • ETA ${formatter.format(computedEta)} min`
    : noTelemetryLabel;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-40 w-48 overflow-hidden rounded-md border">
        <div ref={containerRef} className="h-full w-full" />
        {!driverLocation && !deliveryLocation && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-muted-foreground">
            {noTelemetryLabel}
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{summaryText}</div>
    </div>
  );
}

// Mirror server transitions: allow branch to move directly to ready/out_for_delivery
const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["ready", "out_for_delivery", "driver_enroute", "cancelled"],
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
  const [driverLocations, setDriverLocations] = useState<Record<string, DriverTelemetry>>({});

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
          if (data?.driverId && data?.driverLocation) {
            setDriverLocations((prev) => ({
              ...prev,
              [data.driverId]: {
                lat: data.driverLocation.lat,
                lng: data.driverLocation.lng,
                timestamp: data.driverLocation.timestamp,
              },
            }));
          }
          queryClient.setQueryData<DeliveryOrder[]>(
            ["/api/delivery-orders", statusFilter, driverFilter],
            (old) => {
              if (!old) return old;
              return old.map((o) => {
                const matches = o.orderId === data.orderId || o.id === data.orderId;
                if (!matches) return o;

                const updated: DeliveryOrder = {
                  ...o,
                  status: data.deliveryStatus ?? o.status,
                  driverId: data.driverId ?? o.driverId,
                };

                if ("distanceKm" in data) {
                  updated.distanceKm = data.distanceKm ?? null;
                }
                if ("etaMinutes" in data) {
                  updated.etaMinutes = data.etaMinutes ?? null;
                }
                if (data.deliveryLocation) {
                  updated.deliveryLat = data.deliveryLocation.lat ?? null;
                  updated.deliveryLng = data.deliveryLocation.lng ?? null;
                }
                if (data.driverLocation) {
                  updated.driverLat = data.driverLocation.lat ?? null;
                  updated.driverLng = data.driverLocation.lng ?? null;
                  updated.driverLocationTimestamp = data.driverLocation.timestamp ?? null;
                }

                return updated;
              });
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
          const { driverId, lat, lng, timestamp } = data ?? {};
          if (typeof driverId !== "string" || typeof lat !== "number" || typeof lng !== "number") {
            return;
          }
          setDriverLocations((prev) => ({
            ...prev,
            [driverId]: { lat, lng, timestamp },
          }));
          queryClient.setQueryData<DeliveryOrder[]>(
            ["/api/delivery-orders", statusFilter, driverFilter],
            (old) =>
              old?.map((order) =>
                order.driverId === driverId
                  ? {
                      ...order,
                      driverLat: lat,
                      driverLng: lng,
                      driverLocationTimestamp: timestamp ?? order.driverLocationTimestamp ?? null,
                    }
                  : order,
              ) ?? old,
          );
        } catch {
          /* ignore */
        }
      };
    } catch (err) {
      console.error("WebSocket connection failed for driver location:", err);
    }
    return () => ws?.close();
  }, [queryClient, statusFilter, driverFilter]);

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
            {safeOrders.map((order) => {
              const driverTelemetry = order.driverId
                ? driverLocations[order.driverId] ||
                  (order.driverLat != null && order.driverLng != null
                    ? {
                        lat: order.driverLat,
                        lng: order.driverLng,
                        timestamp: order.driverLocationTimestamp ?? undefined,
                      }
                    : undefined)
                : undefined;
              const deliveryLocation =
                order.deliveryLat != null && order.deliveryLng != null
                  ? { lat: order.deliveryLat, lng: order.deliveryLng }
                  : null;

              return (
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
                  <DeliveryMapCell
                    driverLocation={driverTelemetry ?? null}
                    deliveryLocation={deliveryLocation}
                    etaMinutes={order.etaMinutes ?? null}
                    distanceKm={order.distanceKm ?? null}
                    noTelemetryLabel={t.awaitingTelemetry ?? "Awaiting location data"}
                  />
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
              );
            })}
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
