import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CustomerAuthProvider, useCustomerAuth } from "@/context/CustomerAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";
import { LanguageSelector } from "@/components/language-selector";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { getCities } from "@/lib/cities";
import {
  Bot,
  User,
  Store,
  Package,
  Plus,
  Minus,
  MapPin,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  CreditCard,
  Loader2,
  ShoppingCart,
  Shirt,
  Sparkles,
  DollarSign,
  Trash2,
  Home,
  Phone
} from "lucide-react";
import type { 
  ClothingItem, 
  LaundryService, 
  Customer, 
  CustomerAddress, 
  Branch,
  City,
  PaymentMethodType
} from "@shared/schema";

// Smart ordering flow steps with chatbot-style progression
type OrderStep = 
  | "welcome"
  | "service_type"
  | "item_selection"
  | "service_selection"
  | "quantity_selection"
  | "cart_review"
  | "address_collection"
  | "address_selection"
  | "payment_selection"
  | "order_summary"
  | "confirmation";

type ServiceType = "individual" | "package";

interface CartItem {
  clothingItemId: string;
  clothingItemName: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface NewAddress {
  label: string;
  street: string;
  area: string;
  governorateId: string;
  cityId: string;
  block?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  additionalInfo?: string;
}

interface OrderFlowState {
  step: OrderStep;
  serviceType: ServiceType;
  selectedClothingItem: ClothingItem | null;
  selectedService: LaundryService | null;
  selectedQuantity: number;
  cart: CartItem[];
  selectedAddress: CustomerAddress | null;
  newAddress: NewAddress | null;
  isCreatingNewAddress: boolean;
  paymentMethod: PaymentMethodType | null;
  deliveryFee: number;
  total: number;
  chatMessages: ChatMessage[];
}

interface ChatMessage {
  id: string;
  type: "bot" | "user" | "system";
  content: string;
  timestamp: Date;
  options?: ChatOption[];
}

interface ChatOption {
  id: string;
  label: string;
  action: () => void;
  icon?: string;
}

function CustomerOrderingContent() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const branchCode = searchParams.get("branchCode");
  const customerId = searchParams.get("customerId");
  const { customer, isLoading: isAuthLoading, isAuthenticated } = useCustomerAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();

  // Order flow state with smart chat interface
  const [orderState, setOrderState] = useState<OrderFlowState>({
    step: "welcome",
    serviceType: "individual",
    selectedClothingItem: null,
    selectedService: null,
    selectedQuantity: 1,
    cart: [],
    selectedAddress: null,
    newAddress: null,
    isCreatingNewAddress: false,
    paymentMethod: null,
    deliveryFee: 0,
    total: 0,
    chatMessages: []
  });

  // Fetch branch data
  const { data: branch, isLoading: branchLoading } = useQuery<Branch>({
    queryKey: ["/api/branches", branchCode],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/branches/${branchCode}`);
      return await response.json();
    },
    enabled: !!branchCode,
  });

  // Fetch branch delivery settings
  const { data: deliverySettings } = useQuery({
    queryKey: ["/api/branches", branch?.id, "delivery-settings"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/branches/${branch?.id}/delivery-settings`);
      return await response.json();
    },
    enabled: !!branch?.id,
  });

  // Fetch available clothing items for the branch
  const { data: clothingItems = [], isLoading: itemsLoading } = useQuery<ClothingItem[]>({
    queryKey: ["/api/clothing-items", branchCode],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/clothing-items?branchCode=${branchCode}`);
      return await res.json();
    },
    enabled: !!branchCode && orderState.step === "item_selection",
  });

  // Fetch services for selected clothing item
  const { data: services = [], isLoading: servicesLoading } = useQuery<(LaundryService & { itemPrice: string })[]>({
    queryKey: ["/api/clothing-items", orderState.selectedClothingItem?.id, "services", branchCode],
    queryFn: async () => {
      if (!orderState.selectedClothingItem) return [];
      const res = await apiRequest("GET", `/api/clothing-items/${orderState.selectedClothingItem.id}/services?branchCode=${branchCode}`);
      return await res.json();
    },
    enabled: !!orderState.selectedClothingItem && orderState.step === "service_selection",
  });

  // Fetch customer addresses
  const { data: addresses = [] } = useQuery<CustomerAddress[]>({
    queryKey: ["/api/customers", customerId, "addresses"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/customers/${customerId}/addresses`);
      return await response.json();
    },
    enabled: !!customerId && ["address_selection", "address_collection"].includes(orderState.step),
  });

  // Fetch cities for address creation
  const { data: cities = [] } = useQuery<City[]>({
    queryKey: ["/api/cities"],
    queryFn: getCities,
    enabled: orderState.isCreatingNewAddress,
  });

  // Fetch payment methods for the branch
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ["/api/branches", branch?.id, "payment-methods"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/branches/${branch?.id}/payment-methods`);
      return await response.json();
    },
    enabled: !!branch?.id && orderState.step === "payment_selection",
  });

  // Calculate total when cart or delivery fee changes
  useEffect(() => {
    const subtotal = orderState.cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const total = subtotal + orderState.deliveryFee;
    setOrderState(prev => ({ ...prev, total }));
  }, [orderState.cart, orderState.deliveryFee]);

  // Update delivery fee based on order amount and delivery settings
  useEffect(() => {
    if (deliverySettings) {
      const subtotal = orderState.cart.reduce((sum, item) => sum + item.totalPrice, 0);
      const freeThreshold = parseFloat(deliverySettings.freeDeliveryThreshold || "0");
      const deliveryFee = parseFloat(deliverySettings.deliveryFee || "0");
      
      const newDeliveryFee = subtotal >= freeThreshold ? 0 : deliveryFee;
      setOrderState(prev => ({ ...prev, deliveryFee: newDeliveryFee }));
    }
  }, [orderState.cart, deliverySettings]);

  // Initialize chat with welcome message
  useEffect(() => {
    if (customer && branch && orderState.chatMessages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: '1',
        type: 'bot',
        content: `Hi ${customer.name}! 👋 Welcome to ${branch.name}. I'm your smart laundry assistant. Let me help you place your order quickly and easily.`,
        timestamp: new Date(),
        options: [
          {
            id: 'start_order',
            label: `🚀 ${t.customerOrdering?.startNewOrder || 'Start New Order'}`,
            action: () => {
              setOrderState(prev => ({ ...prev, serviceType: 'individual', step: 'item_selection' }));
              addBotMessage(t.customerOrdering?.botIntro || "Great! Let's get started. I'll help you select the items you'd like to have cleaned. What type of clothing do you need service for?");
            }
          }
        ]
      };
      setOrderState(prev => ({ ...prev, chatMessages: [welcomeMessage] }));
    }
  }, [customer, branch]);

  // Progress calculation for chatbot flow
  const getProgress = () => {
    const steps = ["welcome", "service_type", "item_selection", "service_selection", "quantity_selection", "cart_review", "address_selection", "payment_selection", "order_summary", "confirmation"];
    const currentIndex = steps.indexOf(orderState.step);
    return ((currentIndex + 1) / steps.length) * 100;
  };

  // Helper function to add bot messages
  const addBotMessage = (content: string, options: ChatOption[] = []) => {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'bot',
      content,
      timestamp: new Date(),
      options
    };
    setOrderState(prev => ({ 
      ...prev, 
      chatMessages: [...prev.chatMessages, message] 
    }));
  };

  // Helper function to add user messages
  const addUserMessage = (content: string) => {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: new Date()
    };
    setOrderState(prev => ({ 
      ...prev, 
      chatMessages: [...prev.chatMessages, message] 
    }));
  };

  // Grouped cities by governorate
  const groupedCities = useMemo(() => {
    if (!cities.length) return {};
    const governorates = cities.filter(city => city.type === 'governorate');
    const areas = cities.filter(city => city.type === 'area');
    
    return governorates.reduce((acc, gov) => {
      acc[gov.id] = {
        governorate: gov,
        areas: areas.filter(area => area.parentId === gov.id)
      };
      return acc;
    }, {} as Record<string, { governorate: City; areas: City[] }>);
  }, [cities]);

  // Handle clothing item selection
  const selectClothingItem = (item: ClothingItem) => {
    setOrderState(prev => ({ ...prev, selectedClothingItem: item, step: 'service_selection' }));
    addUserMessage(`${t.customerOrdering?.selected || 'Selected:'} ${item.name}`);
    addBotMessage((t.customerOrdering?.greatChoiceForItem || 'Great choice! Now, what type of service would you like for your {item}?').replace('{item}', item.name));
  };

  // Handle service selection
  const selectService = (service: LaundryService & { itemPrice: string }) => {
    setOrderState(prev => ({ ...prev, selectedService: service, step: 'quantity_selection' }));
    addUserMessage(`${t.customerOrdering?.selected || 'Selected:'} ${service.name} - ${formatCurrency(parseFloat(service.itemPrice))}`);
    addBotMessage((t.customerOrdering?.howManyForService || 'Perfect! How many {item} items do you need {service} for?')
      .replace('{item}', orderState.selectedClothingItem?.name || '')
      .replace('{service}', service.name), [
      { id: 'qty_1', label: `1 ${t.customerOrdering?.itemSingular || 'item'}`, action: () => addToCart(1) },
      { id: 'qty_2', label: `2 ${t.customerOrdering?.itemPlural || 'items'}`, action: () => addToCart(2) },
      { id: 'qty_3', label: `3 ${t.customerOrdering?.itemPlural || 'items'}`, action: () => addToCart(3) },
      { id: 'qty_4', label: `4 ${t.customerOrdering?.itemPlural || 'items'}`, action: () => addToCart(4) },
      { id: 'qty_5', label: `5 ${t.customerOrdering?.itemPlural || 'items'}`, action: () => addToCart(5) },
      { 
        id: 'qty_custom', 
        label: t.customerOrdering?.customAmount || 'Custom amount', 
        action: () => setOrderState(prev => ({ ...prev, step: 'quantity_selection' }))
      }
    ]);
  };

  // Add items to cart
  const addToCart = (quantity: number = orderState.selectedQuantity) => {
    if (!orderState.selectedClothingItem || !orderState.selectedService) return;

    const unitPrice = parseFloat(services.find(s => s.id === orderState.selectedService!.id)?.itemPrice || "0");
    const totalPrice = unitPrice * quantity;

    const newItem: CartItem = {
      clothingItemId: orderState.selectedClothingItem.id,
      clothingItemName: orderState.selectedClothingItem.name,
      serviceId: orderState.selectedService.id,
      serviceName: orderState.selectedService.name,
      quantity,
      unitPrice,
      totalPrice
    };

    setOrderState(prev => ({
      ...prev,
      cart: [...prev.cart, newItem],
      step: "cart_review",
      selectedClothingItem: null,
      selectedService: null,
      selectedQuantity: 1
    }));

    addUserMessage(`${t.customerOrdering?.addedLine || 'Added'} ${quantity}x ${orderState.selectedClothingItem.name} (${orderState.selectedService.name}) - ${formatCurrency(totalPrice)}`);
    
    setTimeout(() => {
      addBotMessage((t.customerOrdering?.addedToCart || "Great! I've added that to your cart. Your current total is {total}. Would you like to add more items or proceed with your order?").replace('{total}', formatCurrency(orderState.total + totalPrice)), [
        {
          id: 'add_more',
          label: `➕ ${t.customerOrdering?.addMoreItems || 'Add More Items'}`,
          action: () => {
            setOrderState(prev => ({ ...prev, step: 'item_selection' }));
            addBotMessage(t.customerOrdering?.whatOtherItems || 'Perfect! What other items would you like to add?');
          }
        },
        {
          id: 'proceed_address',
          label: `📍 ${t.customerOrdering?.proceedAddress || 'Proceed to Delivery'}`,
          action: () => proceedToAddress()
        }
      ]);
    }, 500);
  };

  // Proceed to address selection/collection
  const proceedToAddress = () => {
    if (addresses.length > 0) {
      setOrderState(prev => ({ ...prev, step: 'address_selection' }));
      addBotMessage(t.customerOrdering?.setupDeliverySaved || "Now let's set up delivery! I see you have saved addresses. Would you like to use one of them or add a new address?", [
        {
          id: 'use_saved',
          label: `🏠 ${t.customerOrdering?.useSavedAddress || 'Use Saved Address'}`,
          action: () => {} // Will show address selection
        },
        {
          id: 'add_new',
          label: `📍 ${t.customerOrdering?.addNewAddress || 'Add New Address'}`,
          action: () => {
            setOrderState(prev => ({ ...prev, isCreatingNewAddress: true, step: 'address_collection' }));
            addBotMessage(t.customerOrdering?.addNewAddressBot || "I'll help you add a new delivery address. Let's start with some basic information.");
          }
        }
      ]);
    } else {
      setOrderState(prev => ({ ...prev, isCreatingNewAddress: true, step: 'address_collection' }));
      addBotMessage(t.customerOrdering?.collectDeliveryNow || "Great! Now I need your delivery address. Let me collect some information to ensure accurate delivery.");
    }
  };

  // Remove item from cart
  const removeFromCart = (index: number) => {
    const removedItem = orderState.cart[index];
    setOrderState(prev => ({
      ...prev,
      cart: prev.cart.filter((_, i) => i !== index)
    }));
    
    addUserMessage(`${t.customerOrdering?.removedLine || 'Removed'} ${removedItem.clothingItemName} (${removedItem.serviceName}) ${t.customerOrdering?.fromCart || 'from cart'}`);
    addBotMessage(t.customerOrdering?.itemRemoved || "Item removed from your cart. Anything else you'd like to adjust?");
  };

  // Select address
  const selectAddress = (address: CustomerAddress) => {
    setOrderState(prev => ({ ...prev, selectedAddress: address, step: 'payment_selection' }));
    addUserMessage(`${t.customerOrdering?.selectedDeliveryAddress || 'Selected delivery address:'} ${address.label}`);
    addBotMessage((t.customerOrdering?.deliverTo || "Perfect! I'll deliver to {label}. Now let's choose how you'd like to pay for your order.").replace('{label}', address.label));
  };

  // Select payment method
  const selectPaymentMethod = (method: PaymentMethodType) => {
    setOrderState(prev => ({ ...prev, paymentMethod: method, step: 'order_summary' }));
    addUserMessage(`${t.customerOrdering?.selectedPaymentMethod || 'Selected payment method:'} ${method.replace('_', ' ')}`);
    addBotMessage(t.customerOrdering?.showSummary || 'Excellent! Let me show you a summary of your complete order before we finalize it.');
  };

  // Create new address mutation
  const createAddressMutation = useMutation({
    mutationFn: async (addressData: NewAddress) => {
      const response = await apiRequest("POST", `/api/customers/${customerId}/addresses`, addressData);
      return await response.json();
    },
    onSuccess: (newAddress: CustomerAddress) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "addresses"] });
      setOrderState(prev => ({ 
        ...prev, 
        selectedAddress: newAddress, 
        isCreatingNewAddress: false,
        newAddress: null,
        step: 'payment_selection' 
      }));
      addUserMessage(`${t.customerOrdering?.addedNewAddress || 'Added new address:'} ${newAddress.label}`);
      addBotMessage(t.customerOrdering?.savedNewAddress || `Perfect! I've saved your new address. Now let's choose how you'd like to pay for your order.`);
    },
    onError: (error: any) => {
      toast({
        title: "Address creation failed",
        description: error.message || "Unable to create address. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Place order mutation
  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      const orderData = {
        customerId,
        branchCode,
        items: orderState.cart.map(item => ({
          clothingItemId: item.clothingItemId,
          serviceId: item.serviceId,
          quantity: item.quantity
        })),
        deliveryAddressId: orderState.selectedAddress?.id,
        paymentMethod: orderState.paymentMethod,
        deliveryFee: orderState.deliveryFee,
        total: orderState.total,
        promisedReadyDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
        promisedReadyOption: "tomorrow"
      };

      const response = await fetch("/api/delivery-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
        credentials: "include", // Include session cookies
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          // Redirect to authentication, preserving branch and intent to continue ordering
          setLocation(`/customer-auth?branchCode=${branchCode}&next=ordering`);
          throw new Error("Please log in to continue");
        }
        const error = await response.json();
        throw new Error(error.message || "Failed to place order");
      }
      
      return await response.json();
    },
    onSuccess: (order) => {
      setOrderState(prev => ({ ...prev, step: 'confirmation' }));
      addBotMessage((t.customerOrdering?.orderPlacedBot || '🎉 Fantastic! Your order #{orderNumber} has been placed successfully! I\'ll send you updates as we process your laundry.').replace('{orderNumber}', order.orderNumber));
      
      toast({
        title: "Order placed successfully!",
        description: `Your order #${order.orderNumber} has been submitted.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Order failed",
        description: error.message || "Unable to place order. Please try again.",
        variant: "destructive",
      });
      addBotMessage(t.customerOrdering?.orderPlaceErrorBot || "I'm sorry, there was an issue placing your order. Please try again or contact our support team.");
    },
  });

  if (isAuthLoading || branchLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
              <p className="text-muted-foreground">{t.customerOrdering?.settingUp || 'Setting up your smart ordering assistant...'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated || !customer || !branch) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertDescription>
                Unable to load ordering interface. Please try scanning the QR code again.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header with progress */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="bg-blue-100 dark:bg-blue-900/20 p-1.5 rounded-lg">
                <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="font-semibold text-sm">{branch.name}</h1>
                <p className="text-xs text-muted-foreground">{t.customerOrdering?.assistantTitle || "Smart Laundry Assistant"}</p>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <LanguageSelector />
              {orderState.cart.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">{formatCurrency(orderState.total)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOrderState(prev => ({ ...prev, step: 'cart_review' }))}
                    className="relative"
                    data-testid="button-view-cart"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 text-xs">
                      {orderState.cart.length}
                    </Badge>
                  </Button>
                </>
              )}
            </div>
          </div>
          <Progress value={getProgress()} className="h-1" />
        </div>
      </div>

      {/* Main content - Chat Interface */}
      <div className="max-w-md mx-auto">
        {/* Chat Messages Area */}
        <div className="h-[calc(100vh-120px)] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {orderState.chatMessages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.type === 'bot' && (
                  <div className="bg-blue-100 dark:bg-blue-900/20 p-2 rounded-full mr-2 flex-shrink-0">
                    <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  message.type === 'user' 
                    ? 'bg-blue-600 text-white ml-auto' 
                    : 'bg-white dark:bg-gray-800 border'
                }`}>
                  <p className="text-sm">{message.content}</p>
                  {message.options && message.options.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.options.map((option) => (
                        <Button
                          key={option.id}
                          variant="outline"
                          size="sm"
                          onClick={option.action}
                          className="w-full justify-start"
                          data-testid={`button-${option.id}`}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                {message.type === 'user' && (
                  <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-full ml-2 flex-shrink-0">
                    <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Current Step Interface */}
          <div className="border-t bg-white dark:bg-gray-800 p-4">
            {/* Item Selection Interface */}
            {orderState.step === "item_selection" && (
              <div className="space-y-3">
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">{t.customerOrdering?.chooseItemsTitle || "Choose Your Items"}</h3>
                  <p className="text-sm text-muted-foreground">{t.customerOrdering?.chooseItemsSubtitle || "Select the clothing items you'd like to clean"}</p>
                </div>
                
                {itemsLoading ? (
                  <div className="text-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{t.customerOrdering?.loadingItems || "Loading available items..."}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                    {clothingItems.map((item) => (
                      <Button
                        key={item.id}
                        variant="outline"
                        className="h-auto p-3 flex flex-col items-center space-y-2"
                        onClick={() => selectClothingItem(item)}
                        data-testid={`button-item-${item.id}`}
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl.startsWith('/') ? item.imageUrl : `/${item.imageUrl}`}
                            alt={item.name}
                            className="w-12 h-12 rounded object-cover"
                          />
                        ) : (
                          <Shirt className="h-12 w-12 text-gray-400" />
                        )}
                        <span className="text-xs text-center">{item.name}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Service Selection Interface */}
            {orderState.step === "service_selection" && orderState.selectedClothingItem && (
              <div className="space-y-3">
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">{t.customerOrdering?.chooseServiceTitle || "Choose Service"}</h3>
                  <p className="text-sm text-muted-foreground">
                    How would you like your <strong>{orderState.selectedClothingItem.name}</strong> cleaned?
                  </p>
                </div>
                
                {servicesLoading ? (
                  <div className="text-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{t.customerOrdering?.loadingServices || "Loading services..."}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {services.map((service) => (
                      <Button
                        key={service.id}
                        variant="outline"
                        className="w-full h-auto p-4 flex justify-between items-center"
                        onClick={() => selectService(service)}
                        data-testid={`button-service-${service.id}`}
                      >
                        <div className="text-left">
                          <div className="font-medium">{service.name}</div>
                          {service.description && (
                            <div className="text-sm text-muted-foreground">{service.description}</div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-blue-600">
                            {formatCurrency(parseFloat(service.itemPrice))}
                          </div>
                          <div className="text-xs text-muted-foreground">{t.customerOrdering?.perItem || 'per item'}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quantity Selection Interface */}
            {orderState.step === "quantity_selection" && (
              <div className="space-y-4">
                <div className="text-center">
                  <h3 className="font-medium text-lg">{t.customerOrdering?.howManyItems || 'How many items?'}</h3>
                  <p className="text-sm text-muted-foreground">
                    {orderState.selectedClothingItem?.name} • {orderState.selectedService?.name}
                  </p>
                </div>
                
                <div className="flex items-center justify-center space-x-4">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setOrderState(prev => ({ 
                      ...prev, 
                      selectedQuantity: Math.max(1, prev.selectedQuantity - 1) 
                    }))}
                    disabled={orderState.selectedQuantity <= 1}
                    className="h-12 w-12"
                    data-testid="button-decrease-quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold">{orderState.selectedQuantity}</div>
                    <div className="text-sm text-muted-foreground">{t.customerOrdering?.itemsLabel || 'items'}</div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setOrderState(prev => ({ 
                      ...prev, 
                      selectedQuantity: prev.selectedQuantity + 1 
                    }))}
                    className="h-12 w-12"
                    data-testid="button-increase-quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
                  <div className="text-sm text-muted-foreground mb-1">{t.customerOrdering?.totalPrice || 'Total Price'}</div>
                  <div className="text-2xl font-bold">
                    {formatCurrency(parseFloat(services.find(s => s.id === orderState.selectedService!.id)?.itemPrice || "0") * orderState.selectedQuantity)}
                  </div>
                </div>

                <Button 
                  onClick={() => addToCart()}
                  className="w-full" 
                  size="lg"
                  data-testid="button-add-to-cart"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t.customerOrdering?.addToCart || 'Add to Cart'}
                </Button>
              </div>
            )}

            {/* Cart Review Interface */}
            {orderState.step === "cart_review" && (
              <div className="space-y-3">
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">{t.customerOrdering?.yourOrder || 'Your Order'}</h3>
                  <p className="text-sm text-muted-foreground">{t.customerOrdering?.reviewSelected || 'Review your selected items'}</p>
                </div>
                
                {orderState.cart.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {orderState.cart.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.quantity}x {item.clothingItemName}</div>
                          <div className="text-xs text-muted-foreground">{item.serviceName}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm">{formatCurrency(item.totalPrice)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFromCart(index)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                            data-testid={`button-remove-${index}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    <div className="border-t pt-3 mt-3">
                      <div className="flex justify-between items-center font-medium">
                        <span>{t.customerOrdering?.subtotal || 'Subtotal:'}</span>
                        <span>{formatCurrency(orderState.cart.reduce((sum, item) => sum + item.totalPrice, 0))}</span>
                      </div>
                      {orderState.deliveryFee > 0 && (
                        <div className="flex justify-between items-center text-sm text-muted-foreground">
                          <span>{t.customerOrdering?.deliveryFee || 'Delivery fee:'}</span>
                          <span>{formatCurrency(orderState.deliveryFee)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center font-bold text-lg">
                        <span>{t.customerOrdering?.total || 'Total:'}</span>
                        <span className="text-blue-600">{formatCurrency(orderState.total)}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{t.customerOrdering?.cartEmpty || 'Your cart is empty'}</p>
                  </div>
                )}
              </div>
            )}

            {/* Address Collection Interface */}
            {orderState.step === "address_collection" && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">{t.customerOrdering?.deliveryAddress || 'Delivery Address'}</h3>
                  <p className="text-sm text-muted-foreground">{t.customerOrdering?.collectDeliveryInfo || 'Let me collect your delivery information'}</p>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="address-label"
                    >
                      {t.customerOrdering?.addressLabel || 'Address Label'}
                    </label>
                    <Input
                      id="address-label"
                      placeholder={t.customerOrdering?.addressLabelPlaceholder || 'e.g., Home, Office, etc.'}
                      value={orderState.newAddress?.label || ''}
                      onChange={(e) => setOrderState(prev => ({
                        ...prev,
                        newAddress: { ...prev.newAddress!, label: e.target.value }
                      }))}
                      data-testid="input-address-label"
                    />
                  </div>
                  
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="governorate"
                      id="governorate-label"
                    >
                      {t.customerOrdering?.governorate || 'Governorate'}
                    </label>
                    <Select
                      value={orderState.newAddress?.governorateId || ''}
                      onValueChange={(value) => setOrderState(prev => ({
                        ...prev,
                        newAddress: { ...prev.newAddress!, governorateId: value, cityId: '' }
                      }))}
                    >
                      <SelectTrigger
                        id="governorate"
                        aria-labelledby="governorate-label"
                        data-testid="select-governorate"
                      >
                        <SelectValue placeholder={t.customerOrdering?.selectGovernorate || 'Select governorate'} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(groupedCities).map(({ governorate }) => (
                          <SelectItem key={governorate.id} value={governorate.id}>
                            {governorate.nameEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {orderState.newAddress?.governorateId && (
                    <div>
                      <label
                        className="text-sm font-medium"
                        htmlFor="area"
                        id="area-label"
                      >
                        {t.customerOrdering?.area || 'Area'}
                      </label>
                      <Select
                        value={orderState.newAddress?.cityId || ''}
                        onValueChange={(value) => setOrderState(prev => ({
                          ...prev,
                          newAddress: { ...prev.newAddress!, cityId: value }
                        }))}
                      >
                        <SelectTrigger
                          id="area"
                          aria-labelledby="area-label"
                          data-testid="select-area"
                        >
                          <SelectValue placeholder={t.customerOrdering?.selectArea || 'Select area'} />
                        </SelectTrigger>
                        <SelectContent>
                          {groupedCities[orderState.newAddress.governorateId]?.areas.map((area) => (
                            <SelectItem key={area.id} value={area.id}>
                              {area.nameEn}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="street-address"
                    >
                      {t.customerOrdering?.streetAddress || 'Street Address'}
                    </label>
                    <Input
                      id="street-address"
                      placeholder={t.customerOrdering?.streetPlaceholder || 'Enter your street address'}
                      value={orderState.newAddress?.street || ''}
                      onChange={(e) => setOrderState(prev => ({
                        ...prev,
                        newAddress: { ...prev.newAddress!, street: e.target.value }
                      }))}
                      data-testid="input-street"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="block"
                      placeholder={t.customerOrdering?.blockPlaceholder || 'Block (optional)'}
                      value={orderState.newAddress?.block || ''}
                      onChange={(e) => setOrderState(prev => ({
                        ...prev,
                        newAddress: { ...prev.newAddress!, block: e.target.value }
                      }))}
                      data-testid="input-block"
                    />
                    <Input
                      id="building"
                      placeholder={t.customerOrdering?.buildingPlaceholder || 'Building (optional)'}
                      value={orderState.newAddress?.building || ''}
                      onChange={(e) => setOrderState(prev => ({
                        ...prev,
                        newAddress: { ...prev.newAddress!, building: e.target.value }
                      }))}
                      data-testid="input-building"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="floor"
                      placeholder={t.customerOrdering?.floorPlaceholder || 'Floor (optional)'}
                      value={orderState.newAddress?.floor || ''}
                      onChange={(e) => setOrderState(prev => ({
                        ...prev,
                        newAddress: { ...prev.newAddress!, floor: e.target.value }
                      }))}
                      data-testid="input-floor"
                    />
                    <Input
                      id="apartment"
                      placeholder={t.customerOrdering?.apartmentPlaceholder || 'Apartment (optional)'}
                      value={orderState.newAddress?.apartment || ''}
                      onChange={(e) => setOrderState(prev => ({
                        ...prev,
                        newAddress: { ...prev.newAddress!, apartment: e.target.value }
                      }))}
                      data-testid="input-apartment"
                    />
                  </div>
                  
                  <div>
                    <label
                      className="text-sm font-medium"
                      htmlFor="additional-info"
                    >
                      {t.customerOrdering?.additionalInfo || 'Additional Info (Optional)'}
                    </label>
                    <Textarea
                      id="additional-info"
                      placeholder={t.customerOrdering?.additionalInfoPlaceholder || 'Any special delivery instructions...'}
                      value={orderState.newAddress?.additionalInfo || ''}
                      onChange={(e) => setOrderState(prev => ({
                        ...prev,
                        newAddress: { ...prev.newAddress!, additionalInfo: e.target.value }
                      }))}
                      data-testid="textarea-additional-info"
                    />
                  </div>
                  
                  <Button
                    onClick={() => {
                      if (orderState.newAddress?.label && orderState.newAddress?.street && 
                          orderState.newAddress?.governorateId && orderState.newAddress?.cityId) {
                        createAddressMutation.mutate(orderState.newAddress);
                      } else {
                        toast({
                          title: t.customerOrdering?.missingInfo || 'Missing information',
                          description: t.customerOrdering?.fillRequired || 'Please fill in all required fields',
                          variant: "destructive"
                        });
                      }
                    }}
                    disabled={createAddressMutation.isPending}
                    className="w-full"
                    data-testid="button-save-address"
                  >
                    {createAddressMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {t.customerOrdering?.saveAddressContinue || 'Save Address & Continue'}
                  </Button>
                </div>
              </div>
            )}

            {/* Address Selection Interface */}
            {orderState.step === "address_selection" && (
              <div className="space-y-3">
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">{t.customerOrdering?.chooseDeliveryAddress || 'Choose Delivery Address'}</h3>
                  <p className="text-sm text-muted-foreground">{t.customerOrdering?.selectDeliveryWhere || "Select where you'd like your order delivered"}</p>
                </div>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {addresses.map((address) => (
                    <Button
                      key={address.id}
                      variant="outline"
                      className={`w-full h-auto p-4 justify-start ${
                        orderState.selectedAddress?.id === address.id ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20' : ''
                      }`}
                      onClick={() => selectAddress(address)}
                      data-testid={`button-address-${address.id}`}
                    >
                      <div className="flex items-start space-x-3 w-full">
                        <MapPin className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 text-left">
                          <div className="font-medium">{address.label}</div>
                          <div className="text-sm text-muted-foreground">{address.address}</div>
                        </div>
                        {orderState.selectedAddress?.id === address.id && (
                          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        )}
                      </div>
                    </Button>
                  ))}
                  
                  <Button
                    variant="outline"
                    className="w-full h-auto p-4 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                    onClick={() => {
                      setOrderState(prev => ({ ...prev, isCreatingNewAddress: true, step: 'address_collection', newAddress: { label: '', street: '', area: '', governorateId: '', cityId: '' } }));
                      addUserMessage(t.customerOrdering?.addNewAddress || 'Add New Address');
                      addBotMessage(t.customerOrdering?.addNewAddressBot || "I'll help you add a new delivery address. Let's start with some basic information.");
                    }}
                    data-testid="button-add-address"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    {t.customerOrdering?.addNewAddress || 'Add New Address'}
                  </Button>
                </div>
              </div>
            )}

            {/* Payment Selection Interface */}
            {orderState.step === "payment_selection" && (
              <div className="space-y-3">
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">{t.customerOrdering?.paymentMethod || 'Payment Method'}</h3>
                  <p className="text-sm text-muted-foreground">{t.customerOrdering?.howPay || 'How would you like to pay?'}</p>
                </div>
                
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {paymentMethods.map((method: any) => (
                    <Button
                      key={method.method}
                      variant="outline"
                      className={`w-full h-auto p-4 justify-start ${
                        orderState.paymentMethod === method.method ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20' : ''
                      }`}
                      onClick={() => selectPaymentMethod(method.method)}
                      data-testid={`button-payment-${method.method}`}
                    >
                      <div className="flex items-center space-x-3 w-full">
                        <DollarSign className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div className="flex-1 text-left">
                          <div className="font-medium capitalize">{method.method.replace('_', ' ')}</div>
                          <div className="text-sm text-muted-foreground">
                            {method.method === 'cash' && (t.customerOrdering?.payCashDesc || 'Pay cash when order is delivered')}
                            {method.method === 'card' && (t.customerOrdering?.payCardDesc || 'Pay with card when order is delivered')}
                            {method.method === 'knet' && (t.customerOrdering?.payKnetDesc || 'Pay online with KNET')}
                            {method.method === 'credit_card' && (t.customerOrdering?.payCreditCardDesc || 'Pay online with credit card')}
                            {method.method === 'pay_later' && (t.customerOrdering?.payLaterDesc || 'Add to your account balance')}
                          </div>
                        </div>
                        {orderState.paymentMethod === method.method && (
                          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Order Summary Interface */}
            {orderState.step === "order_summary" && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <h3 className="font-medium text-lg">{t.customerOrdering?.orderSummary || 'Order Summary'}</h3>
                  <p className="text-sm text-muted-foreground">{t.customerOrdering?.reviewCompleteOrder || 'Review your complete order'}</p>
                </div>
                
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <h4 className="font-medium mb-2 text-sm">{(t.customerOrdering?.itemsCount || 'Items') + ` (${orderState.cart.length})`}</h4>
                    {orderState.cart.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm py-1">
                        <span>{item.quantity}x {item.clothingItemName} ({item.serviceName})</span>
                        <span className="font-medium">{formatCurrency(item.totalPrice)}</span>
                      </div>
                    ))}
                  </div>
                  
                  {orderState.selectedAddress && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <h4 className="font-medium mb-2 text-sm flex items-center">
                        <MapPin className="h-4 w-4 mr-1" />
                        {t.customerOrdering?.deliveryAddress || 'Delivery Address'}
                      </h4>
                      <p className="text-sm font-medium">{orderState.selectedAddress.label}</p>
                      <p className="text-sm text-muted-foreground">{orderState.selectedAddress.address}</p>
                    </div>
                  )}
                  
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <h4 className="font-medium mb-2 text-sm flex items-center">
                      <CreditCard className="h-4 w-4 mr-1" />
                      {t.customerOrdering?.paymentMethod || 'Payment Method'}
                    </h4>
                    <p className="text-sm capitalize">{orderState.paymentMethod?.replace('_', ' ')}</p>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{t.customerOrdering?.subtotal || 'Subtotal:'}</span>
                        <span>{formatCurrency(orderState.cart.reduce((sum, item) => sum + item.totalPrice, 0))}</span>
                      </div>
                      {orderState.deliveryFee > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>{t.customerOrdering?.deliveryFee || 'Delivery fee:'}</span>
                          <span>{formatCurrency(orderState.deliveryFee)}</span>
                        </div>
                      )}
                      <Separator />
                      <div className="flex justify-between font-bold text-lg">
                        <span>{t.customerOrdering?.total || 'Total:'}</span>
                        <span className="text-blue-600">{formatCurrency(orderState.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setOrderState(prev => ({ ...prev, step: "payment_selection" }))}
                    className="flex-1"
                    data-testid="button-back-to-payment"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t.customerOrdering?.back || 'Back'}
                  </Button>
                  <Button 
                    onClick={() => placeOrderMutation.mutate()}
                    disabled={placeOrderMutation.isPending}
                    className="flex-1"
                    data-testid="button-confirm-order"
                  >
                    {placeOrderMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    )}
                    {t.customerOrdering?.placeOrder || 'Place Order'}
                  </Button>
                </div>
              </div>
            )}
            
            {/* Order Confirmation Interface */}
            {orderState.step === "confirmation" && (
              <div className="text-center space-y-4">
                <div className="mx-auto mb-4 p-4 bg-green-100 dark:bg-green-900/20 rounded-full w-fit">
                  <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-bold text-xl text-green-600">{t.customerOrdering?.orderConfirmed || 'Order Confirmed!'}</h3>
                <p className="text-sm text-muted-foreground">
                  {t.customerOrdering?.orderPlacedMessage || "Your order has been successfully placed. You'll receive updates as we process your laundry."}
                </p>
                <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
                  <p className="text-sm font-medium">{t.customerOrdering?.estimatedDelivery || 'Estimated delivery: 2-3 business days'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.customerOrdering?.smsUpdates || "You'll receive SMS updates about your order status"}
                  </p>
                </div>
                <Button 
                  onClick={() => setLocation('/')}
                  className="w-full"
                  data-testid="button-done"
                >
                  {t.customerOrdering?.done || 'Done'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomerOrderingPage() {
  return (
    <CustomerAuthProvider>
      <CustomerOrderingContent />
    </CustomerAuthProvider>
  );
}
