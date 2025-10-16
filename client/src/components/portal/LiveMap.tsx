import { MapPin, Navigation, Truck } from "lucide-react";

export interface LiveMapProps {
  driverLocation?: { lat: number; lng: number; timestamp?: string | null } | null;
  deliveryLocation?: { lat: number; lng: number } | null;
  distanceKm?: number | null;
  etaMinutes?: number | null;
}

export function LiveMap({ driverLocation, deliveryLocation, distanceKm, etaMinutes }: LiveMapProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Live map</h3>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {driverLocation?.timestamp
            ? `Updated ${new Date(driverLocation.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : "Awaiting driver"}
        </span>
      </div>
      <div className="relative overflow-hidden rounded-xl border bg-muted/30 p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.15),_transparent_60%)]" />
        <div className="relative space-y-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Driver en route</p>
              <p className="text-xs text-muted-foreground">
                {driverLocation
                  ? `Lat ${driverLocation.lat.toFixed(3)}, Lng ${driverLocation.lng.toFixed(3)}`
                  : "Waiting for first signal"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Delivery address</p>
              <p className="text-xs text-muted-foreground">
                {deliveryLocation
                  ? `Lat ${deliveryLocation.lat.toFixed(3)}, Lng ${deliveryLocation.lng.toFixed(3)}`
                  : "Address confirmed"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
              <Navigation className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Route overview</p>
              <p className="text-xs text-muted-foreground">
                {distanceKm != null ? `${distanceKm.toFixed(1)} km away` : "Distance calculating"} ·
                {" "}
                {etaMinutes != null ? `${Math.max(0, Math.round(etaMinutes))} minutes` : "ETA pending"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
