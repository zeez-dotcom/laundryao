import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { 
  Truck, 
  MapPin, 
  Clock, 
  DollarSign, 
  Package, 
  CreditCard, 
  Settings,
  Plus,
  Minus,
  Save,
  Eye,
  EyeOff
} from "lucide-react";
import LoadingScreen from "@/components/common/LoadingScreen";
import type { 
  BranchDeliverySettings,
  InsertBranchDeliverySettings,
  BranchDeliveryItem,
  InsertBranchDeliveryItem,
  BranchDeliveryPackage,
  InsertBranchDeliveryPackage,
  BranchPaymentMethod,
  InsertBranchPaymentMethod,
  City,
  ClothingItem,
  LaundryService,
  Package as PackageType,
  PaymentMethodType
} from "@shared/schema";

interface DeliverySettings {
  deliveryEnabled: boolean;
  minimumOrderAmount: string;
  deliveryFee: string;
  freeDeliveryThreshold: string;
  maxDeliveryDistance: string;
  estimatedDeliveryTime: number;
  specialInstructions: string;
  operatingHours: {
    [key: string]: {
      isOpen: boolean;
      openTime: string;
      closeTime: string;
    };
  };
}

interface DeliveryItemWithInfo extends BranchDeliveryItem {
  clothingItem?: ClothingItem;
  service?: LaundryService;
  posPrice?: string;
}

interface DeliveryPackageWithInfo extends BranchDeliveryPackage {
  package?: PackageType;
}

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' }
];

const PAYMENT_METHODS: { value: PaymentMethodType; label: string; description: string }[] = [
  { value: 'cash', label: 'Cash on Delivery', description: 'Customer pays cash when order is delivered' },
  { value: 'card', label: 'Card on Delivery', description: 'Customer pays with card when order is delivered' },
  { value: 'knet', label: 'KNET', description: 'Online payment through KNET' },
  { value: 'credit_card', label: 'Credit Card', description: 'Online payment with credit card' },
  { value: 'pay_later', label: 'Pay Later', description: 'Allow customers to pay at a later time' }
];

export function BranchDeliveryManager() {
  const { branch } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState("settings");
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>({
    deliveryEnabled: false,
    minimumOrderAmount: "0",
    deliveryFee: "0",
    freeDeliveryThreshold: "0",
    maxDeliveryDistance: "10",
    estimatedDeliveryTime: 120,
    specialInstructions: "",
    operatingHours: DAYS_OF_WEEK.reduce((acc, day) => ({
      ...acc,
      [day.key]: { isOpen: true, openTime: "08:00", closeTime: "20:00" }
    }), {})
  });
  
  // Queries
  const { data: currentSettings, isLoading: settingsLoading } = useQuery<BranchDeliverySettings>({
    queryKey: [`/api/branches/${branch?.id}/delivery-settings`],
    enabled: !!branch?.id,
  });
  
  const { data: cities = [], isLoading: citiesLoading } = useQuery<City[]>({
    queryKey: ["/api/cities"],
  });
  
  const { data: serviceCities = [], isLoading: serviceCitiesLoading } = useQuery<string[]>({
    queryKey: [`/api/branches/${branch?.id}/service-cities`],
    enabled: !!branch?.id,
  });
  
  const { data: clothingItems = [], isLoading: itemsLoading } = useQuery<ClothingItem[]>({
    queryKey: [`/api/clothing-items?userId=${branch?.id}`],
    enabled: !!branch?.id,
  });
  
  const { data: services = [], isLoading: servicesLoading } = useQuery<LaundryService[]>({
    queryKey: [`/api/laundry-services?userId=${branch?.id}`],
    enabled: !!branch?.id,
  });
  
  const { data: deliveryItems = [], isLoading: deliveryItemsLoading } = useQuery<DeliveryItemWithInfo[]>({
    queryKey: [`/api/branches/${branch?.id}/delivery-items`],
    enabled: !!branch?.id,
  });
  
  const { data: packages = [], isLoading: packagesLoading } = useQuery<PackageType[]>({
    queryKey: [`/api/packages?branchId=${branch?.id}`],
    enabled: !!branch?.id,
  });
  
  const { data: deliveryPackages = [], isLoading: deliveryPackagesLoading } = useQuery<DeliveryPackageWithInfo[]>({
    queryKey: [`/api/branches/${branch?.id}/delivery-packages`],
    enabled: !!branch?.id,
  });
  
  const { data: paymentMethods = [], isLoading: paymentMethodsLoading } = useQuery<BranchPaymentMethod[]>({
    queryKey: [`/api/branches/${branch?.id}/payment-methods`],
    enabled: !!branch?.id,
  });

  // Load current settings into form state
  useEffect(() => {
    if (currentSettings) {
      setDeliverySettings({
        deliveryEnabled: currentSettings.deliveryEnabled,
        minimumOrderAmount: currentSettings.minimumOrderAmount?.toString() || "0",
        deliveryFee: currentSettings.deliveryFee?.toString() || "0",
        freeDeliveryThreshold: currentSettings.freeDeliveryThreshold?.toString() || "0",
        maxDeliveryDistance: currentSettings.maxDeliveryDistance?.toString() || "10",
        estimatedDeliveryTime: currentSettings.estimatedDeliveryTime || 120,
        specialInstructions: currentSettings.specialInstructions || "",
        operatingHours: currentSettings.operatingHours ? 
          currentSettings.operatingHours as DeliverySettings['operatingHours'] : 
          DAYS_OF_WEEK.reduce((acc, day) => ({
            ...acc,
            [day.key]: { isOpen: true, openTime: "08:00", closeTime: "20:00" }
          }), {})
      });
    }
  }, [currentSettings]);

  // Mutations
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: InsertBranchDeliverySettings) => {
      const response = await apiRequest("PUT", `/api/branches/${branch?.id}/delivery-settings`, settings);
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Delivery settings updated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branch?.id}/delivery-settings`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating delivery settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateServiceCitiesMutation = useMutation({
    mutationFn: async (cityIds: string[]) => {
      const response = await apiRequest("PUT", `/api/branches/${branch?.id}/service-cities`, { cityIds });
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Service areas updated successfully" });
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branch?.id}/service-cities`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating service areas",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleDeliveryItemMutation = useMutation({
    mutationFn: async ({ clothingItemId, serviceId, isAvailable }: { 
      clothingItemId: string; 
      serviceId: string; 
      isAvailable: boolean; 
    }) => {
      const response = await apiRequest("PUT", `/api/branches/${branch?.id}/delivery-items/${clothingItemId}/${serviceId}`, {
        isAvailable
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branch?.id}/delivery-items`] });
    },
  });

  const togglePaymentMethodMutation = useMutation({
    mutationFn: async ({ paymentMethod, isEnabled }: { 
      paymentMethod: PaymentMethodType; 
      isEnabled: boolean; 
    }) => {
      const response = await apiRequest("PUT", `/api/branches/${branch?.id}/payment-methods/${paymentMethod}`, {
        isEnabled
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branch?.id}/payment-methods`] });
    },
  });

  // Handlers
  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const settings: InsertBranchDeliverySettings = {
      branchId: branch!.id,
      deliveryEnabled: deliverySettings.deliveryEnabled,
      minimumOrderAmount: deliverySettings.minimumOrderAmount && deliverySettings.minimumOrderAmount !== "0" ? 
        deliverySettings.minimumOrderAmount : undefined,
      deliveryFee: deliverySettings.deliveryFee && deliverySettings.deliveryFee !== "0" ? 
        deliverySettings.deliveryFee : undefined,
      freeDeliveryThreshold: deliverySettings.freeDeliveryThreshold && deliverySettings.freeDeliveryThreshold !== "0" ? 
        deliverySettings.freeDeliveryThreshold : undefined,
      maxDeliveryDistance: deliverySettings.maxDeliveryDistance && deliverySettings.maxDeliveryDistance !== "0" ? 
        deliverySettings.maxDeliveryDistance : undefined,
      estimatedDeliveryTime: deliverySettings.estimatedDeliveryTime,
      specialInstructions: deliverySettings.specialInstructions || undefined,
      operatingHours: deliverySettings.operatingHours,
    };

    updateSettingsMutation.mutate(settings);
  };

  const handleServiceCitiesChange = (cityIds: string[]) => {
    updateServiceCitiesMutation.mutate(cityIds);
  };

  // Group cities by governorate
  const groupedCities = cities.reduce((acc, city) => {
    if (city.type === 'governorate') {
      acc[city.id] = { governorate: city, areas: [] };
    }
    return acc;
  }, {} as Record<string, { governorate: City; areas: City[] }>);

  cities.forEach(city => {
    if (city.type === 'area' && city.parentId && groupedCities[city.parentId]) {
      groupedCities[city.parentId].areas.push(city);
    }
  });

  if (!branch) return null;

  const isLoading = settingsLoading || citiesLoading || serviceCitiesLoading || 
    itemsLoading || servicesLoading || deliveryItemsLoading || 
    packagesLoading || deliveryPackagesLoading || paymentMethodsLoading;

  if (isLoading) {
    return <LoadingScreen message="Loading delivery settings..." />;
  }

  return (
    <div className="space-y-6" data-testid="branch-delivery-manager">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Delivery Management
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Configure delivery settings, service areas, items, and payment methods
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            checked={deliverySettings.deliveryEnabled}
            onCheckedChange={(checked) => 
              setDeliverySettings(prev => ({ ...prev, deliveryEnabled: checked }))
            }
            data-testid="switch-delivery-enabled"
          />
          <Label htmlFor="delivery-enabled" className="font-medium">
            {deliverySettings.deliveryEnabled ? "Delivery Active" : "Delivery Inactive"}
          </Label>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
          <TabsTrigger value="settings" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="tab-settings">
            <Settings className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Settings</span>
            <span className="sm:hidden">Set</span>
          </TabsTrigger>
          <TabsTrigger value="areas" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="tab-areas">
            <MapPin className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Service Areas</span>
            <span className="sm:hidden">Areas</span>
          </TabsTrigger>
          <TabsTrigger value="items" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="tab-items">
            <Package className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Items</span>
            <span className="sm:hidden">Items</span>
          </TabsTrigger>
          <TabsTrigger value="packages" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="tab-packages">
            <Package className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Packages</span>
            <span className="sm:hidden">Pack</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm" data-testid="tab-payments">
            <CreditCard className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Payments</span>
            <span className="sm:hidden">Pay</span>
          </TabsTrigger>
        </TabsList>

        {/* Delivery Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <form onSubmit={handleSettingsSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Pricing & Fees
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minimum-order">Minimum Order Amount (KWD)</Label>
                    <Input
                      id="minimum-order"
                      type="number"
                      step="0.01"
                      value={deliverySettings.minimumOrderAmount}
                      onChange={(e) => setDeliverySettings(prev => ({ 
                        ...prev, 
                        minimumOrderAmount: e.target.value 
                      }))}
                      placeholder="0.00"
                      data-testid="input-minimum-order"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delivery-fee">Delivery Fee (KWD)</Label>
                    <Input
                      id="delivery-fee"
                      type="number"
                      step="0.01"
                      value={deliverySettings.deliveryFee}
                      onChange={(e) => setDeliverySettings(prev => ({ 
                        ...prev, 
                        deliveryFee: e.target.value 
                      }))}
                      placeholder="0.00"
                      data-testid="input-delivery-fee"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="free-delivery">Free Delivery Threshold (KWD)</Label>
                    <Input
                      id="free-delivery"
                      type="number"
                      step="0.01"
                      value={deliverySettings.freeDeliveryThreshold}
                      onChange={(e) => setDeliverySettings(prev => ({ 
                        ...prev, 
                        freeDeliveryThreshold: e.target.value 
                      }))}
                      placeholder="0.00"
                      data-testid="input-free-delivery"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Service Limits
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="max-distance">Maximum Delivery Distance (KM)</Label>
                    <Input
                      id="max-distance"
                      type="number"
                      step="0.1"
                      value={deliverySettings.maxDeliveryDistance}
                      onChange={(e) => setDeliverySettings(prev => ({ 
                        ...prev, 
                        maxDeliveryDistance: e.target.value 
                      }))}
                      placeholder="10"
                      data-testid="input-max-distance"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delivery-time">Estimated Delivery Time (minutes)</Label>
                    <Input
                      id="delivery-time"
                      type="number"
                      value={deliverySettings.estimatedDeliveryTime}
                      onChange={(e) => setDeliverySettings(prev => ({ 
                        ...prev, 
                        estimatedDeliveryTime: parseInt(e.target.value) || 120 
                      }))}
                      placeholder="120"
                      data-testid="input-delivery-time"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Operating Hours
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {DAYS_OF_WEEK.map((day) => (
                  <div key={day.key} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Checkbox
                        checked={deliverySettings.operatingHours[day.key]?.isOpen || false}
                        onCheckedChange={(checked) => {
                          setDeliverySettings(prev => ({
                            ...prev,
                            operatingHours: {
                              ...prev.operatingHours,
                              [day.key]: {
                                ...prev.operatingHours[day.key],
                                isOpen: checked === true
                              }
                            }
                          }));
                        }}
                        data-testid={`checkbox-${day.key}`}
                      />
                      <Label className="w-24 font-medium">{day.label}</Label>
                    </div>
                    {deliverySettings.operatingHours[day.key]?.isOpen && (
                      <div className="flex items-center space-x-2">
                        <Input
                          type="time"
                          value={deliverySettings.operatingHours[day.key]?.openTime || "08:00"}
                          onChange={(e) => {
                            setDeliverySettings(prev => ({
                              ...prev,
                              operatingHours: {
                                ...prev.operatingHours,
                                [day.key]: {
                                  ...prev.operatingHours[day.key],
                                  openTime: e.target.value
                                }
                              }
                            }));
                          }}
                          className="w-20"
                          data-testid={`time-open-${day.key}`}
                        />
                        <span>to</span>
                        <Input
                          type="time"
                          value={deliverySettings.operatingHours[day.key]?.closeTime || "20:00"}
                          onChange={(e) => {
                            setDeliverySettings(prev => ({
                              ...prev,
                              operatingHours: {
                                ...prev.operatingHours,
                                [day.key]: {
                                  ...prev.operatingHours[day.key],
                                  closeTime: e.target.value
                                }
                              }
                            }));
                          }}
                          className="w-20"
                          data-testid={`time-close-${day.key}`}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Special Instructions</CardTitle>
                <CardDescription>
                  Additional instructions or notes for delivery customers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={deliverySettings.specialInstructions}
                  onChange={(e) => setDeliverySettings(prev => ({ 
                    ...prev, 
                    specialInstructions: e.target.value 
                  }))}
                  placeholder="Special delivery instructions..."
                  rows={3}
                  data-testid="textarea-special-instructions"
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={updateSettingsMutation.isPending}
                data-testid="button-save-settings"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Service Areas Tab */}
        <TabsContent value="areas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Service Coverage Areas
              </CardTitle>
              <CardDescription>
                Select the cities and areas where you provide delivery service
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Object.values(groupedCities).map(({ governorate, areas }) => (
                <div key={governorate.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {governorate.nameEn} ({governorate.nameAr})
                    </h3>
                    <Badge variant="outline">
                      {areas.filter(area => serviceCities.includes(area.id)).length} / {areas.length} areas
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pl-4">
                    {areas.map((area) => (
                      <div key={area.id} className="flex items-center space-x-2">
                        <Checkbox
                          checked={serviceCities.includes(area.id)}
                          onCheckedChange={(checked) => {
                            const newCities = checked 
                              ? [...serviceCities, area.id]
                              : serviceCities.filter(id => id !== area.id);
                            handleServiceCitiesChange(newCities);
                          }}
                          data-testid={`checkbox-city-${area.id}`}
                        />
                        <Label className="text-sm">
                          {area.nameEn}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <Separator />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Items Tab */}
        <TabsContent value="items" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Delivery Items
              </CardTitle>
              <CardDescription>
                Configure which clothing items and services are available for delivery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {clothingItems.map((clothingItem) => (
                  <div key={clothingItem.id} className="border rounded-lg p-4">
                    <h4 className="font-medium text-lg mb-3">{clothingItem.name}</h4>
                    <div className="grid gap-3">
                      {services.map((service) => {
                        const deliveryItem = deliveryItems.find(
                          di => di.clothingItemId === clothingItem.id && di.serviceId === service.id
                        );
                        const isEnabled = deliveryItem?.isAvailable ?? false;
                        
                        return (
                          <div key={service.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) => {
                                  toggleDeliveryItemMutation.mutate({
                                    clothingItemId: clothingItem.id,
                                    serviceId: service.id,
                                    isAvailable: checked
                                  });
                                }}
                                data-testid={`switch-item-${clothingItem.id}-${service.id}`}
                              />
                              <div>
                                <p className="font-medium">{service.name}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  POS Price: {deliveryItem?.posPrice || service.price} KWD
                                </p>
                              </div>
                            </div>
                            {deliveryItem?.deliveryPrice && (
                              <Badge variant="secondary">
                                Delivery: {deliveryItem.deliveryPrice} KWD
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Packages Tab */}
        <TabsContent value="packages" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Delivery Packages
              </CardTitle>
              <CardDescription>
                Configure which packages are available for delivery orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {packages.map((pkg) => {
                  const deliveryPackage = deliveryPackages.find(dp => dp.packageId === pkg.id);
                  const isEnabled = deliveryPackage?.isAvailable ?? false;
                  
                  return (
                    <div key={pkg.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => {
                            // Toggle package availability - implement mutation
                          }}
                          data-testid={`switch-package-${pkg.id}`}
                        />
                        <div>
                          <h4 className="font-medium">{pkg.nameEn}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {pkg.descriptionEn}
                          </p>
                          <p className="text-sm font-medium">Price: {pkg.price} KWD</p>
                        </div>
                      </div>
                      {deliveryPackage?.deliveryDiscount && (
                        <Badge variant="secondary">
                          {deliveryPackage.deliveryDiscount}% discount for delivery
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Methods Tab */}
        <TabsContent value="payments" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Payment Methods
              </CardTitle>
              <CardDescription>
                Configure accepted payment methods for delivery orders
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {PAYMENT_METHODS.map((method) => {
                  const branchMethod = paymentMethods.find(pm => pm.paymentMethod === method.value);
                  const isEnabled = branchMethod?.isEnabled ?? false;
                  
                  return (
                    <div key={method.value} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(checked) => {
                            togglePaymentMethodMutation.mutate({
                              paymentMethod: method.value,
                              isEnabled: checked
                            });
                          }}
                          data-testid={`switch-payment-${method.value}`}
                        />
                        <div>
                          <h4 className="font-medium">{method.label}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {method.description}
                          </p>
                        </div>
                      </div>
                      {branchMethod?.processingFee && (
                        <Badge variant="outline">
                          Fee: {branchMethod.processingFee} KWD
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BranchDeliveryManager;