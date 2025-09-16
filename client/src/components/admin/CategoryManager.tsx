import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Package, Save } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { Category, InsertCategory } from "@shared/schema";
import { useTranslation } from "@/lib/i18n";
import LoadingScreen from "@/components/common/LoadingScreen";
import EmptyState from "@/components/common/EmptyState";

function CategoryManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState<InsertCategory>({
    name: "",
    nameAr: "",
    type: "clothing",
    description: "",
    descriptionAr: "",
    isActive: true,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const getIconComponent = (name?: string) => {
    if (!name) return (LucideIcons as any).Package;
    // Normalize to PascalCase expected by lucide-react (e.g., "shopping-cart" -> "ShoppingCart")
    const pascal = name
      .replace(/[-_ ]+(.)/g, (_, c) => (c || "").toUpperCase())
      .replace(/^(.)/, (m) => m.toUpperCase());
    return (LucideIcons as any)[pascal] || (LucideIcons as any).Package;
  };
  const [iconSearch, setIconSearch] = useState("");
  const filteredIcons = Object.keys(LucideIcons)
    .filter((k) => /^[A-Z]/.test(k))
    .filter((k) => k.toLowerCase().includes(iconSearch.toLowerCase()));

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const [itemSearch, setItemSearch] = useState("");
  const [svcSearch, setSvcSearch] = useState("");
  const [itemPage, setItemPage] = useState(1);
  const [svcPage, setSvcPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // Use "all" sentinel instead of empty string to satisfy Radix Select
  const [filterClothingCategory, setFilterClothingCategory] = useState<string>("all");
  const [filterServiceCategory, setFilterServiceCategory] = useState<string>("all");

  const { data: clothingItemsResp } = useQuery<{ items: any[]; total: number }>({
    queryKey: [
      `/api/clothing-items?search=${encodeURIComponent(itemSearch)}${filterClothingCategory === "all" ? "" : `&categoryId=${filterClothingCategory}`}&limit=${pageSize}&offset=${(itemPage-1)*pageSize}`,
    ],
    queryFn: async ({ queryKey }) => {
      const path = queryKey[0] as string;
      const res = await apiRequest("GET", path);
      const total = parseInt(res.headers.get("X-Total-Count") || "0", 10);
      const items = await res.json();
      return { items, total };
    }
  });
  const clothingItems = clothingItemsResp?.items || [];
  const clothingTotal = clothingItemsResp?.total || 0;

  const { data: servicesResp } = useQuery<{ items: any[]; total: number }>({
    queryKey: [
      `/api/laundry-services?search=${encodeURIComponent(svcSearch)}${filterServiceCategory === "all" ? "" : `&categoryId=${filterServiceCategory}`}&limit=${pageSize}&offset=${(svcPage-1)*pageSize}`,
    ],
    queryFn: async ({ queryKey }) => {
      const path = queryKey[0] as string;
      const res = await apiRequest("GET", path);
      const total = parseInt(res.headers.get("X-Total-Count") || "0", 10);
      const items = await res.json();
      return { items, total };
    }
  });
  const services = servicesResp?.items || [];
  const servicesTotal = servicesResp?.total || 0;

  // Bulk assign selections
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set());
  const allItemsSelected = clothingItems.length > 0 && clothingItems.every((i) => selectedItemIds.has(i.id));
  const allServicesSelected = services.length > 0 && services.every((s) => selectedServiceIds.has(s.id));
  const [assignClothingCategoryId, setAssignClothingCategoryId] = useState<string>("");
  const [assignServiceCategoryId, setAssignServiceCategoryId] = useState<string>("");

  const bulkAssignItems = async () => {
    if (!assignClothingCategoryId || selectedItemIds.size === 0) return;
    const ids = Array.from(selectedItemIds);
    for (const id of ids) {
      await updateClothingCategory.mutateAsync({ id, categoryId: assignClothingCategoryId });
    }
    setSelectedItemIds(new Set());
    toast({ title: "Assigned category to selected items" });
  };
  const bulkAssignServices = async () => {
    if (!assignServiceCategoryId || selectedServiceIds.size === 0) return;
    const ids = Array.from(selectedServiceIds);
    for (const id of ids) {
      await updateServiceCategory.mutateAsync({ id, categoryId: assignServiceCategoryId });
    }
    setSelectedServiceIds(new Set());
    toast({ title: "Assigned category to selected services" });
  };

  const updateClothingCategory = useMutation({
    mutationFn: async ({ id, categoryId }: { id: string; categoryId: string }) => {
      const res = await apiRequest("PUT", `/api/clothing-items/${id}`, { categoryId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clothing-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Clothing item updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const updateServiceCategory = useMutation({
    mutationFn: async ({ id, categoryId }: { id: string; categoryId: string }) => {
      const res = await apiRequest("PUT", `/api/laundry-services/${id}`, { categoryId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/laundry-services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Service updated" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCategory) => {
      const response = await apiRequest("POST", "/api/categories", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: t.categoryCreated });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      resetForm();
    },
    onError: (error) => {
      toast({
        title: t.errorCreatingCategory,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertCategory }) => {
      const response = await apiRequest("PUT", `/api/categories/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: t.categoryUpdated });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      resetForm();
    },
    onError: (error) => {
      toast({
        title: t.errorUpdatingCategory,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/categories/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: t.categoryDeleted });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
    onError: (error) => {
      toast({
        title: t.errorDeletingCategory,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      nameAr: "",
      type: "clothing",
      description: "",
      descriptionAr: "",
      color: "",
      icon: "",
      isActive: true,
    });
    setEditingCategory(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      nameAr: (category as any).nameAr || "",
      type: category.type,
      description: category.description || "",
      descriptionAr: (category as any).descriptionAr || "",
      color: (category as any).color || "",
      icon: (category as any).icon || "",
      isActive: category.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const clothingCategories = categories.filter(cat => cat.type === 'clothing');
  const serviceCategories = categories.filter(cat => cat.type === 'service');

  if (isLoading) {
    return <LoadingScreen message={t.loadingCategories} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t.categoryManagement}</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingCategory(null)}>
              <Plus className="w-4 h-4 mr-2" />
              {t.add} {t.category}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? `${t.edit} ${t.category}` : `${t.add} ${t.category}`}
              </DialogTitle>
              <DialogDescription>
                {editingCategory ? `Update ${t.category.toLowerCase()} details` : `Create a new ${t.category.toLowerCase()}`}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                {t.name}
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
                <Label htmlFor="nameAr" className="text-right">
                  {t.name} (Arabic)
                </Label>
                <Input
                  id="nameAr"
                  dir="rtl"
                  value={formData.nameAr || ""}
                  onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="type" className="text-right">
                  {t.type}
                </Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={t.type} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clothing">{t.clothing}</SelectItem>
                      <SelectItem value="service">{t.service}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">
                  {t.description}
                </Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="col-span-3"
                  placeholder={t.optionalDescription}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Color</Label>
                <div className="col-span-3 flex gap-2 items-center">
                  <Input type="color" value={(formData as any).color || "#888888"} onChange={(e) => setFormData({ ...formData, color: e.target.value as any })} className="w-16 h-10" />
                  <Input placeholder="#RRGGBB" value={(formData as any).color || ""} onChange={(e) => setFormData({ ...formData, color: e.target.value as any })} />
                </div>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right">Icon</Label>
                <div className="col-span-3 space-y-2">
                  <Input placeholder="Search Lucide icons (e.g. shirt)" onChange={(e) => setIconSearch(e.target.value)} />
                  <div className="grid grid-cols-8 gap-2 max-h-40 overflow-auto border rounded p-2">
                    {filteredIcons.slice(0, 128).map((name) => {
                      const Icon = getIconComponent(name);
                      const active = (formData as any).icon === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          title={name}
                          onClick={() => setFormData({ ...formData, icon: name as any })}
                          className={`h-9 w-9 rounded border flex items-center justify-center ${active ? 'bg-primary text-white' : 'hover:bg-muted'}`}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="descriptionAr" className="text-right">
                  {t.description} (Arabic)
                </Label>
                <Textarea
                  id="descriptionAr"
                  dir="rtl"
                  value={formData.descriptionAr || ""}
                  onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value })}
                  className="col-span-3"
                  placeholder={t.optionalDescription}
                />
              </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingCategory ? t.update : t.create}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t.clothingCategories}</CardTitle>
            <CardDescription>{t.categoriesForClothingItems}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {clothingCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded" style={{ backgroundColor: (category as any).color || '#999' }}>
                        {(() => { const Icon = getIconComponent((category as any).icon); return <Icon className="w-3 h-3 text-white" />; })()}
                      </span>
                      <span className="font-medium">{category.name}</span>
                      <Badge variant={category.isActive ? "default" : "secondary"}>
                        {category.isActive ? t.active : t.inactive}
                      </Badge>
                    </div>
                    {(category as any).nameAr && (
                      <div className="text-sm text-gray-700 text-right" dir="rtl">
                        {(category as any).nameAr}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(category)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(category.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {clothingCategories.length === 0 && (
                <EmptyState
                  icon={<Package className="h-8 w-8 text-gray-400" />}
                  title={t.noClothingCategoriesFound}
                  className="py-4"
                  titleClassName="text-sm text-gray-500"
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.serviceCategories}</CardTitle>
            <CardDescription>{t.categoriesForLaundryServices}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {serviceCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded" style={{ backgroundColor: (category as any).color || '#999' }}>
                        {(() => { const Icon = getIconComponent((category as any).icon); return <Icon className="w-3 h-3 text-white" />; })()}
                      </span>
                      <span className="font-medium">{category.name}</span>
                      <Badge variant={category.isActive ? "default" : "secondary"}>
                        {category.isActive ? t.active : t.inactive}
                      </Badge>
                    </div>
                    {(category as any).nameAr && (
                      <div className="text-sm text-gray-700 text-right" dir="rtl">
                        {(category as any).nameAr}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(category)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(category.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {serviceCategories.length === 0 && (
                <EmptyState
                  icon={<Package className="h-8 w-8 text-gray-400" />}
                  title={t.noServiceCategoriesFound}
                  className="py-4"
                  titleClassName="text-sm text-gray-500"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignment Section */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Clothing Items</CardTitle>
            <CardDescription>Assign categories to clothing items</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Input placeholder="Search items" value={itemSearch} onChange={(e) => { setItemSearch(e.target.value); setItemPage(1); }} />
              <Select value={filterClothingCategory} onValueChange={(v) => { setFilterClothingCategory(v); setItemPage(1); }}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Filter by category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categories.filter(c => c.type === "clothing").map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input type="checkbox" aria-label="select all" checked={allItemsSelected} onChange={(e) => {
                    if (e.target.checked) setSelectedItemIds(new Set(clothingItems.map(i => i.id)));
                    else setSelectedItemIds(new Set());
                  }} />
                  <span className="text-sm">Select all on page</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={assignClothingCategoryId} onValueChange={setAssignClothingCategoryId}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Assign to category" /></SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.type === "clothing").map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={bulkAssignItems} disabled={!assignClothingCategoryId || selectedItemIds.size === 0}>Assign</Button>
                </div>
              </div>
              {clothingItems.map((item) => {
                const cat = categories.find(c => c.id === item.categoryId);
                const CatIcon = getIconComponent((cat as any)?.icon);
                const bg = (cat as any)?.color || '#999';
                return (
                <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="truncate pr-2">
                    <div className="flex items-center gap-2 font-medium truncate max-w-[260px]">
                      <input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={(e) => {
                        setSelectedItemIds(prev => { const next = new Set(prev); if (e.target.checked) next.add(item.id); else next.delete(item.id); return next; });
                      }} />
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded" style={{ backgroundColor: bg }}>
                        <CatIcon className="w-3 h-3 text-white" />
                      </span>
                      <span className="truncate">{item.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={item.categoryId || ""} onValueChange={(value) => updateClothingCategory.mutate({ id: item.id, categoryId: value })}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => c.type === "clothing").map((c) => {
                          const Icon = getIconComponent((c as any).icon);
                          const color = (c as any).color || '#999';
                          return (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-4 h-4 rounded" style={{ backgroundColor: color }}>
                                  <Icon className="w-3 h-3 text-white" />
                                </span>
                                {c.name}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );})}
              {clothingItems.length === 0 && (
                <EmptyState title="No clothing items" className="py-4" icon={<Package className="h-8 w-8 text-gray-400" />} />
              )}
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">{clothingTotal} items</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setItemPage((p) => Math.max(1, p - 1))} disabled={itemPage <= 1}>Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setItemPage((p) => p + 1)} disabled={itemPage * pageSize >= clothingTotal}>Next</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Laundry Services</CardTitle>
            <CardDescription>Assign categories to laundry services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <Input placeholder="Search services" value={svcSearch} onChange={(e) => { setSvcSearch(e.target.value); setSvcPage(1); }} />
              <Select value={filterServiceCategory} onValueChange={(v) => { setFilterServiceCategory(v); setSvcPage(1); }}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Filter by category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categories.filter(c => c.type === "service").map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input type="checkbox" aria-label="select all" checked={allServicesSelected} onChange={(e) => {
                    if (e.target.checked) setSelectedServiceIds(new Set(services.map(s => s.id)));
                    else setSelectedServiceIds(new Set());
                  }} />
                  <span className="text-sm">Select all on page</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={assignServiceCategoryId} onValueChange={setAssignServiceCategoryId}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Assign to category" /></SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.type === "service").map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={bulkAssignServices} disabled={!assignServiceCategoryId || selectedServiceIds.size === 0}>Assign</Button>
                </div>
              </div>
              {services.map((svc) => {
                const cat = categories.find(c => c.id === svc.categoryId);
                const CatIcon = getIconComponent((cat as any)?.icon);
                const bg = (cat as any)?.color || '#999';
                return (
                <div key={svc.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="truncate pr-2">
                    <div className="flex items-center gap-2 font-medium truncate max-w-[260px]">
                      <input type="checkbox" checked={selectedServiceIds.has(svc.id)} onChange={(e) => {
                        setSelectedServiceIds(prev => { const next = new Set(prev); if (e.target.checked) next.add(svc.id); else next.delete(svc.id); return next; });
                      }} />
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded" style={{ backgroundColor: bg }}>
                        <CatIcon className="w-3 h-3 text-white" />
                      </span>
                      <span className="truncate">{svc.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={svc.categoryId || ""} onValueChange={(value) => updateServiceCategory.mutate({ id: svc.id, categoryId: value })}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => c.type === "service").map((c) => {
                          const Icon = getIconComponent((c as any).icon);
                          const color = (c as any).color || '#999';
                          return (
                            <SelectItem key={c.id} value={c.id}>
                              <span className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-4 h-4 rounded" style={{ backgroundColor: color }}>
                                  <Icon className="w-3 h-3 text-white" />
                                </span>
                                {c.name}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );})}
              {services.length === 0 && (
                <EmptyState title="No services" className="py-4" icon={<Package className="h-8 w-8 text-gray-400" />} />
              )}
              <div className="flex justify-between items-center">
                <div className="text-sm text-muted-foreground">{servicesTotal} services</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSvcPage((p) => Math.max(1, p - 1))} disabled={svcPage <= 1}>Prev</Button>
                  <Button variant="outline" size="sm" onClick={() => setSvcPage((p) => p + 1)} disabled={svcPage * pageSize >= servicesTotal}>Next</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default CategoryManager;
