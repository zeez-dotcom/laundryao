import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Customer, LaundryService, PackageItem, ClothingItem, Branch } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CustomerDialog } from "./customer-dialog";
import { Package, PackageForm } from "./package-form";
import { useCurrency } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiError } from "@/hooks/use-api-error";
import ErrorBoundary from "./ErrorBoundary";
import { useAuthContext } from "@/context/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function PackageListInner() {
  const { branch, isSuperAdmin } = useAuthContext();
  const [branchId, setBranchId] = useState<string | undefined>();
  const [branchCode, setBranchCode] = useState<string | undefined>();

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
    enabled: isSuperAdmin,
  });

  const { data: packages = [], error: packagesError } = useQuery<Package[]>({
    queryKey: ["/api/packages", branchCode, isSuperAdmin ? branchId : undefined],
    enabled: branchCode ? true : isSuperAdmin ? !!branchId : !!branch,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (branchCode) params.append("branchCode", branchCode);
      else if (isSuperAdmin && branchId) params.append("branchId", branchId);
      const res = await fetch(
        `/api/packages${params.toString() ? `?${params}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch packages");
      return res.json();
    },
  });

  const { data: services = [], error: servicesError } = useQuery<LaundryService[]>({
    queryKey: ["/api/laundry-services"],
  });

  const { data: clothingItems = [], error: clothingError } = useQuery<
    ClothingItem[]
  >({
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

  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [startsAt, setStartsAt] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Clear expanded cache when branch changes
    setExpanded({});
  }, [branchId, branchCode]);

  useEffect(() => {
    if (selectedPackage) {
      const start = new Date();
      setStartsAt(start.toISOString().slice(0, 10));
      if (selectedPackage.expiryDays != null) {
        const end = new Date(start);
        end.setDate(end.getDate() + selectedPackage.expiryDays);
        setExpiresAt(end.toISOString().slice(0, 10));
      } else {
        setExpiresAt("");
      }
    }
  }, [selectedPackage]);

  const getItemName = (
    item: PackageItem & { clothingItem?: { name: string } },
  ) => {
    const serviceName =
      item.serviceId ? serviceMap.get(item.serviceId) || item.serviceId : "";
    const clothingName =
      item.clothingItemId
        ? item.clothingItem?.name || clothingMap.get(item.clothingItemId) || item.clothingItemId
        : "";

    if (serviceName) {
      if (clothingName) return `${serviceName} – ${clothingName}`;
      return serviceName;
    }
    if (clothingName) return clothingName;
    if (item.categoryId) return item.categoryId;
    return "";
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPackage || !selectedCustomer) return;
      const query = branchCode
        ? `?branchCode=${branchCode}`
        : isSuperAdmin && branchId
        ? `?branchId=${branchId}`
        : "";
      await apiRequest("POST", `/api/packages/${selectedPackage.id}/assign${query}`,
        {
          customerId: selectedCustomer.id,
          startsAt: new Date(startsAt).toISOString(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        },
      );
    },
    onSuccess: () => {
      toast({ title: "Package assigned" });
      if (selectedCustomer) {
        queryClient.invalidateQueries({
          queryKey: ["/api/customers", selectedCustomer.id, "packages"],
        });
      }
      setSelectedPackage(null);
      setSelectedCustomer(null);
      setStartsAt("");
      setExpiresAt("");
      queryClient.invalidateQueries({
        queryKey: ["/api/packages", branchCode, branchId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const query = branchCode
        ? `?branchCode=${branchCode}`
        : isSuperAdmin && branchId
        ? `?branchId=${branchId}`
        : "";
      await apiRequest("DELETE", `/api/packages/${id}${query}`);
    },
    onSuccess: () => {
      toast({ title: "Package deleted" });
      queryClient.invalidateQueries({
        queryKey: ["/api/packages", branchCode, branchId],
      });
    },
  });

  const apiError = useApiError(
    packagesError || servicesError || clothingError,
  );
  if (apiError) return apiError;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Packages</h2>
        <Button
          size="sm"
          onClick={() => {
            setEditingPackage(null);
            setIsFormOpen(true);
          }}
          disabled={isSuperAdmin && !branchId && !branchCode}
        >
          Add Package
        </Button>
      </div>
      {isSuperAdmin && (
        <div className="space-y-2">
          <Label>Branch</Label>
          <Select
            value={branchId}
            onValueChange={(value) => {
              setBranchId(value);
              const b = branches.find((br) => br.id === value);
              setBranchCode(b?.code);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className="space-y-2 border rounded p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{pkg.nameEn}</p>
                <p className="text-sm text-gray-500">
                  {formatCurrency(pkg.price)}
                </p>
              </div>
              <div className="space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const query = branchCode
                      ? `?branchCode=${branchCode}`
                      : isSuperAdmin && branchId
                      ? `?branchId=${branchId}`
                      : "";
                    const res = await fetch(
                      `/api/packages/${pkg.id}${query}`,
                      { credentials: "include" },
                    );
                    if (res.ok) {
                      const fullPkg: Package = await res.json();
                      queryClient.setQueryData(
                        ["/api/packages", branchCode, branchId, pkg.id],
                        fullPkg,
                      );
                      setEditingPackage(fullPkg);
                      setIsFormOpen(true);
                    }
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(pkg.id)}
                >
                  Delete
                </Button>
                <Button size="sm" onClick={() => setSelectedPackage(pkg)}>
                  Assign to Customer
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (!expanded[pkg.id]) {
                      const query = branchCode
                        ? `?branchCode=${branchCode}`
                        : isSuperAdmin && branchId
                        ? `?branchId=${branchId}`
                        : "";
                      const res = await fetch(
                        `/api/packages/${pkg.id}${query}`,
                        { credentials: "include" },
                      );
                      if (res.ok) {
                        const fullPkg: Package = await res.json();
                        queryClient.setQueryData(
                          ["/api/packages", branchCode, branchId, pkg.id],
                          fullPkg,
                        );
                      }
                    }
                    setExpanded((prev) => ({
                      ...prev,
                      [pkg.id]: !prev[pkg.id],
                    }));
                  }}
                >
                  {expanded[pkg.id] ? "Hide Items" : "View Items"}
                </Button>
              </div>
            </div>

            {pkg.descriptionEn && (
              <p className="text-sm text-gray-600">{pkg.descriptionEn}</p>
            )}

            {pkg.packageItems && pkg.packageItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pkg.packageItems.map((item, idx) => (
                  <Badge key={idx} variant="secondary">
                    {getItemName(item)}
                  </Badge>
                ))}
              </div>
            )}

            <ul className="text-xs text-gray-600 list-disc list-inside">
              {pkg.maxItems != null && <li>Max Items: {pkg.maxItems}</li>}
              {pkg.expiryDays != null && (
                <li>Expiry: {pkg.expiryDays} days</li>
              )}
              {pkg.bonusCredits != null && (
                <li>Bonus Credits: {pkg.bonusCredits}</li>
              )}
            </ul>
            {expanded[pkg.id] && (() => {
              const full =
                queryClient.getQueryData<Package>([
                  "/api/packages",
                  branchCode,
                  branchId,
                  pkg.id,
                ]) || pkg;
              return full.packageItems && full.packageItems.length > 0 ? (
                <ul className="mt-2 text-sm text-gray-700 list-disc list-inside space-y-1">
                  {full.packageItems.map((item, idx) => (
                    <li key={idx}>
                      {getItemName(item)} – {item.credits} credits
                    </li>
                  ))}
                </ul>
              ) : null;
            })()}
          </div>
        ))}
      </div>

      <Dialog
        open={!!selectedPackage}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedPackage(null);
            setSelectedCustomer(null);
            setStartsAt("");
            setExpiresAt("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Package</DialogTitle>
            <DialogDescription>
              Select a customer to assign the chosen package
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 border rounded">
                <div>
                  <p className="font-medium">{selectedCustomer.name}</p>
                  <p className="text-sm text-gray-500">
                    {selectedCustomer.phoneNumber}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCustomer(null)}
                >
                  Change
                </Button>
              </div>
            ) : (
              <CustomerDialog onSelectCustomer={setSelectedCustomer} />
            )}
            <div className="space-y-2">
              <Label>Valid From</Label>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Valid Until</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPackage(null);
                setSelectedCustomer(null);
                setStartsAt("");
                setExpiresAt("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => assignMutation.mutate()}
              disabled={assignMutation.isPending || !selectedCustomer}
            >
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isFormOpen}
        onOpenChange={(o) => {
          if (!o) {
            setIsFormOpen(false);
            setEditingPackage(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? "Edit Package" : "Add Package"}
            </DialogTitle>
            <DialogDescription>
              {editingPackage ? "Update package details" : "Create a new package"}
            </DialogDescription>
          </DialogHeader>
          <PackageForm
            pkg={editingPackage}
            branchId={branchId}
            branchCode={branchCode}
            onClose={() => {
              setIsFormOpen(false);
              setEditingPackage(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PackageList() {
  return (
    <ErrorBoundary fallback={<div>Unable to load packages.</div>}>
      <PackageListInner />
    </ErrorBoundary>
  );
}

export default PackageList;
