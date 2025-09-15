import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LaundryCartSummary } from "@shared/schema";
import { format } from "date-fns";

interface PackageUsageModalProps {
  open: boolean;
  onClose: () => void;
  packages: any[];
  cartSummary: LaundryCartSummary;
  onApply: (
    usage: {
      packageId: string;
      items: {
        serviceId: string;
        clothingItemId: string;
        quantity: number;
      }[];
    },
  ) => void;
}

export function PackageUsageModal({ open, onClose, packages, cartSummary, onApply }: PackageUsageModalProps) {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});

  const cartServiceCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cartSummary.items) {
      const key = `${item.service.id}:${item.clothingItem.id}`;
      map[key] = (map[key] || 0) + item.quantity;
    }
    return map;
  }, [cartSummary]);

  const pkg = packages.find((p: any) => p.id === selectedPackage);

  useEffect(() => {
    setUsage({});
  }, [selectedPackage]);

  const setQty = (serviceId: string, itemId: string, qty: number) => {
    const key = `${serviceId}:${itemId}`;
    setUsage((prev) => ({ ...prev, [key]: qty }));
  };

  const isValid = useMemo(() => {
    if (!pkg) return false;
    for (const item of pkg.items || []) {
      const key = `${item.serviceId}:${item.clothingItemId}`;
      const qty = usage[key] || 0;
      const cartQty = cartServiceCounts[key] || 0;
      if (qty > item.balance || qty > cartQty) return false;
    }
    return Object.values(usage).some((v) => v > 0);
  }, [pkg, usage, cartServiceCounts]);

  const handleApply = () => {
    if (!pkg) return;
    const items = Object.entries(usage)
      .filter(([, q]) => q > 0)
      .map(([key, quantity]) => {
        const [serviceId, clothingItemId] = key.split(":");
        return { serviceId, clothingItemId, quantity };
      });
    onApply({ packageId: pkg.id, items });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Use Package</DialogTitle>
          <DialogDescription>
            Apply available package credits to items in the cart
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {packages.map((p: any) => (
              <Button
                key={p.id}
                variant={p.id === selectedPackage ? "default" : "outline"}
                className="w-full justify-between"
                onClick={() => setSelectedPackage(p.id)}
              >
                <div className="flex flex-col items-start text-left">
                  <span>{p.nameEn}</span>
                  {p.nameAr && (
                    <span className="text-xs text-gray-600" dir="rtl">{p.nameAr}</span>
                  )}
                  {p.startsAt && p.expiresAt && (
                    <span className="text-xs text-gray-500">
                      {format(new Date(p.startsAt), "MMM d")} -
                      {format(new Date(p.expiresAt), "MMM d")}
                    </span>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {p.balance}/{p.totalCredits}
                </span>
              </Button>
            ))}
          </div>
          {pkg && (
            <div className="space-y-3">
              {pkg.items?.map((item: any) => {
                const key = `${item.serviceId}:${item.clothingItemId}`;
                const cartQty = cartServiceCounts[key] || 0;
                return (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {item.serviceName || item.serviceId}
                        {item.clothingItemName
                          ? ` – ${item.clothingItemName}`
                          : ""}
                      </div>
                      <div className="text-xs text-gray-500">
                        In Cart: {cartQty} | Remaining: {item.balance - (usage[key] || 0)} / {item.totalCredits}
                      </div>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={Math.min(item.balance, cartQty)}
                      value={usage[key] ?? ""}
                      onChange={(e) =>
                        setQty(
                          item.serviceId,
                          item.clothingItemId,
                          parseInt(e.target.value) || 0,
                        )
                      }
                      className="w-24"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!isValid}>
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
