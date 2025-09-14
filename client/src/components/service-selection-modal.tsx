import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Minus, AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ClothingItem, LaundryService } from "@shared/schema";
import { useCurrency } from "@/lib/currency";
import { useTranslation } from "@/lib/i18n";

interface ServiceSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clothingItem: ClothingItem | null;
  onAddToCart: (
    clothingItem: ClothingItem,
    service: LaundryService,
    quantity: number,
  ) => void;
  branchCode?: string;
}

interface ServiceCategory {
  id: string;
  name: string;
}

export function ServiceSelectionModal({
  isOpen,
  onClose,
  clothingItem,
  onAddToCart,
  branchCode,
}: ServiceSelectionModalProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    null,
  );
  const { formatCurrency } = useCurrency();
  const { t } = useTranslation();

  const { data: fetchedCategories = [], isLoading: categoriesLoading } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/categories", "service"],
    queryFn: async () => {
      const response = await fetch("/api/categories?type=service", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch service categories");
      return response.json();
    },
    enabled: isOpen,
  });

  const serviceCategories: ServiceCategory[] = [
    { id: "all", name: "All Services" },
    ...fetchedCategories,
  ];

  const {
    data: services = [],
    isLoading: servicesLoading,
    error: servicesError,
    refetch: refetchServices
  } = useQuery<(LaundryService & { itemPrice: string })[]>({
    queryKey: [
      "/api/clothing-items",
      clothingItem?.id,
      "services",
      selectedCategory,
      branchCode,
    ],
    queryFn: async () => {
      if (!clothingItem) return [];
      const params = new URLSearchParams();
      if (selectedCategory !== "all")
        params.append("categoryId", selectedCategory);
      if (branchCode) params.append("branchCode", branchCode);
      const response = await fetch(
        `/api/clothing-items/${clothingItem.id}/services?${params}`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch services: ${response.status} ${errorText}`);
      }
      const rawServices = await response.json();
      // Filter out services with zero or invalid prices
      return rawServices.filter((service: any) => {
        const price = parseFloat(service.itemPrice || service.price || "0");
        return price > 0;
      });
    },
    enabled: isOpen && !!clothingItem,
    retry: 2,
  });

  const getQuantity = (serviceId: string) => quantities[serviceId] || 1;

  const updateQuantity = (serviceId: string, quantity: number) => {
    setQuantities((prev) => ({
      ...prev,
      [serviceId]: Math.max(1, quantity),
    }));
  };

  const getServicePrice = (service: LaundryService & { itemPrice?: string }) => {
    return service.itemPrice || service.price || "0";
  };

  const handleAddToCart = (service: LaundryService & { itemPrice?: string }) => {
    if (!clothingItem) return;

    const quantity = getQuantity(service.id);
    // Create a clean service object with proper price
    const cleanService: LaundryService = {
      id: service.id,
      name: service.name,
      nameAr: (service as any).nameAr || null,
      description: service.description,
      descriptionAr: (service as any).descriptionAr || null,
      categoryId: service.categoryId,
      price: getServicePrice(service),
      userId: service.userId,
    };
    onAddToCart(clothingItem, cleanService, quantity);

    setQuantities(prev => ({ ...prev, [service.id]: 1 }));
    setSelectedServiceId(null);
  };

  const handleClose = () => {
    setQuantities({});
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>Select Service for</span>
            <span className="text-pos-primary">
              {clothingItem?.name}
            </span>
          </DialogTitle>
          <DialogDescription>
            Choose a service and quantity for the selected item
          </DialogDescription>
        </DialogHeader>

        {/* Service Categories */}
        <div className="flex space-x-1 mb-4 overflow-x-auto">
          {categoriesLoading ? (
            <div className="flex space-x-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          ) : (
            serviceCategories.map((category) => (
              <Button
                key={category.id}
                variant={
                  selectedCategory === category.id ? "default" : "secondary"
                }
                size="sm"
                className={`whitespace-nowrap ${
                  selectedCategory === category.id
                    ? "bg-pos-primary hover:bg-blue-700 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
                onClick={() => setSelectedCategory(category.id)}
                disabled={servicesLoading}
              >
                {category.name}
              </Button>
            ))
          )}
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {servicesLoading ? (
            // Loading skeleton
            Array.from({ length: 4 }).map((_, index) => (
              <Card key={`skeleton-${index}`} className="animate-pulse">
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : servicesError ? (
            // Error state
            <div className="col-span-full">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Failed to load services. Please try again.</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => refetchServices()}
                    className="ml-2"
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : services.length === 0 ? (
            // Empty state
            <div className="col-span-full text-center py-8">
              <p className="text-gray-500 mb-2">No services available for this item.</p>
              <p className="text-sm text-gray-400">Try selecting a different category or contact admin.</p>
            </div>
          ) : (
            // Services list
            services.map((service) => {
              const isSelected = selectedServiceId === service.id;
              const category = serviceCategories.find(
                (c) => c.id === service.categoryId,
              );
              const servicePrice = getServicePrice(service);
              
              return (
                <Card
                  key={service.id}
                  className={`hover:shadow-md transition-shadow cursor-pointer ${
                    isSelected ? "ring-2 ring-pos-primary" : ""
                  }`}
                  onClick={() => setSelectedServiceId(service.id)}
                  data-testid={`card-service-${service.id}`}
                >
                  <CardContent className="p-4">
                    <h3 className="font-medium text-gray-900 mb-1">
                      {service.name || "Unnamed Service"}
                    </h3>
                    {service.description && (
                      <p className="text-sm text-gray-600 mb-2">
                        {service.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-bold text-pos-primary">
                        {servicePrice && !isNaN(parseFloat(servicePrice)) 
                          ? formatCurrency(servicePrice)
                          : "Price N/A"
                        }
                      </span>
                      <span className="text-xs text-gray-500 capitalize bg-gray-100 px-2 py-1 rounded">
                        {category?.name || service.categoryId || "Uncategorized"}
                      </span>
                    </div>

                  {isSelected && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center space-x-2 justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateQuantity(
                              service.id,
                              getQuantity(service.id) - 1,
                            );
                          }}
                          data-testid={`button-decrease-quantity-${service.id}`}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          min="1"
                          value={getQuantity(service.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            updateQuantity(
                              service.id,
                              parseInt(e.target.value) || 1,
                            )
                          }
                          className="w-16 text-center"
                          data-testid={`input-quantity-${service.id}`}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateQuantity(
                              service.id,
                              getQuantity(service.id) + 1,
                            );
                          }}
                          data-testid={`button-increase-quantity-${service.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <Button
                        className="bg-pos-secondary hover:bg-green-600 text-white w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToCart(service);
                        }}
                        data-testid={`button-add-to-cart-${service.id}`}
                      >
                        Add to Cart
                      </Button>

                      <div className="text-right">
                        <span className="text-sm text-gray-600">
                          Total:{" "}
                          {servicePrice && !isNaN(parseFloat(servicePrice))
                            ? formatCurrency(
                                parseFloat(servicePrice) * getQuantity(service.id)
                              )
                            : "N/A"
                          }
                        </span>
                      </div>
                    </div>
                  )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
