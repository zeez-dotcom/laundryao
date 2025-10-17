import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ClothingItem,
  LaundryService,
  insertClothingItemSchema,
  insertItemServicePriceSchema,
} from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { Separator } from "@/components/ui/separator";

interface ClothingItemPayload {
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  categoryId: string;
  imageUrl?: string;
}

export function ClothingItemsSection() {
  const [addingClothing, setAddingClothing] = useState(false);
  const [editingClothing, setEditingClothing] = useState<ClothingItem | null>(
    null,
  );
  const [priceItemId, setPriceItemId] = useState<string | null>(null);
  const [clothingToDelete, setClothingToDelete] = useState<string | null>(null);
  const [clothingSearch, setClothingSearch] = useState("");

  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, branch } = useAuthContext();

  const needsBranchParam = user?.role === "super_admin";
  const branchIdParam = needsBranchParam ? branch?.id : undefined;

  const { data: clothingItems = [] } = useQuery<ClothingItem[]>({
    queryKey: [
      "/api/clothing-items",
      needsBranchParam ? branchIdParam ?? "missing-branch" : "implicit-branch",
    ],
    enabled: !needsBranchParam || Boolean(branchIdParam),
    queryFn: async () => {
      const url = needsBranchParam && branchIdParam
        ? `/api/clothing-items?branchId=${encodeURIComponent(branchIdParam)}`
        : "/api/clothing-items";
      const response = await apiRequest("GET", url);
      return response.json();
    },
  });

  const { data: services = [] } = useQuery<LaundryService[]>({
    queryKey: ["/api/laundry-services"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/laundry-services");
      return response.json();
    },
  });

  const clothingForm = useForm<ClothingItemPayload>({
    resolver: zodResolver(insertClothingItemSchema),
    defaultValues: {
      name: "",
      nameAr: "",
      description: "",
      descriptionAr: "",
      categoryId: "",
      imageUrl: "",
    },
  });

  const [imageInputMode, setImageInputMode] = useState<"upload" | "link">("link");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleImageUpload = async () => {
    try {
      if (!imageFile) return;
      const branchId = branch?.id;
      if (!branchId) {
        toast({ title: "Select a branch first", variant: "destructive" });
        return;
      }
      const form = new FormData();
      form.append("image", imageFile);
      const res = await fetch(`/api/branches/${branchId}/ads/upload-image`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to upload image");
      clothingForm.setValue("imageUrl", data.imageUrl);
      toast({ title: "Image uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
  };

  const priceForm = useForm<{
    clothingItemId: string;
    serviceId: string;
    price: string;
  }>({
    resolver: zodResolver(insertItemServicePriceSchema),
    defaultValues: { clothingItemId: "", serviceId: "", price: "" },
  });

  // When editing an item, fetch its mapped services with prices
  const { data: itemServices = [], refetch: refetchItemServices } = useQuery<
    (LaundryService & { itemPrice?: string })[]
  >({
    queryKey: [
      "/api/clothing-items",
      editingClothing?.id ?? "no-item",
      "services",
      needsBranchParam ? branchIdParam ?? "missing-branch" : "implicit-branch",
    ],
    enabled: Boolean(editingClothing?.id) && (!needsBranchParam || Boolean(branchIdParam)),
    queryFn: async () => {
      if (!editingClothing?.id) return [];
      const url = needsBranchParam && branchIdParam
        ? `/api/clothing-items/${editingClothing.id}/services?branchId=${encodeURIComponent(branchIdParam)}`
        : `/api/clothing-items/${editingClothing.id}/services`;
      const response = await apiRequest("GET", url);
      return response.json();
    },
  });

  const updatePriceMutation = useMutation({
    mutationFn: async (data: { clothingItemId: string; serviceId: string; price: string }) => {
      const payload = needsBranchParam && branchIdParam ? { ...data, branchId: branchIdParam } : data;
      const response = await apiRequest("PUT", "/api/item-service-prices", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-service-prices"] });
      refetchItemServices();
      toast({ title: "Price updated" });
    },
  });

  const deletePriceMutation = useMutation({
    mutationFn: async (data: { clothingItemId: string; serviceId: string }) => {
      const payload = needsBranchParam && branchIdParam ? { ...data, branchId: branchIdParam } : data;
      const response = await apiRequest("DELETE", "/api/item-service-prices", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-service-prices"] });
      refetchItemServices();
      toast({ title: "Mapping removed" });
    },
  });

  const createClothingMutation = useMutation({
    mutationFn: async (data: ClothingItemPayload) => {
      const response = await apiRequest("POST", "/api/clothing-items", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clothing-items"] });
      setAddingClothing(false);
      clothingForm.reset();
      toast({ title: t.clothingItemCreated });
    },
  });

  const updateClothingMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: ClothingItemPayload;
    }) => {
      const response = await apiRequest(
        "PUT",
        `/api/clothing-items/${id}`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clothing-items"] });
      setEditingClothing(null);
      clothingForm.reset();
      toast({ title: t.clothingItemUpdated });
    },
  });

  const deleteClothingMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/clothing-items/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clothing-items"] });
      toast({ title: t.clothingItemDeleted });
    },
  });

  const priceMutation = useMutation({
    mutationFn: async (data: {
      clothingItemId: string;
      serviceId: string;
      price: string;
    }) => {
      const payload = needsBranchParam && branchIdParam ? { ...data, branchId: branchIdParam } : data;
      const response = await apiRequest(
        "POST",
        "/api/item-service-prices",
        payload,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-service-prices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/laundry-services"] });
      setPriceItemId(null);
      priceForm.reset();
      toast({ title: "Price saved successfully" });
    },
  });

  const handleClothingSubmit = (data: ClothingItemPayload) => {
    if (editingClothing) {
      updateClothingMutation.mutate({ id: editingClothing.id, data });
    } else {
      createClothingMutation.mutate(data);
    }
  };

  const handleAddClothing = () => {
    setAddingClothing(true);
    setEditingClothing(null);
    clothingForm.reset({
      name: "",
      nameAr: "",
      description: "",
      descriptionAr: "",
      categoryId: "",
      imageUrl: "",
    });
  };

  const handleEditClothing = (item: ClothingItem) => {
    setEditingClothing(item);
    setAddingClothing(false);
    clothingForm.reset({
      name: item.name,
      nameAr: (item as any).nameAr || "",
      description: item.description || "",
      descriptionAr: (item as any).descriptionAr || "",
      categoryId: item.categoryId,
      imageUrl: item.imageUrl || "",
    });
  };

  const handleDeleteClothing = (id: string) => {
    setClothingToDelete(id);
  };

  const handlePriceSubmit = (data: {
    clothingItemId: string;
    serviceId: string;
    price: string;
  }) => {
    priceMutation.mutate(data);
  };

  const filteredClothing = clothingItems.filter((item: any) => {
    const term = clothingSearch.toLowerCase();
    return (
      item.name?.toLowerCase().includes(term) ||
      item.description?.toLowerCase?.().includes(term) ||
      item.nameAr?.toLowerCase?.().includes(term) ||
      item.descriptionAr?.toLowerCase?.().includes(term) ||
      item.categoryId?.toLowerCase().includes(term)
    );
  });

  return (
    <>
      {needsBranchParam && !branchIdParam && (
        <div className="mb-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Super admin: select a branch to view clothing items.
        </div>
      )}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">
          Clothing Items ({filteredClothing.length})
        </h2>
        <div className="flex items-center space-x-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search clothing"
              value={clothingSearch}
              onChange={(e) => setClothingSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button
            className="bg-pos-primary hover:bg-blue-700"
            onClick={handleAddClothing}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Clothing Item
          </Button>
        </div>
      </div>

      {addingClothing && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <Form {...clothingForm}>
              <form
                onSubmit={clothingForm.handleSubmit(handleClothingSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={clothingForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Pants, Shirt" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clothingForm.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (Arabic)</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: بنطال، قميص" dir="rtl" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clothingForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description..."
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clothingForm.control}
                  name="descriptionAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Arabic)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="وصف مختصر..." dir="rtl" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clothingForm.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pants">Pants</SelectItem>
                          <SelectItem value="shirts">Shirts</SelectItem>
                          <SelectItem value="traditional">
                            Traditional
                          </SelectItem>
                          <SelectItem value="dresses">Dresses</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                          <SelectItem value="linens">Linens</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={clothingForm.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Image</FormLabel>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <Button type="button" variant={imageInputMode === 'link' ? 'default' : 'outline'} size="sm" onClick={() => setImageInputMode('link')}>Paste Link</Button>
                          <Button type="button" variant={imageInputMode === 'upload' ? 'default' : 'outline'} size="sm" onClick={() => setImageInputMode('upload')}>Upload</Button>
                        </div>
                        {imageInputMode === 'link' ? (
                          <FormControl>
                            <Input placeholder="https://..." {...field} />
                          </FormControl>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                            <Button type="button" onClick={handleImageUpload}>Upload</Button>
                          </div>
                        )}
                        {field.value && (
                          <div className="text-xs text-muted-foreground break-all">{field.value}</div>
                        )}
                      </div>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAddingClothing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-pos-secondary hover:bg-green-600"
                  >
                    Create Item
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {filteredClothing.map((item) => (
          <Card key={item.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              {editingClothing?.id === item.id ? (
                <Form {...clothingForm}>
                  <form
                    onSubmit={clothingForm.handleSubmit(handleClothingSubmit)}
                    className="space-y-2"
                  >
                    <FormField
                      control={clothingForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={clothingForm.control}
                      name="nameAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name (Arabic)</FormLabel>
                          <FormControl>
                            <Input dir="rtl" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={clothingForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={clothingForm.control}
                      name="descriptionAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Arabic)</FormLabel>
                          <FormControl>
                            <Textarea dir="rtl" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={clothingForm.control}
                      name="imageUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Image</FormLabel>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                              <Button type="button" variant={imageInputMode === 'link' ? 'default' : 'outline'} size="sm" onClick={() => setImageInputMode('link')}>Paste Link</Button>
                              <Button type="button" variant={imageInputMode === 'upload' ? 'default' : 'outline'} size="sm" onClick={() => setImageInputMode('upload')}>Upload</Button>
                            </div>
                            {imageInputMode === 'link' ? (
                              <FormControl>
                                <Input placeholder="https://..." {...field} />
                              </FormControl>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                                <Button type="button" onClick={handleImageUpload}>Upload</Button>
                              </div>
                            )}
                            {field.value && (
                              <div className="text-xs text-muted-foreground break-all">{field.value}</div>
                            )}
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={clothingForm.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="pants">Pants</SelectItem>
                              <SelectItem value="shirts">Shirts</SelectItem>
                              <SelectItem value="traditional">
                                Traditional
                              </SelectItem>
                              <SelectItem value="dresses">Dresses</SelectItem>
                              <SelectItem value="formal">Formal</SelectItem>
                              <SelectItem value="linens">Linens</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={clothingForm.control}
                      name="imageUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Image URL (Optional)</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Separator className="my-3" />
                    <div>
                      <div className="text-sm font-medium mb-2">Services & Prices</div>
                      {itemServices.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No services mapped for this item. Add one below.</div>
                      ) : (
                        <div className="space-y-2">
                          {itemServices.map((svc) => (
                            <div key={svc.id} className="flex items-center gap-2">
                              <span className="flex-1 text-sm">{svc.name}</span>
                              <Input
                                defaultValue={svc.itemPrice || (svc as any).price || ""}
                                onBlur={(e) => {
                                  const val = e.currentTarget.value;
                                  if (!val) return;
                                  updatePriceMutation.mutate({ clothingItemId: editingClothing!.id, serviceId: svc.id, price: val });
                                }}
                                className="w-28 h-8"
                                type="number"
                                step="0.01"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-pos-error"
                                onClick={() => deletePriceMutation.mutate({ clothingItemId: editingClothing!.id, serviceId: svc.id })}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-3">
                        <Form {...priceForm}>
                          <form onSubmit={priceForm.handleSubmit(handlePriceSubmit)} className="flex items-end gap-2">
                            <div className="flex-1">
                              <FormField
                                control={priceForm.control}
                                name="serviceId"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Add Service</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select service" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {services.map((svc) => (
                                          <SelectItem key={svc.id} value={svc.id}>
                                            {svc.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div>
                              <FormField
                                control={priceForm.control}
                                name="price"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Price</FormLabel>
                                    <FormControl>
                                      <Input type="number" step="0.01" {...field} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                            <input type="hidden" value={editingClothing!.id} {...priceForm.register("clothingItemId")} />
                            <Button type="submit" className="bg-pos-secondary hover:bg-green-600 h-9">Add</Button>
                          </form>
                        </Form>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setEditingClothing(null);
                          clothingForm.reset();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-pos-secondary hover:bg-green-600"
                      >
                        Update Item
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {item.name}
                      </h3>
                      {(item as any).nameAr && (
                        <div className="text-sm text-gray-700 mb-1 text-right" dir="rtl">
                          {(item as any).nameAr}
                        </div>
                      )}
                      {item.description && (
                        <p className="text-sm text-gray-600 mb-1">{item.description}</p>
                      )}
                      {(item as any).descriptionAr && (
                        <div className="text-xs text-gray-600 text-right mb-2" dir="rtl">
                          {(item as any).descriptionAr}
                        </div>
                      )}
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded capitalize">
                        {item.categoryId}
                      </span>
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClothing(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClothing(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPriceItemId(item.id);
                          priceForm.reset({
                            clothingItemId: item.id,
                            serviceId: "",
                            price: "",
                          });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {priceItemId === item.id && (
                    <Form {...priceForm}>
                      <form
                        onSubmit={priceForm.handleSubmit(handlePriceSubmit)}
                        className="space-y-2 mt-2"
                      >
                        <FormField
                          control={priceForm.control}
                          name="serviceId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Service</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select service" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {services.map((svc) => (
                                    <SelectItem key={svc.id} value={svc.id}>
                                      {svc.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={priceForm.control}
                          name="price"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Price</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <div className="flex justify-end space-x-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setPriceItemId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            className="bg-pos-secondary hover:bg-green-600"
                          >
                            Save
                          </Button>
                        </div>
                      </form>
                    </Form>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={!!clothingToDelete}
        onOpenChange={(open) => !open && setClothingToDelete(null)}
        title={t.delete}
        description={t.confirmDeleteClothing}
        confirmText={t.delete}
        cancelText={t.cancel}
        onConfirm={() => {
          if (clothingToDelete) {
            deleteClothingMutation.mutate(clothingToDelete);
          }
          setClothingToDelete(null);
        }}
      />
    </>
  );
}
