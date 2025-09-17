import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Package as PackageType,
  PackageItem,
  LaundryService,
  ClothingItem,
} from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/lib/currency";
import { PackageCard } from "./PackageCard";

export type Package = PackageType & {
  descriptionEn: string | null;
  maxItems: number | null;
  expiryDays: number | null;
  bonusCredits: number | null;
  packageItems?: PackageItem[];
};

interface PackageFormProps {
  pkg?: Package | null;
  onClose: () => void;
  branchId?: string;
  branchCode?: string;
}

export function PackageForm({ pkg, onClose, branchId, branchCode }: PackageFormProps) {
  const [name, setName] = useState(pkg?.nameEn || "");
  const [nameAr, setNameAr] = useState<string>(pkg?.nameAr || "");
  const [description, setDescription] = useState(pkg?.descriptionEn || "");
  const [descriptionAr, setDescriptionAr] = useState<string>(pkg?.descriptionAr || "");
  const [price, setPrice] = useState(pkg?.price?.toString() || "");
  const [maxItems, setMaxItems] = useState(pkg?.maxItems?.toString() || "");
  const [expiryDays, setExpiryDays] = useState(pkg?.expiryDays?.toString() || "");
  const [bonusCredits, setBonusCredits] = useState(pkg?.bonusCredits?.toString() || "");
  const [items, setItems] = useState<
    {
      serviceId: string | null;
      clothingItemId: string | null;
      credits: string;
    }[]
  >(
    pkg?.packageItems?.map((i) => ({
      serviceId: i.serviceId || null,
      clothingItemId: i.clothingItemId || null,
      credits: i.credits.toString(),
    })) || []
  );
  const [servicesMap, setServicesMap] = useState<Record<string, LaundryService[]>>({});

  const queryClient = useQueryClient();

  // fetch services for a clothing item
  const fetchServices = async (clothingItemId: string) => {
    if (servicesMap[clothingItemId]) return;
    const res = await fetch(`/api/clothing-items/${clothingItemId}/services`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setServicesMap((prev) => ({ ...prev, [clothingItemId]: data }));
    }
  };

  // Clothing items
  const { data: clothingItems = [] } = useQuery<ClothingItem[]>({
    queryKey: ["/api/clothing-items"],
    queryFn: async () => {
      const res = await fetch("/api/clothing-items", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clothing items");
      return res.json();
    },
  });

  const { toast } = useToast();
  const { formatCurrency } = useCurrency();

  const previewPackage: Package = {
    publicId: 0,
    id: pkg?.id || "preview",
    branchId: branchId || "",
    nameEn: name,
    nameAr: nameAr || null,
    descriptionEn: description || null,
    descriptionAr: descriptionAr || null,
    price: price || "0",
    maxItems: maxItems ? parseInt(maxItems) : null,
    expiryDays: expiryDays ? parseInt(expiryDays) : null,
    bonusCredits: bonusCredits ? parseInt(bonusCredits) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
    packageItems: items.map((i) => ({
      id: "",
      packageId: "",
      serviceId: i.serviceId!,
      clothingItemId: i.clothingItemId!,
      categoryId: null,
      credits: parseInt(i.credits || "0") || 0,
      paidCredits: parseInt(i.credits || "0") || 0,
    })) as PackageItem[],
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nameEn: name,
        nameAr: nameAr || undefined,
        descriptionEn: description || null,
        descriptionAr: descriptionAr || undefined,
        price,
        maxItems: maxItems ? parseInt(maxItems) : null,
        expiryDays: expiryDays ? parseInt(expiryDays) : null,
        bonusCredits: bonusCredits ? parseInt(bonusCredits) : null,
        ...(branchCode ? { branchCode } : branchId ? { branchId } : {}),
        packageItems: items
          .filter((i) => i.serviceId && i.clothingItemId && i.credits)
          .map((i) => ({
            serviceId: i.serviceId!,
            clothingItemId: i.clothingItemId!,
            credits: parseInt(i.credits),
          })),
      };
      if (pkg?.id) {
        await apiRequest("PUT", `/api/packages/${pkg.id}`, payload);
      } else {
        await apiRequest("POST", "/api/packages", payload);
      }
    },
    onSuccess: () => {
      toast({ title: pkg?.id ? "Package updated" : "Package created" });
      queryClient.invalidateQueries({
        queryKey: ["/api/packages", branchCode, branchId],
      });
      onClose();
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nameAr">Name (Arabic)</Label>
        <Input id="nameAr" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="descriptionAr">Description (Arabic)</Label>
        <Input
          id="descriptionAr"
          dir="rtl"
          value={descriptionAr}
          onChange={(e) => setDescriptionAr(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="price">Price (KWD)</Label>
        <Input id="price" value={price} onChange={(e) => setPrice(e.target.value)} />
        {price && <p className="text-sm text-gray-500">{formatCurrency(price)}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="maxItems">Max Items</Label>
        <Input
          id="maxItems"
          value={maxItems}
          onChange={(e) => setMaxItems(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="expiryDays">Expiry Days</Label>
        <Input
          id="expiryDays"
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bonusCredits">Bonus Credits</Label>
        <Input
          id="bonusCredits"
          value={bonusCredits}
          onChange={(e) => setBonusCredits(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Package Items</Label>
        {items.map((item, idx) => (
          <div key={idx} className="flex flex-wrap gap-2 w-full">
            <Select
              value={item.clothingItemId ?? undefined}
              onValueChange={(value) => {
                const next = [...items];
                next[idx].clothingItemId = value;
                next[idx].serviceId = null;
                setItems(next);
                void fetchServices(value);
              }}
            >
              <SelectTrigger className="flex-1 min-w-[180px]">
                <SelectValue placeholder="Select clothing item" />
              </SelectTrigger>
              <SelectContent>
                {clothingItems.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={item.serviceId ?? undefined}
              onValueChange={(value) => {
                const next = [...items];
                next[idx].serviceId = value;
                setItems(next);
              }}
            >
              <SelectTrigger className="flex-1 min-w-[180px]">
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {(servicesMap[item.clothingItemId || ""] || []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className="flex-1 min-w-[180px]"
              placeholder="Credits"
              value={item.credits}
              onChange={(e) => {
                const next = [...items];
                next[idx].credits = e.target.value;
                setItems(next);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setItems(items.filter((_, i) => i !== idx))}
            >
              Remove
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setItems([
              ...items,
              {
                serviceId: null,
                clothingItemId: null,
                credits: "",
              },
            ])
          }
        >
          Add Item
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Preview</Label>
        <PackageCard pkg={previewPackage} />
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {pkg?.id ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}

export default PackageForm;
