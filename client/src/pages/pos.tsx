import React, { useEffect, useMemo, useState, Suspense } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { POSHeader } from "@/components/pos-header";
import { POSSidebar } from "@/components/pos-sidebar";
import { ProductGrid } from "@/components/product-grid";
import { LaundryCartSidebar } from "@/components/laundry-cart-sidebar";
import { ServiceSelectionModal } from "@/components/service-selection-modal";
import { ReceiptModal } from "@/components/receipt-modal";
import { InventoryManagement } from "@/components/inventory/InventoryManagement";
import { ReportsDashboard } from "@/components/reports-dashboard";
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
import CardGrid, { type CardGridCard } from "@/components/layout/CardGrid";
import { GlossaryTooltip, useTour } from "@/components/onboarding/TourProvider";

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
  const { registerTour, startTour, isTourDismissed, registerGlossaryEntries } = useTour();

  useEffect(() => {
    registerGlossaryEntries([
      {
        term: "Progressive disclosure",
        description: "Operators expand accordions to reveal advanced POS tools only when they need them.",
      },
      {
        term: "Session checklist",
        description: "Persistent reminders that ensure every order is complete before handoff.",
      },
    ]);
    const cleanup = registerTour({
      id: "pos-sales",
      title: "POS workspace tour",
      description: "Learn how the new card layout guides selling workflows.",
      steps: [
        {
          id: "pos-card-grid",
          title: "Card-based layout",
          description: "Each card holds a major task. Expand sections to reveal catalog tools and cart management.",
        },
        {
          id: "pos-accordion",
          title: "Catalog to checkout",
          description: "Use the catalog accordion to add items, then jump to the checkout accordion without leaving the page.",
        },
        {
          id: "pos-checklist",
          title: "Session checklist",
          description: "Track payment, coupons, and receipts so no detail is missed.",
        },
      ],
    });
    if (!isTourDismissed("pos-sales")) {
      startTour("pos-sales");
    }
    return () => cleanup();
  }, [isTourDismissed, registerGlossaryEntries, registerTour, startTour]);

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
        // Ensure receipts for transactions display customer info (e.g., Walk-in)
        const txWithCustomer = {
          ...transaction,
          customerId: transaction?.customerId ?? order?.customerId,
          customerName: (transaction as any)?.customerName ?? order?.customerName,
        };
        setCurrentTransaction(buildReceiptData(txWithCustomer, branch as any, user));
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

    // Use selected customer; if none selected, server will auto-assign Walk-in
    const customer = selectedCustomer || null;
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
      customerId: customer?.id, // let server default to Walk-in when undefined
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
      customerId: customer?.id || undefined,
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
        <div className={"grid grid-cols-6 h-16"}>
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

  const paymentSummary = useMemo(() => {
    switch (paymentMethod) {
      case "cash":
        return "Cash";
      case "card":
        return "Card";
      case "pay_later":
      default:
        return "Pay later";
    }
  }, [paymentMethod]);

  const salesCards = useMemo<CardGridCard[]>(() => {
    return [
      {
        id: "sales-workspace",
        title: "Sales workspace",
        description: "Guide every order from catalog selection to checkout without leaving the page.",
        icon: <ShoppingCart className="size-5" aria-hidden="true" />,
        accent: "primary",
        accordionSections: [
          {
            id: "sales-catalog",
            title: "Catalog & services",
            summary: `Items in cart: ${cartSummary.itemCount}`,
            defaultOpen: true,
            content: (
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className="flex-1">
                  <ProductGrid
                    onAddToCart={handleSelectClothingItem}
                    cartItemCount={cartSummary.itemCount}
                    onToggleCart={toggleCart}
                    branchCode={branch?.code}
                  />
                </div>
                <div className="lg:w-[26rem]">
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
                    appliedCoupon={appliedCoupon}
                    couponCode={couponCode}
                    isCouponLoading={isCouponLoading}
                    couponError={couponError}
                    onApplyCoupon={applyCoupon}
                    onRemoveCoupon={removeCoupon}
                    setCouponCode={setCouponCode}
                  />
                </div>
              </div>
            ),
          },
          {
            id: "sales-summary",
            title: "Session summary",
            summary: `Current total: ${formatCurrency(cartSummary.total)}`,
            content: (
              <div className="space-y-3 text-[var(--text-sm)] text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Payment method:</span> {paymentSummary}
                </div>
                <div>
                  <span className="font-medium text-foreground">Customer:</span> {selectedCustomer?.name ?? "Walk-in"}
                </div>
                <div>
                  <span className="font-medium text-foreground">Coupon:</span> {appliedCoupon?.code ?? "None"}
                  {couponError ? <span className="ml-2 text-destructive">{couponError}</span> : null}
                </div>
                <div>
                  <span className="font-medium text-foreground">Cart items:</span> {cartSummary.items.length}
                </div>
              </div>
            ),
          },
        ],
        checklist: [
          {
            id: "select-customer",
            label: "Confirm customer profile",
            description: "Select or create the customer before adding loyalty rewards.",
          },
          {
            id: "apply-coupon",
            label: "Check for active coupons",
            description: "Search for campaign codes before finishing payment.",
          },
          {
            id: "send-receipt",
            label: "Send a digital receipt",
            description: "Email or SMS the receipt immediately after payment posts.",
          },
        ],
        persistChecklistKey: "pos-sales",
      },
    ];
  }, [
    appliedCoupon?.code,
    applyCoupon,
    branch?.code,
    cartSummary.itemCount,
    cartSummary.items.length,
    cartSummary.total,
    clearCart,
    couponCode,
    couponError,
    formatCurrency,
    getCartSummary,
    handleCheckout,
    handleSelectClothingItem,
    isCartVisible,
    isCouponLoading,
    paymentMethod,
    paymentSummary,
    removeCoupon,
    removeFromCart,
    selectedCustomer,
    setPaymentMethod,
    setSelectedCustomer,
    setCouponCode,
    toggleCart,
    updateQuantity,
  ]);

  const viewCards = useMemo<CardGridCard[]>(() => {
    switch (activeView) {
      case "sales":
        return salesCards;
      case "customers":
        return [
          {
            id: "customers",
            title: "Customer management",
            description: "Search, edit, and assign customers during checkout.",
            icon: <Users className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "customers-workspace",
                title: "Customer workspace",
                summary: "Locate customers, update records, and attach to the active sale.",
                defaultOpen: true,
                content: (
                  <CustomerManagement
                    onCustomerSelect={(customer) => {
                      setSelectedCustomer(customer);
                      setActiveView("sales");
                    }}
                  />
                ),
              },
            ],
            checklist: [
              {
                id: "verify-contact",
                label: "Verify contact details",
                description: "Confirm phone and address before scheduling delivery.",
              },
              {
                id: "check-loyalty",
                label: "Review loyalty status",
                description: "Mention available rewards to boost retention.",
              },
              {
                id: "note-preferences",
                label: "Capture customer preferences",
                description: "Record fabric care notes or delivery instructions.",
              },
            ],
            persistChecklistKey: "pos-customers",
          },
        ];
      case "orders":
        return [
          {
            id: "orders",
            title: "Order tracking",
            description: "Monitor live order status without leaving the POS.",
            icon: <Truck className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "orders-feed",
                title: "Active orders",
                summary: "See real-time updates for in-store and delivery orders.",
                defaultOpen: true,
                content: <OrderTracking />,
              },
            ],
            checklist: [
              {
                id: "update-status",
                label: "Update delayed orders",
                description: "Notify customers proactively when pickups slip.",
              },
              {
                id: "confirm-delivery",
                label: "Confirm delivery windows",
                description: "Double-check driver assignments for rush orders.",
              },
            ],
            persistChecklistKey: "pos-orders",
          },
        ];
      case "order-management":
        return [
          {
            id: "order-management",
            title: "Operations dashboard",
            description: "Batch manage tickets, SLAs, and escalations.",
            icon: <TrendingUp className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "order-management-workspace",
                title: "Management workspace",
                summary: "Bulk actions and escalations for complex orders.",
                defaultOpen: true,
                content: (
                  <Suspense fallback={<LoadingScreen message="Loading order management..." />}>
                    <OrderManagementDashboard />
                  </Suspense>
                ),
              },
            ],
            checklist: [
              {
                id: "audit-sla",
                label: "Audit SLA breaches",
                description: "Resolve escalations before close of business.",
              },
              {
                id: "assign-followup",
                label: "Assign follow-up",
                description: "Route complex issues to the right owner.",
              },
            ],
            persistChecklistKey: "pos-order-management",
          },
        ];
      case "packages":
        return [
          {
            id: "packages",
            title: "Package center",
            description: "Manage bundles and let the assistant answer questions.",
            icon: <Package className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "packages-workspace",
                title: "Package catalog",
                summary: "Create, edit, and review package usage.",
                defaultOpen: true,
                content: (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button onClick={() => setShowChatbot((prev) => !prev)} variant="outline" size="sm">
                        {showChatbot ? "Hide assistant" : "Open package assistant"}
                      </Button>
                    </div>
                    <PackageList />
                    <PackageChatbot open={showChatbot} onClose={() => setShowChatbot(false)} />
                  </div>
                ),
              },
            ],
            checklist: [
              {
                id: "package-refresh",
                label: "Refresh bundle pricing",
                description: "Ensure discounts match current promotions.",
              },
              {
                id: "assistant-demo",
                label: "Demo assistant",
                description: "Walk teammates through the chatbot recommendations.",
              },
            ],
            persistChecklistKey: "pos-packages",
          },
        ];
      case "reports":
        return [
          {
            id: "reports",
            title: "Performance reports",
            description: "Monitor sales velocity and staff productivity.",
            icon: <BarChart3 className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "reports-dashboard",
                title: "Analytics dashboard",
                summary: "Track KPIs in real time.",
                defaultOpen: true,
                content: <ReportsDashboard />,
              },
            ],
            checklist: [
              {
                id: "share-daily",
                label: "Share daily snapshot",
                description: "Post key KPIs to the operations channel at close.",
              },
              {
                id: "watch-trends",
                label: "Watch order trends",
                description: "Compare today against last week to adjust staffing.",
              },
            ],
            persistChecklistKey: "pos-reports",
          },
        ];
      case "delivery-order-requests":
        return [
          {
            id: "delivery-requests",
            title: "Delivery requests",
            description: "Approve or reject new delivery pickups.",
            icon: <Truck className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "delivery-requests-workspace",
                title: "Requests queue",
                summary: "Process new pickup and drop-off requests.",
                defaultOpen: true,
                content: <DeliveryOrderRequests />,
              },
            ],
            checklist: [
              {
                id: "route-balance",
                label: "Balance driver routes",
                description: "Distribute pickups evenly across available drivers.",
              },
              {
                id: "confirm-window",
                label: "Confirm service window",
                description: "Verify requested times align with branch capacity.",
              },
            ],
            persistChecklistKey: "pos-delivery-requests",
          },
        ];
      case "delivery-orders":
        return [
          {
            id: "delivery-orders",
            title: "Delivery monitoring",
            description: "Track active delivery jobs and completion status.",
            icon: <Truck className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "delivery-orders-workspace",
                title: "Active deliveries",
                summary: "See driver progress and mark deliveries complete.",
                defaultOpen: true,
                content: <DeliveryOrders />,
              },
            ],
            checklist: [
              {
                id: "notify-customer",
                label: "Notify customer on completion",
                description: "Send confirmation as soon as the driver marks delivery done.",
              },
              {
                id: "flag-issues",
                label: "Flag delivery issues",
                description: "Escalate late or failed deliveries immediately.",
              },
            ],
            persistChecklistKey: "pos-delivery-orders",
          },
        ];
      case "inventory":
        return [
          {
            id: "inventory",
            title: "Inventory management",
            description: "Track stock levels and adjust availability.",
            icon: <Settings className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "inventory-workspace",
                title: "Inventory workspace",
                summary: "Adjust stock and sync with suppliers.",
                defaultOpen: true,
                content: <InventoryManagement />,
              },
            ],
            checklist: [
              {
                id: "reorder-points",
                label: "Review reorder points",
                description: "Update thresholds after major promotions.",
              },
              {
                id: "sync-suppliers",
                label: "Sync with suppliers",
                description: "Send purchase orders for low-stock categories.",
              },
            ],
            persistChecklistKey: "pos-inventory",
          },
        ];
      case "settings":
        return [
          {
            id: "settings",
            title: "System settings",
            description: "Configure receipt printing, taxes, and integrations.",
            icon: <Settings className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "settings-panel",
                title: "Settings workspace",
                summary: "Adjust POS defaults and integrations.",
                defaultOpen: true,
                content: <SystemSettings />,
              },
            ],
            checklist: [
              {
                id: "backup-config",
                label: "Backup configuration",
                description: "Export settings after making critical changes.",
              },
              {
                id: "announce-change",
                label: "Announce changes",
                description: "Notify staff about new hardware or policy updates.",
              },
            ],
            persistChecklistKey: "pos-settings",
          },
        ];
      default:
        return [];
    }
  }, [
    activeView,
    salesCards,
    setSelectedCustomer,
    showChatbot,
    setShowChatbot,
    setActiveView,
  ]);

  const currentCards = viewCards.length ? viewCards : [
    {
      id: "upcoming",
      title: "Coming soon",
      description: "This module is under development.",
      icon: <Settings className="size-5" aria-hidden="true" />,
      accordionSections: [
        {
          id: "upcoming-overview",
          title: "Preview",
          summary: "Stay tuned for updates.",
          defaultOpen: true,
          content: (
            <p className="text-[var(--text-sm)] text-muted-foreground">
              We&apos;re actively building this workspace. Use the command palette (⌘K / Ctrl+K) to submit feedback.
            </p>
          ),
        },
      ],
      checklist: [
        {
          id: "share-feedback",
          label: "Share feedback",
          description: "Open the command palette and log your feature request.",
        },
      ],
      persistChecklistKey: "pos-upcoming",
    },
  ];

  return (
    <div className="flex h-screen flex-col bg-[var(--pos-background)]">
      <POSHeader cartItemCount={cartSummary.itemCount} onToggleCart={toggleCart} />

      <div className="hidden border-b bg-[var(--surface-elevated)] px-6 py-3 text-[var(--text-sm)] text-muted-foreground lg:flex lg:items-center lg:justify-between">
        <span>
          Work the shift with <GlossaryTooltip term="Progressive disclosure" className="ml-1" /> and a persistent
          <GlossaryTooltip term="Session checklist" className="ml-1" />.
        </span>
        <LanguageSelector />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <POSSidebar activeView={activeView} onViewChange={setActiveView} />

        <main className="flex-1 overflow-y-auto bg-[var(--surface-muted)]">
          <div className="px-4 py-6 lg:px-8">
            <CardGrid cards={currentCards} columns={{ base: 1 }} className="pb-24" />
          </div>
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
