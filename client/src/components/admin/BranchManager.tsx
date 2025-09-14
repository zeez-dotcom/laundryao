import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2 } from "lucide-react";
import type { Branch, InsertBranch } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { getCities } from "@/lib/cities";
import type { City } from "@shared/schema";
import { useAuthContext } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import LoadingScreen from "@/components/common/LoadingScreen";

export function BranchManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState<InsertBranch>({
    name: "",
    address: "",
    phone: "",
    tagline: "",
    code: "",
    logoUrl: "",
    addressInputMode: "mapbox",
    deliveryEnabled: true,
  });
  const [codeError, setCodeError] = useState("");
  const [deliveryCities, setDeliveryCities] = useState<string[]>([]);
  const [allCities, setAllCities] = useState(false);
  const [cityOptions, setCityOptions] = useState<City[]>([]);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuthContext();
  const { t } = useTranslation();

  useEffect(() => {
    getCities()
      .then(setCityOptions)
      .catch(() => {});
  }, []);

  const { data: branches = [], isLoading } = useQuery<(Branch & { serviceCityIds?: string[] })[]>({
    queryKey: ["/api/branches"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertBranch & { deliveryCities: string[] }) => {
      const { deliveryCities: cities, ...rest } = data;
      const response = await apiRequest("POST", "/api/branches", rest);
      const branch = await response.json();
      await apiRequest("PUT", `/api/admin/branches/${branch.id}/service-cities`, {
        cityIds: cities,
      });
      return branch;
    },
    onSuccess: () => {
      toast({ title: "Branch created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error creating branch",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertBranch> & { deliveryCities: string[] } }) => {
      const { deliveryCities: cities, ...rest } = data;
      const response = await apiRequest("PUT", `/api/branches/${id}`, rest);
      const branch = await response.json();
      await apiRequest("PUT", `/api/admin/branches/${id}/service-cities`, {
        cityIds: cities,
      });
      return branch;
    },
    onSuccess: () => {
      toast({ title: "Branch updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error updating branch",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/branches/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Branch deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/branches"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting branch",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      phone: "",
      tagline: "",
      code: "",
      logoUrl: "",
      addressInputMode: "mapbox",
      deliveryEnabled: true,
    });
    setDeliveryCities([]);
    setAllCities(false);
    setEditingBranch(null);
    setIsDialogOpen(false);
    setCodeError("");
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      address: branch.address || "",
      phone: branch.phone || "",
      tagline: branch.tagline || "",
      code: branch.code,
      logoUrl: branch.logoUrl || "",
      addressInputMode:
        (branch.addressInputMode as InsertBranch["addressInputMode"]) || "mapbox",
      deliveryEnabled: branch.deliveryEnabled ?? true,
    });
    const cities = (branch as any).serviceCityIds || [];
    setDeliveryCities(cities);
    setAllCities(cities.length === 0);
    setCodeError("");
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allCities && deliveryCities.length === 0) {
      toast({
        title: "Select at least one city or choose all cities",
        variant: "destructive",
      });
      return;
    }
    const base = allCities ? [] : deliveryCities;
    if (editingBranch) {
      const updates: Partial<InsertBranch> = {};
      (Object.keys(formData) as (keyof InsertBranch)[]).forEach((key) => {
        const newValue = formData[key];
        const oldValue = (editingBranch as any)[key] ?? (typeof newValue === "string" ? "" : undefined);
        if (newValue !== oldValue) {
          updates[key] = newValue as any;
        }
      });
      updateMutation.mutate({ id: editingBranch.id, data: { ...updates, deliveryCities: base } });
    } else {
      const payload = { ...formData, deliveryCities: base };
      createMutation.mutate(payload);
    }
  };

    if (isLoading) {
      return <LoadingScreen message={t.loading} />;
    }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setIsDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Branch
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar sm:w-full">
            <DialogHeader>
              <DialogTitle>{editingBranch ? "Edit Branch" : "Add Branch"}</DialogTitle>
              <DialogDescription>
                {editingBranch ? "Modify branch details" : "Create a new branch"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="col-span-3"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="code" className="text-right">
                    Code
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => {
                        const value = e.target.value.toUpperCase();
                        setFormData({ ...formData, code: value });
                        const regex = /^[A-Za-z]{2,3}$/;
                        setCodeError(value === "" || regex.test(value) ? "" : "Code must be 2-3 letters.");
                      }}
                      pattern="[A-Za-z]{2,3}"
                      title="Use 2-3 letters only"
                      className="w-full"
                      maxLength={3}
                      required
                    />
                    {codeError && (
                      <p className="text-sm text-red-500">{codeError}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Address Input</Label>
                  <RadioGroup
                    className="col-span-3 flex space-x-4"
                    value={formData.addressInputMode}
                    onValueChange={(value) =>
                      setFormData({ ...formData, addressInputMode: value as InsertBranch["addressInputMode"] })
                    }
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mapbox" id="mode-mapbox" />
                      <Label htmlFor="mode-mapbox">Mapbox</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="manual" id="mode-manual" />
                      <Label htmlFor="mode-manual">Manual</Label>
                    </div>
                  </RadioGroup>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="address" className="text-right">
                    Address
                  </Label>
                  <Input
                    id="address"
                    value={formData.address || ""}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="phone" className="text-right">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    value={formData.phone || ""}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tagline" className="text-right">
                    Tagline
                  </Label>
                  <Input
                    id="tagline"
                    value={formData.tagline || ""}
                    onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="cities" className="text-right">
                    Cities
                  </Label>
                  <div className="col-span-3 space-y-2">
                    <select
                      id="cities"
                      multiple
                      disabled={allCities}
                      value={deliveryCities}
                      onChange={(e) =>
                        setDeliveryCities(
                          Array.from(e.target.selectedOptions).map((o) => o.value),
                        )
                      }
                      className="w-full h-32 border rounded p-2"
                    >
                      {cityOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nameEn}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="allCities"
                        checked={allCities}
                        onCheckedChange={(checked) =>
                          setAllCities(Boolean(checked))
                        }
                      />
                      <Label htmlFor="allCities">All Cities</Label>
                    </div>
                  </div>
                </div>
                {isAdmin && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="deliveryEnabled" className="text-right">
                      Delivery
                    </Label>
                    <div className="col-span-3">
                      <Switch
                        id="deliveryEnabled"
                        checked={formData.deliveryEnabled}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, deliveryEnabled: checked })
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="logoUrl" className="text-right">
                    Logo URL
                  </Label>
                  <Input
                    id="logoUrl"
                    type="url"
                    value={formData.logoUrl || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, logoUrl: e.target.value })
                    }
                    className="col-span-3"
                    placeholder="https://example.com/logo.png"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingBranch ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Branches</CardTitle>
          <CardDescription>Manage store locations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {branch.logoUrl && (
                    <img
                      src={branch.logoUrl}
                      alt={`${branch.name} logo`}
                      className="w-10 h-10 object-cover rounded"
                    />
                  )}
                  <div className="flex flex-col">
                    <span className="font-medium">{branch.name} ({branch.code})</span>
                    {branch.address && (
                      <span className="text-sm text-gray-500">{branch.address}</span>
                    )}
                    {branch.phone && (
                      <span className="text-sm text-gray-500">{branch.phone}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(branch)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(branch.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {branches.length === 0 && (
              <p className="text-gray-500 text-center py-4">No branches found</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

