import { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_CENTER: [number, number] = [25.276987, 55.296249];

const defaultMarkerIcon = L.icon({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultMarkerIcon;

type RiskLevel = 'ok' | 'warning' | 'breach';

type ControlTowerOverview = {
  generatedAt: string;
  branchId: string;
  telemetryWindowMinutes: number;
  drivers: Array<{
    id: string;
    name: string;
    status: string;
    availableCapacity: number;
    activeDeliveries: number;
    location: {
      driverId: string;
      lat: number;
      lng: number;
      timestamp: string;
      speedKph?: number | null;
      heading?: number | null;
    } | null;
    metrics: {
      averageSpeedKph: number;
      pingSampleSize: number;
      lastUpdateIso: string | null;
      reliability: number;
    };
  }>;
  deliveries: Array<{
    deliveryId: string;
    orderId: string;
    status: string;
    etaMinutes: number | null;
    distanceKm: number | null;
    slaMinutes: number | null;
    riskLevel: RiskLevel;
    assignedDriverId: string | null;
    location: { lat: number; lng: number } | null;
  }>;
  slaHeatmap: Array<{
    lat: number;
    lng: number;
    breachCount: number;
    severity: number;
  }>;
};

type AssignmentPlan = {
  generatedAt: string;
  assignments: Array<{
    deliveryId: string;
    driverId: string;
    etaMinutes: number;
    distanceKm: number;
    confidence: number;
    reasons: string[];
  }>;
  unassignedDeliveries: string[];
};

const riskColors: Record<RiskLevel, string> = {
  ok: '#16a34a',
  warning: '#f97316',
  breach: '#dc2626',
};

export default function ControlTowerPage() {
  const queryClient = useQueryClient();
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [overrideDriverId, setOverrideDriverId] = useState<string | null>(null);

  const overviewQuery = useQuery<ControlTowerOverview>({
    queryKey: ['control-tower', 'overview'],
    queryFn: async () => {
      const response = await fetch('/api/control-tower/overview');
      if (!response.ok) {
        throw new Error('Failed to load control tower overview');
      }
      return (await response.json()) as ControlTowerOverview;
    },
    refetchInterval: 30_000,
  });

  const previewMutation = useMutation<AssignmentPlan, Error, string>({
    mutationFn: async (deliveryId) => {
      const response = await fetch('/api/control-tower/assignments/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryIds: [deliveryId] }),
      });
      if (!response.ok) {
        throw new Error('Failed to load assignment preview');
      }
      return (await response.json()) as AssignmentPlan;
    },
  });

  const overrideMutation = useMutation<unknown, Error, { deliveryId: string; driverId: string }>({
    mutationFn: async ({ deliveryId, driverId }) => {
      const response = await fetch('/api/control-tower/assignments/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId, driverId }),
      });
      if (!response.ok) {
        throw new Error('Failed to override delivery assignment');
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['control-tower', 'overview'] });
      previewMutation.reset();
    },
  });

  const mapCenter = useMemo<[number, number]>(() => {
    const points: Array<[number, number]> = [];
    overviewQuery.data?.drivers.forEach((driver) => {
      if (driver.location) {
        points.push([driver.location.lat, driver.location.lng]);
      }
    });
    overviewQuery.data?.deliveries.forEach((delivery) => {
      if (delivery.location) {
        points.push([delivery.location.lat, delivery.location.lng]);
      }
    });
    if (points.length === 0) {
      return DEFAULT_CENTER;
    }
    const avgLat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const avgLng = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    return [avgLat, avgLng];
  }, [overviewQuery.data]);

  const selectedDelivery = overviewQuery.data?.deliveries.find(
    (delivery) => delivery.deliveryId === selectedDeliveryId,
  );

  useEffect(() => {
    if (selectedDeliveryId) {
      previewMutation.mutate(selectedDeliveryId);
    } else {
      previewMutation.reset();
    }
  }, [selectedDeliveryId]);

  useEffect(() => {
    const firstRecommendation = previewMutation.data?.assignments[0];
    if (firstRecommendation) {
      setOverrideDriverId(firstRecommendation.driverId);
    }
  }, [previewMutation.data?.assignments]);

  const handleApplyOverride = () => {
    if (!selectedDeliveryId || !overrideDriverId) return;
    overrideMutation.mutate({ deliveryId: selectedDeliveryId, driverId: overrideDriverId });
  };

  const driversAvailable = overviewQuery.data?.drivers.filter((driver) => driver.availableCapacity > 0).length ?? 0;
  const deliveriesAtRisk = overviewQuery.data?.deliveries.filter((delivery) => delivery.riskLevel !== 'ok').length ?? 0;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Delivery Control Tower</h1>
          <p className="text-sm text-muted-foreground">
            Live fleet visibility, SLA heatmap, and manual override workflows.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>Last updated:</span>
          <span className="font-medium text-foreground">
            {overviewQuery.data
              ? formatDistanceToNow(new Date(overviewQuery.data.generatedAt), { addSuffix: true })
              : '—'}
          </span>
          <Button variant="outline" size="sm" onClick={() => overviewQuery.refetch()} disabled={overviewQuery.isLoading}>
            Refresh
          </Button>
        </div>
      </header>

      {overviewQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(overviewQuery.error as Error).message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase text-muted-foreground">Active deliveries</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {overviewQuery.data?.deliveries.length ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase text-muted-foreground">Drivers available</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{driversAvailable}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-xs uppercase text-muted-foreground">Deliveries at risk</p>
          <p className={cn('mt-2 text-3xl font-semibold', deliveriesAtRisk > 0 ? 'text-destructive' : 'text-foreground')}>
            {deliveriesAtRisk}
          </p>
        </div>
      </section>

      <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="h-[520px] overflow-hidden rounded-lg border bg-card shadow-sm">
            {typeof window !== 'undefined' && (
              <MapContainer center={mapCenter} zoom={12} className="h-full w-full">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {overviewQuery.data?.drivers.map((driver) => {
                  if (!driver.location) return null;
                  return (
                    <CircleMarker
                      key={`driver-${driver.id}`}
                      center={[driver.location.lat, driver.location.lng]}
                      radius={8}
                      pathOptions={{
                        color: driver.status === 'available' ? '#16a34a' : '#facc15',
                        fillColor: driver.status === 'available' ? '#16a34a' : '#facc15',
                        fillOpacity: 0.8,
                      }}
                    >
                      <Popup>
                        <div className="space-y-1 text-sm">
                          <p className="font-semibold">{driver.name}</p>
                          <p className="text-muted-foreground">Status: {driver.status}</p>
                          <p>Capacity: {driver.availableCapacity}</p>
                          <p>Speed: {driver.metrics.averageSpeedKph.toFixed(1)} km/h</p>
                          {driver.metrics.lastUpdateIso && (
                            <p className="text-xs text-muted-foreground">
                              Last ping {formatDistanceToNow(new Date(driver.metrics.lastUpdateIso), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                {overviewQuery.data?.deliveries.map((delivery) => {
                  if (!delivery.location) return null;
                  return (
                    <CircleMarker
                      key={`delivery-${delivery.deliveryId}`}
                      center={[delivery.location.lat, delivery.location.lng]}
                      radius={10}
                      pathOptions={{
                        color: riskColors[delivery.riskLevel],
                        fillColor: riskColors[delivery.riskLevel],
                        fillOpacity: 0.5,
                      }}
                      eventHandlers={{
                        click: () => setSelectedDeliveryId(delivery.deliveryId),
                      }}
                    >
                      <Popup>
                        <div className="space-y-1 text-sm">
                          <p className="font-semibold">Delivery #{delivery.orderId.slice(0, 8)}</p>
                          <p>Status: {delivery.status}</p>
                          <p>ETA: {delivery.etaMinutes != null ? `${delivery.etaMinutes.toFixed(1)} min` : '—'}</p>
                          <p className="text-muted-foreground">Risk: {delivery.riskLevel}</p>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
                {overviewQuery.data?.slaHeatmap.map((cell, idx) => (
                  <CircleMarker
                    key={`heat-${idx}`}
                    center={[cell.lat, cell.lng]}
                    radius={20 * Math.max(cell.severity, 0.2)}
                    pathOptions={{ color: 'transparent', fillColor: '#ef4444', fillOpacity: 0.18 }}
                  />
                ))}
              </MapContainer>
            )}
          </div>
        </div>

        <div className="flex h-[520px] flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Delivery queue</h2>
            <p className="text-sm text-muted-foreground">
              Select a delivery to preview driver recommendations and apply manual overrides.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto pr-2">
            <ul className="space-y-2">
              {overviewQuery.data?.deliveries.map((delivery) => (
                <li key={delivery.deliveryId}>
                  <button
                    type="button"
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left text-sm transition hover:border-primary',
                      selectedDeliveryId === delivery.deliveryId && 'border-primary bg-primary/5',
                    )}
                    onClick={() => setSelectedDeliveryId(delivery.deliveryId)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">#{delivery.orderId.slice(0, 8)}</span>
                      <span className="text-xs uppercase" style={{ color: riskColors[delivery.riskLevel] }}>
                        {delivery.riskLevel}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{delivery.status}</span>
                      <span>
                        ETA: {delivery.etaMinutes != null ? `${delivery.etaMinutes.toFixed(1)}m` : '—'} | SLA:{' '}
                        {delivery.slaMinutes != null ? `${delivery.slaMinutes.toFixed(1)}m` : '—'}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
              {!overviewQuery.data && overviewQuery.isLoading && (
                <li className="text-sm text-muted-foreground">Loading deliveries…</li>
              )}
            </ul>
          </div>

          <div className="space-y-3 rounded-md border bg-background p-3">
            <h3 className="text-sm font-semibold text-foreground">Manual override</h3>
            {selectedDelivery && overviewQuery.data ? (
              <>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Delivery #{selectedDelivery.orderId.slice(0, 8)}</p>
                  <p className="text-muted-foreground">
                    Current driver: {selectedDelivery.assignedDriverId ?? 'Unassigned'}
                  </p>
                </div>
                <div className="space-y-2 text-sm">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs uppercase text-muted-foreground">Driver</span>
                    <select
                      className="rounded border bg-background px-2 py-1"
                      value={overrideDriverId ?? ''}
                      onChange={(event) => setOverrideDriverId(event.target.value)}
                    >
                      <option value="" disabled>
                        Select driver
                      </option>
                      {overviewQuery.data.drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name} (cap {driver.availableCapacity})
                        </option>
                      ))}
                    </select>
                  </label>
                  {previewMutation.data?.assignments.length ? (
                    <div className="rounded border border-primary/30 bg-primary/5 p-2 text-xs">
                      <p className="font-medium text-primary">Recommended driver</p>
                      {previewMutation.data.assignments.map((assignment) => (
                        <p key={assignment.driverId}>
                          {overviewQuery.data?.drivers.find((driver) => driver.id === assignment.driverId)?.name ||
                            assignment.driverId}
                          : ETA {assignment.etaMinutes.toFixed(1)}m, distance {assignment.distanceKm.toFixed(1)}km, confidence{' '}
                          {Math.round(assignment.confidence * 100)}%
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {previewMutation.isPending
                        ? 'Calculating recommendations…'
                        : 'Select a delivery to view driver suggestions.'}
                    </p>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={handleApplyOverride}
                  disabled={!overrideDriverId || overrideMutation.isPending}
                >
                  {overrideMutation.isPending ? 'Applying…' : 'Apply override'}
                </Button>
                {overrideMutation.isError && (
                  <p className="text-xs text-destructive">{overrideMutation.error.message}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a delivery to view recommendations and assign a driver.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
