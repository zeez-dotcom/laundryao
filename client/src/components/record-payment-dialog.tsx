import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { useAuthContext } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  customerName?: string;
  defaultAmount?: string | number;
  orderId?: string;
  orderNumber?: string;
  orderTotal?: number | string;
  onSuccess?: () => void;
};

export function RecordPaymentDialog({ open, onOpenChange, customerId, customerName, defaultAmount, orderId, orderNumber, orderTotal, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuthContext();

  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("cash");
  const [notes, setNotes] = useState<string>("");
  const [channel, setChannel] = useState<string>("pos");
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [orderRemaining, setOrderRemaining] = useState<number | null>(null);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [isOverpayOverride, setIsOverpayOverride] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(defaultAmount ? String(defaultAmount) : "");
      setMethod("cash");
      setNotes(orderNumber ? `Payment for order ${orderNumber}` : "");
      // Fetch customer balance for preview
      (async () => {
        try {
          const res = await apiRequest('GET', `/api/customers/${customerId}`);
          const c = await res.json();
          const b = parseFloat(c?.balanceDue ?? '0');
          setBalance(isNaN(b) ? 0 : b);
        } catch { setBalance(null); }
      })();
      // If linked to an order, compute remaining for that order
      if (orderId && orderTotal) {
        (async () => {
          try {
            const res = await apiRequest('GET', `/api/customers/${customerId}/payments`);
            const list = await res.json();
            const paidForOrder = (Array.isArray(list) ? list : (list?.data || [])).filter((p: any) => p.orderId === orderId)
              .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
            const remaining = Math.max((Number(orderTotal) || 0) - paidForOrder, 0);
            setOrderRemaining(Number(remaining.toFixed(2)));
            // Default to remaining if provided via pay-later flow
            setAmount(remaining.toFixed(2));
          } catch {
            setOrderRemaining(null);
          }
        })();
      } else {
        setOrderRemaining(null);
      }
    }
  }, [open, defaultAmount, orderNumber, orderId, orderTotal, customerId]);

  const exceedsCap = (() => {
    const amt = parseFloat(amount || '0');
    return Boolean(orderId && orderRemaining != null && amt > orderRemaining + 1e-6);
  })();

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      toast({ title: t.error, description: t.invalidPaymentAmount || "Invalid amount", variant: "destructive" });
      return;
    }
    const allowed = new Set(["cash", "card", "bank_transfer"]);
    if (!allowed.has(method)) {
      toast({ title: t.error, description: t.invalidData || "Invalid payment method", variant: "destructive" });
      return;
    }
    // Cap overpayment unless override
    if (orderId && orderRemaining != null && amt > orderRemaining + 1e-6 && !isOverpayOverride) {
      setShowOverrideConfirm(true);
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", `/api/customers/${customerId}/payments`, {
        amount: amt.toFixed(2),
        paymentMethod: method,
        channel,
        notes,
        receivedBy: user?.username || "POS User",
        ...(orderId ? { orderId } : {}),
        ...(isOverpayOverride ? { isOverpayOverride: true, overrideReason } : {}),
      });
      toast({ title: t.success, description: t.paymentRecorded || "Payment recorded" });
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      toast({ title: t.error, description: t.failedToRecordPayment || "Failed to record payment", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.recordPayment} {customerName ? `- ${customerName}` : ""}</DialogTitle>
          <DialogDescription>
            {orderNumber ? `${t.order || "Order"} #${orderNumber}` : "Enter payment details"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {balance != null && (
            <div className="rounded border p-2 text-sm">
              <div>Current balance: <span className="font-medium">{balance.toFixed(2)}</span></div>
              <div>New balance after payment: <span className="font-medium">{(balance - (parseFloat(amount || '0') || 0)).toFixed(2)}</span></div>
              {orderId && orderRemaining != null && (
                <div className="mt-1">Order remaining: <span className="font-medium">{orderRemaining.toFixed(2)}</span></div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="amount">{t.paymentAmount} *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              {orderId && orderRemaining != null && (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAmount(orderRemaining.toFixed(2))}
                  >
                    Fill Remaining
                  </Button>
                  {exceedsCap && !isOverpayOverride && (
                    <span className="text-xs text-red-600">Exceeds remaining. <button className="underline" onClick={() => setShowOverrideConfirm(true)}>Override?</button></span>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="method">{t.paymentMethod}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="method" className="w-full">
                  <SelectValue placeholder={t.select || "Select method"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t.cash}</SelectItem>
                  <SelectItem value="card">{t.card}</SelectItem>
                  <SelectItem value="bank_transfer">{t.bankTransfer || "Bank Transfer"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="channel">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger id="channel" className="w-full">
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pos">POS</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">{t.notesOptional}</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment notes..." />
          </div>

          {showOverrideConfirm && (
            <div className="rounded border p-3 space-y-2">
              <div className="text-sm font-medium">Overpayment override</div>
              <div className="text-sm text-gray-600">Entered amount exceeds order remaining. Provide a reason to proceed.</div>
              <Input
                placeholder="Reason for override"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowOverrideConfirm(false); setIsOverpayOverride(false); }}
                >
                  Cancel override
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => { if (overrideReason.trim()) { setIsOverpayOverride(true); setShowOverrideConfirm(false); } }}
                  disabled={!overrideReason.trim()}
                >
                  Confirm override
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {t.recordPayment}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
