import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthContext } from "@/context/AuthContext";

export default function OrderDetailsPage({ params }: { params: { id: string } }) {
  const orderId = params.id;
  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { formatCurrency } = useCurrency();
  const [, setLocation] = useLocation();
  const [prints, setPrints] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const { user } = useAuthContext();
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payNotes, setPayNotes] = useState<string>("");
  const [isPaymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await apiRequest("GET", `/api/orders/${orderId}`);
        const json = await res.json();
        if (!cancelled) setOrder(json);
        // Load prints
        try {
          const printsRes = await apiRequest("GET", `/api/orders/${orderId}/prints`);
          const printsJson = await printsRes.json();
          if (!cancelled) setPrints(Array.isArray(printsJson) ? printsJson : []);
        } catch {}
        // Load payments if we have customer
        const custId = json?.customerId;
        if (custId) {
          try {
            const pRes = await apiRequest("GET", `/api/customers/${custId}/payments`);
            const pJson = await pRes.json();
            if (!cancelled) setPayments(Array.isArray(pJson) ? pJson : (Array.isArray(pJson?.data) ? pJson.data : []));
          } catch {}
        } else {
          if (!cancelled) setPayments([]);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  const items: any[] = Array.isArray(order?.items) ? order.items : [];
  const totalPaidForOrder = payments.filter((p: any) => p.orderId === orderId).reduce((acc: number, p: any) => acc + Number(p.amount || 0), 0);
  const remainingForOrder = order ? Math.max(0, Number(order.total) - totalPaidForOrder) : 0;

  const updateStatus = async (status: string) => {
    try {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status });
      const res = await apiRequest("GET", `/api/orders/${orderId}`);
      const json = await res.json();
      setOrder(json);
    } catch {}
  };

  return (
    <>
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Order Details</h1>
          {order && (
            <div className="mt-1 text-sm text-muted-foreground">
              Remaining (this order): <span className={remainingForOrder > 0 ? 'text-destructive' : ''}>{formatCurrency(remainingForOrder)}</span>
            </div>
          )}
        </div>
        <div className="space-x-2">
          <Button variant="outline" onClick={() => setLocation("/")}>Back</Button>
          {order && order.status !== 'handed_over' && (
            <Button variant="outline" onClick={() => updateStatus('handed_over')}>Mark as collected</Button>
          )}
          {order && order.status !== 'completed' && (
            <Button variant="outline" onClick={() => updateStatus('completed')}>Mark as completed</Button>
          )}
          {order && order.status !== 'cancelled' && (
            <Button variant="outline" onClick={() => setCancelOpen(true)}>Cancel Order</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div>Loading…</div>
      ) : error ? (
        <div className="text-destructive">{error}</div>
      ) : order ? (
        <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-2">
                <div><span className="text-muted-foreground">Order #:</span> {order.orderNumber}</div>
                <div><span className="text-muted-foreground">Customer:</span> {order.customerName}</div>
                <div><span className="text-muted-foreground">Phone:</span> {order.customerPhone}</div>
                <div><span className="text-muted-foreground">Created:</span> {new Date(order.createdAt).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Status:</span> {order.status}</div>
                <div><span className="text-muted-foreground">Payment:</span> {order.paymentMethod}</div>
                <div className="pt-2 border-t">
                  <div><span className="text-muted-foreground">Subtotal:</span> {formatCurrency(order.subtotal)}</div>
                  <div><span className="text-muted-foreground">Tax:</span> {formatCurrency(order.tax)}</div>
                  <div className="font-semibold"><span className="text-muted-foreground">Total:</span> {formatCurrency(order.total)}</div>
                </div>
                {order.customerId && (
                  <div className="pt-4 space-y-2">
                    <Button variant="outline" onClick={() => setLocation(`/customers/${order.customerId}/command-center`)}>
                      Open Customer Command Center
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Print History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr>
                      <th className="text-left p-2">Print #</th>
                      <th className="text-left p-2">Printed At</th>
                      <th className="text-left p-2">Printed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prints.length === 0 ? (
                      <tr><td className="p-2" colSpan={3}>No print history</td></tr>
                    ) : prints.map((p, idx) => (
                      <tr key={`${p.orderId}-${p.printNumber}-${idx}`} className="border-t">
                        <td className="p-2">{p.printNumber}</td>
                        <td className="p-2">{p.printedAt ? new Date(p.printedAt).toLocaleString() : ''}</td>
                        <td className="p-2">{p.printedBy ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {order.customerId && (
                <div className="mb-3">
                  <Button variant="outline" onClick={() => setPaymentOpen(true)}>Record Payment</Button>
                </div>
              )}
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Method</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-left p-2">Notes</th>
                      <th className="text-left p-2">For Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr><td className="p-2" colSpan={5}>No payments</td></tr>
                    ) : payments.map((pay, idx) => (
                      <tr key={`${pay.id}-${idx}`} className="border-t">
                        <td className="p-2">{pay.createdAt ? new Date(pay.createdAt).toLocaleString() : ''}</td>
                        <td className="p-2 capitalize">{pay.paymentMethod ?? ''}</td>
                        <td className="p-2 text-right">{formatCurrency(pay.amount ?? 0)}</td>
                        <td className="p-2">{pay.notes ?? ''}</td>
                        <td className="p-2">
                          {pay.orderId === orderId ? (
                            remainingForOrder <= 0 ? 'This order (Paid)' : 'This order'
                          ) : (pay.orderId ? pay.orderId.slice(-6) : '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
        </div>
      ) : null}
    </div>
    <RecordPaymentDialog
      open={isPaymentOpen}
      onOpenChange={setPaymentOpen}
      customerId={order?.customerId || ""}
      customerName={order?.customerName || undefined}
      defaultAmount={remainingForOrder}
      orderId={orderId}
      orderNumber={order?.orderNumber}
      orderTotal={order?.total}
      onSuccess={async () => {
        try {
          const pRes = await apiRequest("GET", `/api/customers/${order?.customerId}/payments`);
          const pJson = await pRes.json();
          setPayments(Array.isArray(pJson) ? pJson : (Array.isArray(pJson?.data) ? pJson.data : []));
          const resO = await apiRequest("GET", `/api/orders/${orderId}`);
          const jsonO = await resO.json();
          setOrder(jsonO);
        } catch {}
      }}
    />
    {cancelOpen && (
      <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center">
        <div className="bg-white rounded shadow-lg w-[90%] max-w-md p-4">
          <div className="font-semibold text-lg mb-2">Cancel Order</div>
          <div className="grid gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Reason</label>
              <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Enter cancellation reason" />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setCancelOpen(false)}>Close</Button>
              <Button onClick={async () => {
                try {
                  await apiRequest('PATCH', `/api/orders/${orderId}/status`, { status: 'cancelled', reason: cancelReason || undefined });
                  const res = await apiRequest('GET', `/api/orders/${orderId}`);
                  setOrder(await res.json());
                } finally {
                  setCancelOpen(false); setCancelReason('');
                }
              }}>Confirm Cancel</Button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
