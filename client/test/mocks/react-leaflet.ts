import type { ReactNode } from "react";

const passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;

export const MapContainer = ({ children }: { children?: ReactNode }) => (
  <div data-testid="mock-map">{children}</div>
);
export const TileLayer = passthrough;
export const CircleMarker = passthrough;
export const Popup = passthrough;
