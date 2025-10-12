import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useAuthContext } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  deliveryAddress: string;
  deliveryStatus: string;
}

export default function DriverDashboard() {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const driverId = user?.id;

  const { data: orders = [] } = useQuery<DeliveryOrder[]>({
    queryKey: ["/api/delivery-orders", driverId],
    enabled: !!driverId,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/delivery-orders?driverId=${driverId}`,
      );
      return res.json();
    },
  });

  useEffect(() => {
    if (!driverId) return;
    const runtimeGlobal =
      typeof globalThis !== "undefined"
        ? (globalThis as typeof globalThis & { __TEST_LOCATION__?: Location })
        : undefined;
    const currentLocation =
      runtimeGlobal?.__TEST_LOCATION__ ?? runtimeGlobal?.location ?? window.location;
    const wsScheme = currentLocation?.protocol === "https:" ? "wss" : "ws";
    const host = currentLocation?.host ?? window.location.host;
    const orderWs = new WebSocket(`${wsScheme}://${host}/ws/delivery-orders`);
    orderWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.driverId === driverId) {
          queryClient.invalidateQueries({ queryKey: ["/api/delivery-orders", driverId] });
        }
      } catch {
        /* ignore */
      }
    };

    const locWs = new WebSocket(`${wsScheme}://${host}/ws/driver-location`);
    let watchId: number | undefined;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition((pos) => {
        const payload = {
          driverId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        locWs.send(JSON.stringify(payload));
      });
    }

    return () => {
      orderWs.close();
      locWs.close();
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [driverId, queryClient]);

  return (
    <div className="p-4">
      <h1 className="text-xl mb-4">{t.driverDashboard}</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.orderNumber}</TableHead>
            <TableHead>{t.address}</TableHead>
            <TableHead>{t.status}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id}>
              <TableCell>{o.orderNumber}</TableCell>
              <TableCell>{o.deliveryAddress}</TableCell>
              <TableCell>{o.deliveryStatus}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
