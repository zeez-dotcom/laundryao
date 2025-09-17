import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/lib/currency";
import type { Package } from "./package-form";
import type { PackageItem, LaundryService, ClothingItem } from "@shared/schema";
import { useAuthContext } from "@/context/AuthContext";

export interface PackageCardProps {
  pkg: Package;
}

export function PackageCard({ pkg }: PackageCardProps) {
  const { branch } = useAuthContext();
  const branchId = branch?.id;
  const branchCode = branch?.code;

  const { data: services = [] } = useQuery<LaundryService[]>({
    queryKey: ["/api/laundry-services"],
  });
  const { data: clothingItems = [] } = useQuery<ClothingItem[]>({
    queryKey: ["/api/clothing-items"],
    queryFn: async () => {
      const res = await fetch(`/api/clothing-items`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clothing items");
      return res.json();
    },
  });

  const serviceMap = useMemo(() => {
    const map = new Map<string, string>();
    services.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [services]);

  const clothingMap = useMemo(() => {
    const map = new Map<string, string>();
    clothingItems.forEach((c) => map.set(c.id, c.name));
    return map;
    }, [clothingItems]);

  const { formatCurrency } = useCurrency();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {pkg.nameEn}
          {pkg.nameAr && (
            <div className="text-sm font-normal text-gray-600 text-right" dir="rtl">
              {pkg.nameAr}
            </div>
          )}
          {typeof (pkg as any).publicId === 'number' && (
            <div className="text-xs font-normal text-gray-500">Package ID #{(pkg as any).publicId}</div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-medium">{formatCurrency(pkg.price || 0)}</p>
        {pkg.packageItems && pkg.packageItems.length > 0 && (
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            {pkg.packageItems.map((item, idx) => {
              const free = Math.max(
                (item.credits || 0) - (item.paidCredits || 0),
                0,
              );
              const serviceName =
                item.serviceId ? serviceMap.get(item.serviceId) || item.serviceId : "";
              const clothingName =
                item.clothingItemId
                  ? clothingMap.get(item.clothingItemId) || item.clothingItemId
                  : null;
              const secondaryName = clothingName;
              return (
                <li key={idx}>
                  {serviceName}
                  {secondaryName ? ` – ${secondaryName}` : ""}: {item.credits} credits
                  {item.paidCredits != null && free > 0 && <> ({free} free)</>}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default PackageCard;
