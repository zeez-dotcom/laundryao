import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { useLocation } from "wouter";

type OrderDetailModalProps = {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
};

export function OrderDetailModal({ orderId, isOpen, onClose }: OrderDetailModalProps) {
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { formatCurrency } = useCurrency();
  const [, setLocation] = useLocation();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orderId || !isOpen) return;
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest("GET", `/api/orders/${orderId}`);
        const data = await res.json();
        if (!cancelled) setOrder(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orderId, isOpen]);

  const items: any[] = Array.isArray(order?.items) ? order.items : [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-3xl max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar sm:w-full">
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
          <DialogDescription>
            {order ? (
              <span>Order #{order.orderNumber} • {new Date(order.createdAt).toLocaleString()}</span>
            ) : (
              <span>Loading…</span>
            )}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading order…</div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : order ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div><span className="text-muted-foreground">Customer:</span> {order.customerName}</div>
                <div><span className="text-muted-foreground">Payment:</span> {order.paymentMethod}</div>
                <div><span className="text-muted-foreground">Status:</span> {order.status}</div>
              </div>
              <div className="text-right">
                <div><span className="text-muted-foreground">Subtotal:</span> {formatCurrency(order.subtotal)}</div>
                <div><span className="text-muted-foreground">Tax:</span> {formatCurrency(order.tax)}</div>
                <div className="font-semibold"><span className="text-muted-foreground">Total:</span> {formatCurrency(order.total)}</div>
              </div>
            </div>
            <div className="overflow-x-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--surface-muted)]">
                  <tr>
                    <th className="text-left p-2">Item</th>
                    <th className="text-left p-2">Service</th>
                    <th className="text-right p-2">Qty</th>
                    <th className="text-right p-2">Price</th>
                    <th className="text-right p-2">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{it.clothingItem?.name ?? it.name ?? '-'}</td>
                      <td className="p-2">{it.service?.name ?? it.service ?? '-'}</td>
                      <td className="p-2 text-right">{it.quantity ?? 1}</td>
                      <td className="p-2 text-right">{formatCurrency(Number(it.price ?? 0))}</td>
                      <td className="p-2 text-right">{formatCurrency(Number(it.total ?? (Number(it.price ?? 0) * (it.quantity ?? 1))))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        <div className="flex justify-between gap-2 mt-4">
          <Button variant="outline" onClick={() => { if (orderId) setLocation(`/orders/${orderId}`); }}>
            Open full screen
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default OrderDetailModal;
