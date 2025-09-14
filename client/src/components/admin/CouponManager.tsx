import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuthContext } from "@/context/AuthContext";
// import { useCurrency } from "@/hooks/use-currency";
import { useTranslation } from "@/lib/i18n";
import { Plus, Edit, Trash2, Copy, Percent, DollarSign, Package, Shirt } from "lucide-react";
import type { insertCouponSchema } from "@shared/schema";
import { z } from "zod";

type Coupon = {
  id: string;
  code: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minimumAmount?: string;
  maximumDiscount?: string;
  usageLimit?: number;
  usedCount: number;
  validFrom: string;
  validUntil?: string;
  isActive: boolean;
  applicationType: "whole_cart" | "specific_items" | "specific_services";
  branchId: string;
  createdAt: string;
  updatedAt: string;
  clothingItems?: string[];
  services?: string[];
};

type ClothingItem = {
  id: string;
  nameEn: string;
  nameAr?: string;
};

type LaundryService = {
  id: string;
  nameEn: string;
  nameAr?: string;
  price: string;
};

type CouponFormData = z.infer<typeof insertCouponSchema> & {
  clothingItemIds?: string[];
  serviceIds?: string[];
};

export function CouponManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [itemSearchFilter, setItemSearchFilter] = useState("");
  const [serviceSearchFilter, setServiceSearchFilter] = useState("");
  const [formData, setFormData] = useState<CouponFormData>({
    code: "",
    nameEn: "",
    nameAr: "",
    descriptionEn: "",
    descriptionAr: "",
    discountType: "percentage",
    discountValue: "10",
    minimumAmount: "",
    maximumDiscount: "",
    usageLimit: undefined,
    validFrom: new Date(),
    validUntil: undefined,
    isActive: true,
    applicationType: "whole_cart",
    clothingItemIds: [],
    serviceIds: [],
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin, branch } = useAuthContext();
  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const { t } = useTranslation();

  const { data: coupons = [], isLoading } = useQuery<Coupon[]>({
    queryKey: ["/api/coupons"],
    enabled: isAdmin,
  });

  const { data: clothingItems = [] } = useQuery<ClothingItem[]>({
    queryKey: ["/api/clothing-items"],
    enabled: isAdmin,
  });

  const { data: laundryServices = [] } = useQuery<LaundryService[]>({
    queryKey: ["/api/laundry-services"],
    enabled: isAdmin,
  });

  // Filter clothing items based on search
  const filteredClothingItems = clothingItems.filter((item) =>
    item.nameEn?.toLowerCase().includes(itemSearchFilter.toLowerCase()) ||
    item.nameAr?.toLowerCase().includes(itemSearchFilter.toLowerCase())
  );

  // Filter services based on search
  const filteredLaundryServices = laundryServices.filter((service) =>
    service.nameEn?.toLowerCase().includes(serviceSearchFilter.toLowerCase()) ||
    service.nameAr?.toLowerCase().includes(serviceSearchFilter.toLowerCase())
  );

  const createMutation = useMutation({
    mutationFn: async (data: CouponFormData) => {
      const response = await apiRequest("POST", "/api/coupons", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Coupon created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error creating coupon",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CouponFormData> }) => {
      const response = await apiRequest("PUT", `/api/coupons/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Coupon updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error updating coupon",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/coupons/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Coupon deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting coupon",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      nameEn: "",
      nameAr: "",
      descriptionEn: "",
      descriptionAr: "",
      discountType: "percentage",
      discountValue: "10",
      minimumAmount: "",
      maximumDiscount: "",
      usageLimit: undefined,
      validFrom: new Date(),
      validUntil: undefined,
      isActive: true,
      applicationType: "whole_cart",
      clothingItemIds: [],
      serviceIds: [],
    });
    setEditingCoupon(null);
    setIsDialogOpen(false);
    setItemSearchFilter("");
    setServiceSearchFilter("");
  };

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      nameEn: coupon.nameEn,
      nameAr: coupon.nameAr || "",
      descriptionEn: coupon.descriptionEn || "",
      descriptionAr: coupon.descriptionAr || "",
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minimumAmount: coupon.minimumAmount || "",
      maximumDiscount: coupon.maximumDiscount || "",
      usageLimit: coupon.usageLimit,
      validFrom: new Date(coupon.validFrom),
      validUntil: coupon.validUntil ? new Date(coupon.validUntil) : undefined,
      isActive: coupon.isActive,
      applicationType: coupon.applicationType || "whole_cart",
      clothingItemIds: coupon.clothingItems || [],
      serviceIds: coupon.services || [],
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCoupon) {
      updateMutation.mutate({ id: editingCoupon.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Coupon code copied to clipboard" });
  };

  const generateCode = () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    setFormData({ ...formData, code });
  };

  if (!isAdmin) {
    return <div>Access denied</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Coupon Management</h2>
          <p className="text-muted-foreground">Create and manage discount coupons for your branch</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingCoupon(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Coupon
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar sm:w-full">
            <DialogHeader>
              <DialogTitle>{editingCoupon ? "Edit Coupon" : "Create New Coupon"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="code">Coupon Code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      placeholder="SAVE20"
                      required
                    />
                    <Button type="button" variant="outline" onClick={generateCode}>
                      Generate
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="nameEn">Name (English)</Label>
                  <Input
                    id="nameEn"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    placeholder="Save 20% on all items"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nameAr">Name (Arabic)</Label>
                  <Input
                    id="nameAr"
                    value={formData.nameAr || ""}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    placeholder="وفر 20% على جميع الخدمات"
                  />
                </div>
                <div>
                  <Label htmlFor="discountType">Discount Type</Label>
                  <Select value={formData.discountType} onValueChange={(value: "percentage" | "fixed") => setFormData({ ...formData, discountType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="applicationType">Application Type</Label>
                  <Select value={formData.applicationType} onValueChange={(value: "whole_cart" | "specific_items" | "specific_services") => setFormData({ ...formData, applicationType: value, clothingItemIds: [], serviceIds: [] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whole_cart">Whole Cart</SelectItem>
                      <SelectItem value="specific_items">Specific Clothing Items</SelectItem>
                      <SelectItem value="specific_services">Specific Services</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="discountValue">
                    Discount {formData.discountType === "percentage" ? "%" : "Amount"}
                  </Label>
                  <Input
                    id="discountValue"
                    type="number"
                    step="0.01"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder={formData.discountType === "percentage" ? "20" : "5.00"}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="minimumAmount">Minimum Amount</Label>
                  <Input
                    id="minimumAmount"
                    type="number"
                    step="0.01"
                    value={formData.minimumAmount || ""}
                    onChange={(e) => setFormData({ ...formData, minimumAmount: e.target.value })}
                    placeholder="50.00"
                  />
                </div>
                <div>
                  <Label htmlFor="maximumDiscount">Maximum Discount</Label>
                  <Input
                    id="maximumDiscount"
                    type="number"
                    step="0.01"
                    value={formData.maximumDiscount || ""}
                    onChange={(e) => setFormData({ ...formData, maximumDiscount: e.target.value })}
                    placeholder="100.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="usageLimit">Usage Limit</Label>
                  <Input
                    id="usageLimit"
                    type="number"
                    value={formData.usageLimit || ""}
                    onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value ? parseInt(e.target.value) : undefined })}
                    placeholder="100"
                  />
                </div>
                <div>
                  <Label htmlFor="validFrom">Valid From</Label>
                  <Input
                    id="validFrom"
                    type="datetime-local"
                    value={formData.validFrom ? formData.validFrom.toISOString().slice(0, 16) : ""}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value ? new Date(e.target.value) : new Date() })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="validUntil">Valid Until</Label>
                  <Input
                    id="validUntil"
                    type="datetime-local"
                    value={formData.validUntil ? formData.validUntil.toISOString().slice(0, 16) : ""}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value ? new Date(e.target.value) : undefined })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="descriptionEn">Description (English)</Label>
                <Textarea
                  id="descriptionEn"
                  value={formData.descriptionEn || ""}
                  onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value })}
                  placeholder="Get 20% off on all laundry services. Valid until end of month."
                />
              </div>

              <div>
                <Label htmlFor="descriptionAr">Description (Arabic)</Label>
                <Textarea
                  id="descriptionAr"
                  value={formData.descriptionAr || ""}
                  onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                  placeholder="احصل على خصم 20% على جميع خدمات الغسيل"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>

              {/* Clothing Items Selection */}
              {formData.applicationType === "specific_items" && (
                <div className="space-y-3">
                  <Label>Select Clothing Items</Label>
                  <div className="space-y-2">
                    <Input
                      placeholder="Search clothing items..."
                      value={itemSearchFilter}
                      onChange={(e) => setItemSearchFilter(e.target.value)}
                      className="w-full"
                    />
                    <div className="border rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                      {filteredClothingItems.map((item: any) => (
                        <div key={item.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`item-${item.id}`}
                            checked={formData.clothingItemIds?.includes(item.id) || false}
                            onCheckedChange={(checked) => {
                              const current = formData.clothingItemIds || [];
                              const updated = checked 
                                ? [...current, item.id]
                                : current.filter(id => id !== item.id);
                              setFormData({ ...formData, clothingItemIds: updated });
                            }}
                          />
                          <Label htmlFor={`item-${item.id}`} className="text-sm">
                            <div className="flex items-center gap-2">
                              <Shirt className="w-4 h-4" />
                              {item.nameEn} {item.nameAr && `(${item.nameAr})`}
                            </div>
                          </Label>
                        </div>
                      ))}
                      {filteredClothingItems.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No clothing items found matching "{itemSearchFilter}"
                        </p>
                      )}
                    </div>
                  </div>
                  {(!formData.clothingItemIds || formData.clothingItemIds.length === 0) && (
                    <p className="text-sm text-muted-foreground">Please select at least one clothing item</p>
                  )}
                </div>
              )}

              {/* Services Selection */}
              {formData.applicationType === "specific_services" && (
                <div className="space-y-3">
                  <Label>Select Services</Label>
                  <div className="space-y-2">
                    <Input
                      placeholder="Search services..."
                      value={serviceSearchFilter}
                      onChange={(e) => setServiceSearchFilter(e.target.value)}
                      className="w-full"
                    />
                    <div className="border rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                      {filteredLaundryServices.map((service: any) => (
                        <div key={service.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`service-${service.id}`}
                            checked={formData.serviceIds?.includes(service.id) || false}
                            onCheckedChange={(checked) => {
                              const current = formData.serviceIds || [];
                              const updated = checked 
                                ? [...current, service.id]
                                : current.filter(id => id !== service.id);
                              setFormData({ ...formData, serviceIds: updated });
                            }}
                          />
                          <Label htmlFor={`service-${service.id}`} className="text-sm">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4" />
                              {service.nameEn} {service.nameAr && `(${service.nameAr})`}
                              <span className="text-muted-foreground">- {formatCurrency(parseFloat(service.price || "0"))}</span>
                            </div>
                          </Label>
                        </div>
                      ))}
                      {filteredLaundryServices.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No services found matching "{serviceSearchFilter}"
                        </p>
                      )}
                    </div>
                  </div>
                  {(!formData.serviceIds || formData.serviceIds.length === 0) && (
                    <p className="text-sm text-muted-foreground">Please select at least one service</p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingCoupon ? "Update" : "Create"} Coupon
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">Loading coupons...</div>
            </CardContent>
          </Card>
        ) : coupons.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">
                <p className="text-muted-foreground">No coupons created yet</p>
                <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                  Create Your First Coupon
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Application</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                        {coupon.code}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(coupon.code)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{coupon.nameEn}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {coupon.discountType === "percentage" ? (
                        <Percent className="h-3 w-3" />
                      ) : (
                        <DollarSign className="h-3 w-3" />
                      )}
                      {coupon.discountType === "percentage"
                        ? `${coupon.discountValue}%`
                        : formatCurrency(parseFloat(coupon.discountValue))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="outline" className="text-xs">
                        {coupon.applicationType === "whole_cart" && "Whole Cart"}
                        {coupon.applicationType === "specific_items" && "Specific Items"}
                        {coupon.applicationType === "specific_services" && "Specific Services"}
                      </Badge>
                      {coupon.applicationType === "specific_items" && coupon.clothingItems && (
                        <div className="text-xs text-muted-foreground">
                          {coupon.clothingItems.length} item{coupon.clothingItems.length !== 1 ? 's' : ''}
                        </div>
                      )}
                      {coupon.applicationType === "specific_services" && coupon.services && (
                        <div className="text-xs text-muted-foreground">
                          {coupon.services.length} service{coupon.services.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {coupon.usedCount}
                    {coupon.usageLimit && ` / ${coupon.usageLimit}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={coupon.isActive ? "default" : "secondary"}>
                      {coupon.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {coupon.validUntil
                      ? new Date(coupon.validUntil).toLocaleDateString()
                      : "No expiry"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(coupon)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMutation.mutate(coupon.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}