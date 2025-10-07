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
  insertLaundryServiceSchema,
  insertItemServicePriceSchema,
} from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";

interface ServicePayload {
  name: string;
  nameAr?: string;
  description?: string;
  descriptionAr?: string;
  price: string;
  categoryId: string;
}

export function ServicesSection() {
  const [addingService, setAddingService] = useState(false);
  const [editingService, setEditingService] = useState<LaundryService | null>(
    null,
  );
  const [priceServiceId, setPriceServiceId] = useState<string | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState("");

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

  const { data: services = [] } = useQuery<(LaundryService & { itemPrice?: string })[]>({
    queryKey: ["/api/laundry-services", clothingItems.map((i) => i.id)],
    queryFn: async () => {
      const baseRes = await apiRequest("GET", "/api/laundry-services");
      const baseServices: LaundryService[] = await baseRes.json();

      const itemServiceLists = await Promise.all(
        clothingItems.map(async (item) => {
          const qs = needsBranchParam && branchIdParam ? `?branchId=${encodeURIComponent(branchIdParam)}` : "";
          const res = await apiRequest("GET", `/api/clothing-items/${item.id}/services${qs}`);
          return res.json();
        }),
      );

      const serviceMap = new Map<
        string,
        LaundryService & { itemPrice?: string }
      >(baseServices.map((s) => [s.id, { ...s }]));

      for (const list of itemServiceLists) {
        for (const svc of list as (LaundryService & { itemPrice: string })[]) {
          if (
            svc.itemPrice &&
            svc.itemPrice !== serviceMap.get(svc.id)?.price
          ) {
            serviceMap.set(svc.id, {
              ...serviceMap.get(svc.id)!,
              itemPrice: svc.itemPrice,
            });
          }
        }
      }

      return Array.from(serviceMap.values());
    },
  });

  const serviceForm = useForm<ServicePayload>({
    resolver: zodResolver(insertLaundryServiceSchema),
    defaultValues: {
      name: "",
      nameAr: "",
      description: "",
      descriptionAr: "",
      price: "",
      categoryId: "",
    },
  });

  const priceForm = useForm<{
    clothingItemId: string;
    serviceId: string;
    price: string;
  }>({
    resolver: zodResolver(insertItemServicePriceSchema),
    defaultValues: { clothingItemId: "", serviceId: "", price: "" },
  });

  const createServiceMutation = useMutation({
    mutationFn: async (data: ServicePayload) => {
      const response = await apiRequest("POST", "/api/laundry-services", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/laundry-services"] });
      setAddingService(false);
      serviceForm.reset();
      toast({ title: t.serviceCreated });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ServicePayload }) => {
      const response = await apiRequest(
        "PUT",
        `/api/laundry-services/${id}`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/laundry-services"] });
      setEditingService(null);
      serviceForm.reset();
      toast({ title: t.serviceUpdated });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/laundry-services/${id}`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/laundry-services"] });
      toast({ title: t.serviceDeleted });
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
      setPriceServiceId(null);
      priceForm.reset();
      toast({ title: "Price saved successfully" });
    },
  });

  const handleServiceSubmit = (data: ServicePayload) => {
    if (editingService) {
      updateServiceMutation.mutate({ id: editingService.id, data });
    } else {
      createServiceMutation.mutate(data);
    }
  };

  const handleAddService = () => {
    setAddingService(true);
    setEditingService(null);
    serviceForm.reset({ name: "", nameAr: "", description: "", descriptionAr: "", price: "", categoryId: "" });
  };

  const handleEditService = (service: LaundryService) => {
    setEditingService(service);
    setAddingService(false);
    serviceForm.reset({
      name: service.name,
      nameAr: (service as any).nameAr || "",
      description: service.description || "",
      descriptionAr: (service as any).descriptionAr || "",
      price: service.price,
      categoryId: service.categoryId,
    });
  };

  const handleDeleteService = (id: string) => {
    setServiceToDelete(id);
  };

  const handlePriceSubmit = (data: {
    clothingItemId: string;
    serviceId: string;
    price: string;
  }) => {
    priceMutation.mutate(data);
  };

  const filteredServices = services.filter((service: any) => {
    const term = serviceSearch.toLowerCase();
    return (
      service.name?.toLowerCase().includes(term) ||
      service.description?.toLowerCase?.().includes(term) ||
      service.nameAr?.toLowerCase?.().includes(term) ||
      service.descriptionAr?.toLowerCase?.().includes(term) ||
      service.categoryId?.toLowerCase().includes(term)
    );
  });

  return (
    <>
      {needsBranchParam && !branchIdParam && (
        <div className="mb-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          Super admin: select a branch to manage services and prices.
        </div>
      )}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">
          Laundry Services ({filteredServices.length})
        </h2>
        <div className="flex items-center space-x-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search services"
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button
            className="bg-pos-primary hover:bg-blue-700"
            onClick={handleAddService}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Service
          </Button>
        </div>
      </div>

      {addingService && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <Form {...serviceForm}>
              <form
                onSubmit={serviceForm.handleSubmit(handleServiceSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={serviceForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Wash & Fold" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={serviceForm.control}
                  name="nameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name (Arabic)</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: غسيل وطي" dir="rtl" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={serviceForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Service description..."
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={serviceForm.control}
                  name="descriptionAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Arabic)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="وصف الخدمة..." dir="rtl" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={serviceForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={serviceForm.control}
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
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                          <SelectItem value="specialty">Specialty</SelectItem>
                          <SelectItem value="express">Express</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAddingService(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-pos-secondary hover:bg-green-600"
                  >
                    Create Service
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {filteredServices.map((service) => (
          <Card key={service.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              {editingService?.id === service.id ? (
                <Form {...serviceForm}>
                  <form
                    onSubmit={serviceForm.handleSubmit(handleServiceSubmit)}
                    className="space-y-2"
                  >
                    <FormField
                      control={serviceForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={serviceForm.control}
                      name="nameAr"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Name (Arabic)</FormLabel>
                          <FormControl>
                            <Input dir="rtl" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={serviceForm.control}
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
                      control={serviceForm.control}
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
                      control={serviceForm.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price ($)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={serviceForm.control}
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
                              <SelectItem value="basic">Basic</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                              <SelectItem value="specialty">
                                Specialty
                              </SelectItem>
                              <SelectItem value="express">Express</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setEditingService(null);
                          serviceForm.reset();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        className="bg-pos-secondary hover:bg-green-600"
                      >
                        Update Service
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {service.name}
                      </h3>
                      {(service as any).nameAr && (
                        <div className="text-sm text-gray-700 text-right mb-1" dir="rtl">
                          {(service as any).nameAr}
                        </div>
                      )}
                      {service.description && (
                        <p className="text-sm text-gray-600 mb-1">{service.description}</p>
                      )}
                      {(service as any).descriptionAr && (
                        <div className="text-xs text-gray-600 text-right mb-2" dir="rtl">
                          {(service as any).descriptionAr}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-lg font-bold text-pos-primary">
                            $
                            {parseFloat(
                              service.itemPrice ?? service.price,
                            ).toFixed(2)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {service.itemPrice ? "Item price" : "Base price"}
                          </span>
                        </div>
                        <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded capitalize">
                          {service.categoryId}
                        </span>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditService(service)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteService(service.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPriceServiceId(service.id);
                          priceForm.reset({
                            serviceId: service.id,
                            clothingItemId: "",
                            price: "",
                          });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {priceServiceId === service.id && (
                    <Form {...priceForm}>
                      <form
                        onSubmit={priceForm.handleSubmit(handlePriceSubmit)}
                        className="space-y-2 mt-2"
                      >
                        <FormField
                          control={priceForm.control}
                          name="clothingItemId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Clothing Item</FormLabel>
                              <Select
                                onValueChange={field.onChange}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select item" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {clothingItems.map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.name}
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
                            onClick={() => setPriceServiceId(null)}
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
        open={!!serviceToDelete}
        onOpenChange={(open) => !open && setServiceToDelete(null)}
        title={t.delete}
        description={t.confirmDeleteService}
        confirmText={t.delete}
        cancelText={t.cancel}
        onConfirm={() => {
          if (serviceToDelete) {
            deleteServiceMutation.mutate(serviceToDelete);
          }
          setServiceToDelete(null);
        }}
      />
    </>
  );
}
