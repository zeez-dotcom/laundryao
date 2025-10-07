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
  onSuccess?: () => void;
};

export function RecordPaymentDialog({ open, onOpenChange, customerId, customerName, defaultAmount, orderId, orderNumber, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuthContext();

  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("cash");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(defaultAmount ? String(defaultAmount) : "");
      setMethod("cash");
      setNotes(orderNumber ? `Payment for order ${orderNumber}` : "");
    }
  }, [open, defaultAmount, orderNumber]);

  async function handleSubmit() {
    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      toast({ title: t.error, description: t.invalidAmount || "Invalid amount", variant: "destructive" });
      return;
    }
    const allowed = new Set(["cash", "card", "bank_transfer"]);
    if (!allowed.has(method)) {
      toast({ title: t.error, description: t.invalidPaymentMethod || "Invalid payment method", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await apiRequest("POST", `/api/customers/${customerId}/payments`, {
        amount: amt.toFixed(2),
        paymentMethod: method,
        notes,
        receivedBy: user?.username || "POS User",
        ...(orderId ? { orderId } : {}),
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
            {orderNumber ? `${t.order || "Order"} #${orderNumber}` : t.enterPaymentDetails || "Enter payment details"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            </div>
            <div>
              <Label htmlFor="method">{t.paymentMethod}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="method" className="w-full">
                  <SelectValue placeholder={t.selectPaymentMethod || "Select method"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t.cash}</SelectItem>
                  <SelectItem value="card">{t.card}</SelectItem>
                  <SelectItem value="bank_transfer">{t.bankTransfer || "Bank Transfer"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">{t.notesOptional}</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment notes..." />
          </div>
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

