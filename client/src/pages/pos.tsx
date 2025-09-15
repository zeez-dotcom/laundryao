import React, { useState, Suspense } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { POSHeader } from "@/components/pos-header";
import { POSSidebar } from "@/components/pos-sidebar";
import { ProductGrid } from "@/components/product-grid";
import { LaundryCartSidebar } from "@/components/laundry-cart-sidebar";
import { ServiceSelectionModal } from "@/components/service-selection-modal";
import { ReceiptModal } from "@/components/receipt-modal";
import { InventoryManagement } from "@/components/inventory/InventoryManagement";
import { ReportsDashboard } from "@/components/reports-dashboard";
import { SettingsPanel } from "@/components/settings-panel";
import { CustomerManagement } from "@/components/customer-management";
import { OrderTracking } from "@/components/order-tracking";
import { DeliveryOrderRequests } from "@/components/branch/DeliveryOrderRequests";
import { DeliveryOrders } from "@/components/branch/DeliveryOrders";
import LoadingScreen from "@/components/common/LoadingScreen";
import { PackageList } from "@/components/package-list";
import PackageChatbot from "@/components/PackageChatbot";
import { useLaundryCart } from "@/hooks/use-laundry-cart";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, postOrder } from "@/lib/queryClient";
import { getTaxRate } from "@/lib/tax";
import { LanguageSelector } from "@/components/language-selector";
import { useCurrency } from "@/lib/currency";
import { SystemSettings } from "@/components/system-settings";
import { ClothingItem, LaundryService, Customer } from "@shared/schema";
import { ShoppingCart, Package, BarChart3, Settings, Users, Truck, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/context/AuthContext";
import { useTranslationContext } from "@/context/TranslationContext";
import { buildReceiptData } from "@/lib/receipt";

const OrderManagementDashboard = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/branch/OrderManagementDashboard").then(
    (m) => ({ default: m.OrderManagementDashboard })
  )
);

export default function POS() {
  const [activeView, setActiveView] = useState("sales");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCartVisible, setIsCartVisible] = useState(true); // Always visible on desktop, togglable on mobile
  const [currentTransaction, setCurrentTransaction] = useState<any | null>(null);
  const [currentOrder, setCurrentOrder] = useState<any | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedClothingItem, setSelectedClothingItem] = useState<ClothingItem | null>(null);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [printInfo, setPrintInfo] = useState<{ printNumber: number; printedAt: string } | null>(null);
  const [showChatbot, setShowChatbot] = useState(false);
  
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const { user, branch } = useAuthContext();
  const username = user?.username || "POS User";
  const { t } = useTranslationContext();
  
  const {
    cartItems,
    paymentMethod,
    setPaymentMethod,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getCartSummary,
    // Coupon functionality
    appliedCoupon,
    couponCode,
    isCouponLoading,
    couponError,
    applyCoupon,
    removeCoupon,
    setCouponCode
  } = useLaundryCart();

  const cartSummary = getCartSummary();

  const checkoutMutation = useMutation({
    mutationFn: async ({ order, transaction }: { order: any; transaction?: any }) => {
      const orderRes = await postOrder(order);
      const createdOrder = await orderRes.json();
      let recordedTransaction = null;
      if (transaction) {
        const txRes = await apiRequest("POST", "/api/transactions", {
          ...transaction,
          orderId: createdOrder.id,
        });
        recordedTransaction = await txRes.json();
      }
      return { order: createdOrder, transaction: recordedTransaction };
    },
    onSuccess: async ({ order, transaction }) => {
      setCurrentOrder(buildReceiptData(order, branch as any, user));
      if (transaction) {
        setCurrentTransaction(buildReceiptData(transaction, branch as any, user));
        toast({
          title: "Order completed successfully",
          description: `Total: ${formatCurrency(order.total)}`,
        });
      } else {
        setCurrentTransaction(null);
        toast({
          title: "Order created successfully",
          description: `Pay-later order for ${order.customerName} has been created`,
        });
      }

      try {
        const res = await apiRequest("POST", `/api/orders/${order.id}/print`);
        const record = await res.json();
        setPrintInfo(record);
      } catch {
        setPrintInfo(null);
      }
      setIsReceiptModalOpen(true);
      clearCart();
      setSelectedCustomer(null);
      queryClient.invalidateQueries({ queryKey: ["/api/clothing-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/laundry-services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to process order",
        variant: "destructive",
      });
    }
  });

  const handleSelectClothingItem = (clothingItem: ClothingItem) => {
    setSelectedClothingItem(clothingItem);
    setIsServiceModalOpen(true);
  };

  const handleAddToCart = (clothingItem: ClothingItem, service: LaundryService, quantity: number) => {
    addToCart(clothingItem as any, service, quantity);
    toast({
      title: "Added to cart",
      description: `${quantity}x ${clothingItem.name} with ${service.name} service`,
    });
  };

  const handleCheckout = async (
    redeemedPoints: number = 0,
    readyByOption: string,
    readyByDate: Date,
    packageUsage?: {
      packageId: string;
      items: {
        serviceId: string;
        clothingItemId: string;
        quantity: number;
      }[];
    },
  ) => {
    if (cartSummary.items.length === 0) {
      toast({
        title: "Cart is empty",
        description: "Please add items to cart before checkout",
        variant: "destructive",
      });
      return;
    }

    // Get customer - use selected customer or find/create walk-in customer
    let customer = selectedCustomer;
    if (!customer) {
      // Find or create single walk-in customer for this branch
      try {
        // First try to find existing walk-in customer
        const findResponse = await fetch(`/api/customers?phoneNumber=0000000000&branchCode=${branch?.code ?? ""}`, {
          credentials: "include",
        });
        
        if (findResponse.ok) {
          const customers = await findResponse.json();
          customer = customers.find((c: any) => c.name === "Walk-in Customer");
        }
        
        // If no walk-in customer exists, create one
        if (!customer) {
          const walkInData = {
            name: "Walk-in Customer",
            phoneNumber: "0000000000", // Standard walk-in phone number
            loyaltyPoints: 0,
            totalSpent: 0,
            isActive: true
          };
          
          const createResponse = await fetch("/api/customers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(walkInData),
          });
          
          if (createResponse.ok) {
            customer = await createResponse.json();
          } else {
            toast({
              title: "Unable to process order",
              description: "Please select a customer or contact support",
              variant: "destructive",
            });
            return;
          }
        }
      } catch (error) {
        toast({
          title: "Unable to process order", 
          description: "Please select a customer and try again",
          variant: "destructive",
        });
        return;
      }
    }
    if (!branch?.code) {
      toast({
        title: "Branch required",
        description: "Branch code missing",
        variant: "destructive",
      });
      return;
    }

    // Map package usage for quick lookup
    const usageMap = new Map<string, number>();
    packageUsage?.items.forEach((u) => {
      const key = `${u.serviceId}:${u.clothingItemId}`;
      usageMap.set(key, (usageMap.get(key) || 0) + u.quantity);
    });

    let creditedAmount = 0;
    const orderItems = cartSummary.items.map(item => {
      const price = parseFloat(item.service.itemPrice ?? item.service.price);
      const key = `${item.service.id}:${item.clothingItem.id}`;
      const availableCredits = usageMap.get(key) || 0;
      const creditQty = Math.min(availableCredits, item.quantity);
      if (creditQty > 0) {
        creditedAmount += creditQty * price;
        usageMap.set(key, availableCredits - creditQty);
      }
      const chargedTotal = price * (item.quantity - creditQty);
      return {
        id: item.id,
        serviceId: item.service.id,
        clothingItemId: item.clothingItem.id,
        // Keep legacy 'name' for compatibility, but provide structured bilingual fields
        name: item.clothingItem.name,
        clothingItem: {
          name: item.clothingItem.name,
          nameAr: (item.clothingItem as any).nameAr,
        },
        service: {
          name: item.service.name,
          nameAr: (item.service as any).nameAr,
        },
        quantity: item.quantity,
        price,
        total: chargedTotal,
      };
    });

    const taxRate = getTaxRate();
    const newSubtotal = cartSummary.subtotal - creditedAmount;
    const newTax = Math.max(cartSummary.tax - creditedAmount * taxRate, 0);
    const finalTotal = Math.max(cartSummary.total - creditedAmount - creditedAmount * taxRate - redeemedPoints * 0.1, 0);
    const pointsEarned = Math.floor(finalTotal);

    const orderData = {
      cartItems: orderItems,
      customerId: customer?.id || "",
      branchCode: branch.code,
      customerName: customer?.name || "Walk-in",
      customerPhone: customer?.phoneNumber || "",
      subtotal: newSubtotal.toFixed(2),
      tax: newTax.toFixed(2),
      total: finalTotal.toFixed(2),
      paymentMethod,
      status: "start_processing",
      estimatedPickup: new Date(
        Date.now() + 3 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      readyBy: readyByDate.toISOString(),
      promisedReadyOption: readyByOption,
      promisedReadyDate: readyByDate.toISOString(),
      sellerName: username,
      loyaltyPointsEarned: pointsEarned,
      loyaltyPointsRedeemed: redeemedPoints,
      packageUsage,
    };

    const transaction = paymentMethod === "pay_later" ? undefined : {
      items: orderItems,
      subtotal: newSubtotal.toFixed(2),
      tax: newTax.toFixed(2),
      total: finalTotal.toFixed(2),
      paymentMethod,
      sellerName: username,
      customerId: customer?.id || "",
    };

    checkoutMutation.mutate({ order: orderData, transaction });
  };

  const toggleCart = () => {
    setIsCartVisible(!isCartVisible);
  };

  // Mobile Bottom Navigation
  const MobileBottomNav = () => {
    if (!isMobile) return null;
    const navItems = [
      { id: "sales", label: t.sales, icon: ShoppingCart },
      { id: "customers", label: t.customers, icon: Users },
      { id: "orders", label: t.orders, icon: Truck },
      { id: "packages", label: t.packages, icon: Package },
      { id: "reports", label: t.reports, icon: TrendingUp },
      { id: "settings", label: t.settings, icon: Settings }
    ];

    return (
      <nav className="fixed bottom-0 left-0 right-0 bg-pos-surface border-t border-gray-200 shadow-material-lg z-40">
        <div className={`grid grid-cols-${navItems.length} h-16`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            
            return (
              <Button
                key={item.id}
                variant="ghost"
                className={`flex flex-col items-center justify-center space-y-1 h-full rounded-none ${
                  isActive ? "text-pos-primary" : "text-gray-600"
                }`}
                onClick={() => setActiveView(item.id)}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </nav>
    );
  };

  // Non-sales views placeholder
  const renderActiveView = () => {
    switch (activeView) {
      case "sales":
        return (
          <>
            <ProductGrid
              onAddToCart={handleSelectClothingItem}
              cartItemCount={cartSummary.itemCount}
              onToggleCart={toggleCart}
              branchCode={branch?.code}
            />
            
            <LaundryCartSidebar
              cartSummary={cartSummary}
              getCartSummary={getCartSummary}
              paymentMethod={paymentMethod}
              selectedCustomer={selectedCustomer}
              onUpdateQuantity={updateQuantity}
              onRemoveItem={removeFromCart}
              onClearCart={clearCart}
              onSelectPayment={setPaymentMethod}
              onSelectCustomer={setSelectedCustomer}
              onCheckout={handleCheckout}
              isVisible={isCartVisible}
              onClose={() => setIsCartVisible(false)}
              // Coupon functionality
              appliedCoupon={appliedCoupon}
              couponCode={couponCode}
              isCouponLoading={isCouponLoading}
              couponError={couponError}
              onApplyCoupon={applyCoupon}
              onRemoveCoupon={removeCoupon}
              setCouponCode={setCouponCode}
            />
          </>
        );
      case "customers":
        return (
          <CustomerManagement 
            onCustomerSelect={(customer) => {
              setSelectedCustomer(customer);
              setActiveView("sales");
            }}
          />
        );
      case "orders":
        return <OrderTracking />;
      case "order-management":
        return (
          <Suspense fallback={<LoadingScreen message="Loading order management..." />}>
            <OrderManagementDashboard />
          </Suspense>
        );
      case "packages":
        return (
          <div className="flex-1 flex flex-col p-4">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowChatbot((prev) => !prev)}>
                Package Assistant
              </Button>
            </div>
            <PackageList />
            <PackageChatbot open={showChatbot} onClose={() => setShowChatbot(false)} />
          </div>
        );
      case "reports":
        return <ReportsDashboard />;
      case "delivery-order-requests":
        return <DeliveryOrderRequests />;
      case "delivery-orders":
        return <DeliveryOrders />;
      case "inventory":
        return <InventoryManagement />;
      case "settings":
        return <SystemSettings />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center bg-pos-background">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 capitalize">{activeView}</h2>
              <p className="text-gray-600">This section is under development</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-pos-background">
      <POSHeader
        cartItemCount={cartSummary.itemCount}
        onToggleCart={toggleCart}
      />

      <div className="flex flex-1 overflow-hidden">
        <POSSidebar activeView={activeView} onViewChange={setActiveView} />

        <main className={`flex-1 ${activeView === "sales" ? "flex flex-col lg:flex-row" : "flex"} overflow-hidden`}>
          {renderActiveView()}
        </main>
      </div>

      <MobileBottomNav />

      <ServiceSelectionModal
        isOpen={isServiceModalOpen}
        onClose={() => {
          setIsServiceModalOpen(false);
          setSelectedClothingItem(null);
        }}
        clothingItem={selectedClothingItem}
        onAddToCart={handleAddToCart}
        branchCode={branch?.code}
      />

      <ReceiptModal
        transaction={currentTransaction}
        order={currentOrder}
        customer={selectedCustomer}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        printNumber={printInfo?.printNumber}
        printedAt={printInfo?.printedAt}
      />
    </div>
  );
}
