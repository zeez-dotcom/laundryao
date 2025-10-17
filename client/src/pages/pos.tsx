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
import BranchSelector from "@/components/BranchSelector";
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
  const [branchOverrideCode, setBranchOverrideCode] = useState("");
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  
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

  // Basic API connectivity indicator (avoids silent CORB misroutes)
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const res = await fetch("/health", { credentials: "include", headers: { Accept: "application/json" } });
        const ok = res.ok && (res.headers.get("content-type") || "").includes("application/json");
        if (!aborted) setApiHealthy(ok);
      } catch {
        if (!aborted) setApiHealthy(false);
      }
    })();
    return () => { aborted = true; };
  }, []);

  const effectiveBranchCode = branchOverrideCode || branch?.code;

  // Small viewport fallback: open the POS workspace in a larger popup once per session
  useEffect(() => {
    if (typeof window === "undefined") return;
    const alreadyOpened = sessionStorage.getItem("posPopupOpened");
    const tooNarrow = window.innerWidth < 1200;
    const tooShort = window.innerHeight < 700;
    if (!alreadyOpened && (tooNarrow || tooShort)) {
      const w = Math.max(1200, window.innerWidth);
      const h = Math.max(800, window.innerHeight);
      const left = Math.max(0, Math.floor((screen.width - w) / 2));
      const top = Math.max(0, Math.floor((screen.height - h) / 2));
      const popup = window.open(
        "/",
        "pos-workspace",
        `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
      );
      if (popup) {
        try { popup.focus(); } catch {}
        sessionStorage.setItem("posPopupOpened", "1");
      }
    }
  }, []);
  const { registerTour, startTour, isTourDismissed, registerGlossaryEntries } = useTour();

  useEffect(() => {
    registerGlossaryEntries([
      {
        term: t.posGlossaryProgressiveDisclosureTerm,
        description: t.posGlossaryProgressiveDisclosureDescription,
      },
      {
        term: t.posGlossarySessionChecklistTerm,
        description: t.posGlossarySessionChecklistDescription,
      },
    ]);
    const cleanup = registerTour({
      id: "pos-sales",
      title: t.posTourSalesTitle,
      description: t.posTourSalesDescription,
      steps: [
        {
          id: "pos-card-grid",
          title: t.posTourSalesCardGridTitle,
          description: t.posTourSalesCardGridDescription,
        },
        {
          id: "pos-accordion",
          title: t.posTourSalesCatalogTitle,
          description: t.posTourSalesCatalogDescription,
        },
        {
          id: "pos-checklist",
          title: t.posTourSalesChecklistTitle,
          description: t.posTourSalesChecklistDescription,
        },
      ],
    });
    if (!isTourDismissed("pos-sales")) {
      startTour("pos-sales");
    }
    return () => cleanup();
  }, [
    isTourDismissed,
    registerGlossaryEntries,
    registerTour,
    startTour,
    t,
  ]);

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
          title: t.posOrderCompletedTitle,
          description: `${t.total}: ${formatCurrency(order.total)}`,
        });
      } else {
        setCurrentTransaction(null);
        toast({
          title: t.posOrderCreatedTitle,
          description: t.posPayLaterOrderCreated.replace(
            "{{customerName}}",
            order.customerName || t.posWalkInCustomer
          ),
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
        title: t.error,
        description: error?.message || t.posFailedToProcessOrder,
        variant: "destructive",
      });
    }
  });

  const handleSelectClothingItem = (clothingItem: ClothingItem) => {
    // Open service modal regardless; server will resolve branch via auth or branchCode
    setSelectedClothingItem(clothingItem);
    setIsServiceModalOpen(true);
  };

  const handleAddToCart = (clothingItem: ClothingItem, service: LaundryService, quantity: number) => {
    addToCart(clothingItem as any, service, quantity);
    toast({
      title: t.posAddedToCartTitle,
      description: t.posAddedToCartDescription
        .replace("{{quantity}}", String(quantity))
        .replace("{{itemName}}", clothingItem.name)
        .replace("{{serviceName}}", service.name),
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
        title: t.posCartEmptyTitle,
        description: t.posCartEmptyDescription,
        variant: "destructive",
      });
      return;
    }

    // Use selected customer; if none selected, server will auto-assign Walk-in
    const customer = selectedCustomer || null;
    if (!branch?.code) {
      toast({
        title: t.posBranchRequiredTitle,
        description: t.posBranchRequiredDescription,
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
        return t.cash;
      case "card":
        return t.card;
      case "pay_later":
      default:
        return t.payLater;
    }
  }, [paymentMethod, t]);

  const salesCards = useMemo<CardGridCard[]>(() => {
    return [
      {
        id: "sales-workspace",
        title: t.posSalesWorkspaceTitle,
        description: t.posSalesWorkspaceDescription,
        icon: <ShoppingCart className="size-5" aria-hidden="true" />,
        accent: "primary",
        accordionSections: [
          {
            id: "sales-catalog",
            title: t.posSalesCatalogTitle,
            summary: t.posSalesCatalogSummary.replace(
              "{{count}}",
              String(cartSummary.itemCount),
            ),
            defaultOpen: true,
            content: (
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className="flex-1 min-w-0">
                  {/* Branch + API status helpers */}
                  <div className="mb-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <BranchSelector
                        value={effectiveBranchCode}
                        onChange={(code) => setBranchOverrideCode(code)}
                      />
                      {effectiveBranchCode ? (
                        <span className="text-xs text-muted-foreground">Using: {effectiveBranchCode}</span>
                      ) : (
                        <span className="text-xs text-destructive">No branch set</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`inline-flex items-center gap-1 ${apiHealthy ? 'text-green-600' : apiHealthy === false ? 'text-red-600' : 'text-muted-foreground'}`}>
                        <span className={`inline-block h-2 w-2 rounded-full ${apiHealthy ? 'bg-green-600' : apiHealthy === false ? 'bg-red-600' : 'bg-gray-400'}`}></span>
                        {apiHealthy === null ? 'Checking API…' : apiHealthy ? 'API Connected' : 'API Error'}
                      </span>
                    </div>
                  </div>

                  <ProductGrid
                    onAddToCart={handleSelectClothingItem}
                    cartItemCount={cartSummary.itemCount}
                    onToggleCart={toggleCart}
                    branchCode={effectiveBranchCode}
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
            title: t.posSessionSummaryTitle,
            summary: t.posSessionSummarySummary.replace(
              "{{total}}",
              formatCurrency(cartSummary.total),
            ),
            content: (
              <div className="space-y-3 text-[var(--text-sm)] text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">{t.paymentMethod}:</span> {paymentSummary}
                </div>
                <div>
                  <span className="font-medium text-foreground">{t.customer}:</span> {selectedCustomer?.name ?? t.posWalkInCustomer}
                </div>
                <div>
                  <span className="font-medium text-foreground">{t.posCouponLabel}:</span> {appliedCoupon?.code ?? t.posNone}
                  {couponError ? <span className="ml-2 text-destructive">{couponError}</span> : null}
                </div>
                <div>
                  <span className="font-medium text-foreground">{t.posCartItemsLabel}:</span> {cartSummary.items.length}
                </div>
              </div>
            ),
          },
        ],
        checklist: [
          {
            id: "select-customer",
            label: t.posChecklistConfirmCustomerLabel,
            description: t.posChecklistConfirmCustomerDescription,
          },
          {
            id: "apply-coupon",
            label: t.posChecklistCheckCouponLabel,
            description: t.posChecklistCheckCouponDescription,
          },
          {
            id: "send-receipt",
            label: t.posChecklistSendReceiptLabel,
            description: t.posChecklistSendReceiptDescription,
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
    t,
  ]);

  const viewCards = useMemo<CardGridCard[]>(() => {
    switch (activeView) {
      case "sales":
        return salesCards;
      case "customers":
        return [
          {
            id: "customers",
            title: t.posCustomersCardTitle,
            description: t.posCustomersCardDescription,
            icon: <Users className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "customers-workspace",
                title: t.posCustomersWorkspaceTitle,
                summary: t.posCustomersWorkspaceSummary,
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
                label: t.posCustomersChecklistVerifyContactLabel,
                description: t.posCustomersChecklistVerifyContactDescription,
              },
              {
                id: "check-loyalty",
                label: t.posCustomersChecklistReviewLoyaltyLabel,
                description: t.posCustomersChecklistReviewLoyaltyDescription,
              },
              {
                id: "note-preferences",
                label: t.posCustomersChecklistCapturePreferencesLabel,
                description: t.posCustomersChecklistCapturePreferencesDescription,
              },
            ],
            persistChecklistKey: "pos-customers",
          },
        ];
      case "orders":
        return [
          {
            id: "orders",
            title: t.posOrdersCardTitle,
            description: t.posOrdersCardDescription,
            icon: <Truck className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "orders-feed",
                title: t.posOrdersWorkspaceTitle,
                summary: t.posOrdersWorkspaceSummary,
                defaultOpen: true,
                content: <OrderTracking />,
              },
            ],
            checklist: [
              {
                id: "update-status",
                label: t.posOrdersChecklistUpdateStatusLabel,
                description: t.posOrdersChecklistUpdateStatusDescription,
              },
              {
                id: "confirm-delivery",
                label: t.posOrdersChecklistConfirmDeliveryLabel,
                description: t.posOrdersChecklistConfirmDeliveryDescription,
              },
            ],
            persistChecklistKey: "pos-orders",
          },
        ];
      case "order-management":
        return [
          {
            id: "order-management",
            title: t.posOperationsCardTitle,
            description: t.posOperationsCardDescription,
            icon: <TrendingUp className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "order-management-workspace",
                title: t.posOperationsWorkspaceTitle,
                summary: t.posOperationsWorkspaceSummary,
                defaultOpen: true,
                content: (
                  <Suspense fallback={<LoadingScreen message={t.posLoadingOrderManagement} />}>
                    <OrderManagementDashboard />
                  </Suspense>
                ),
              },
            ],
            checklist: [
              {
                id: "audit-sla",
                label: t.posOperationsChecklistAuditLabel,
                description: t.posOperationsChecklistAuditDescription,
              },
              {
                id: "assign-followup",
                label: t.posOperationsChecklistAssignFollowUpLabel,
                description: t.posOperationsChecklistAssignFollowUpDescription,
              },
            ],
            persistChecklistKey: "pos-order-management",
          },
        ];
      case "packages":
        return [
          {
            id: "packages",
            title: t.posPackagesCardTitle,
            description: t.posPackagesCardDescription,
            icon: <Package className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "packages-workspace",
                title: t.posPackagesWorkspaceTitle,
                summary: t.posPackagesWorkspaceSummary,
                defaultOpen: true,
                content: (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <Button onClick={() => setShowChatbot((prev) => !prev)} variant="outline" size="sm">
                        {showChatbot ? t.posPackagesHideAssistant : t.posPackagesOpenAssistant}
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
                label: t.posPackagesChecklistRefreshPricingLabel,
                description: t.posPackagesChecklistRefreshPricingDescription,
              },
              {
                id: "assistant-demo",
                label: t.posPackagesChecklistDemoAssistantLabel,
                description: t.posPackagesChecklistDemoAssistantDescription,
              },
            ],
            persistChecklistKey: "pos-packages",
          },
        ];
      case "reports":
        return [
          {
            id: "reports",
            title: t.posReportsCardTitle,
            description: t.posReportsCardDescription,
            icon: <BarChart3 className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "reports-dashboard",
                title: t.posReportsWorkspaceTitle,
                summary: t.posReportsWorkspaceSummary,
                defaultOpen: true,
                content: <ReportsDashboard />,
              },
            ],
            checklist: [
              {
                id: "share-daily",
                label: t.posReportsChecklistShareSnapshotLabel,
                description: t.posReportsChecklistShareSnapshotDescription,
              },
              {
                id: "watch-trends",
                label: t.posReportsChecklistWatchTrendsLabel,
                description: t.posReportsChecklistWatchTrendsDescription,
              },
            ],
            persistChecklistKey: "pos-reports",
          },
        ];
      case "delivery-order-requests":
        return [
          {
            id: "delivery-requests",
            title: t.posDeliveryRequestsCardTitle,
            description: t.posDeliveryRequestsCardDescription,
            icon: <Truck className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "delivery-requests-workspace",
                title: t.posDeliveryRequestsWorkspaceTitle,
                summary: t.posDeliveryRequestsWorkspaceSummary,
                defaultOpen: true,
                content: <DeliveryOrderRequests />,
              },
            ],
            checklist: [
              {
                id: "route-balance",
                label: t.posDeliveryRequestsChecklistBalanceRoutesLabel,
                description: t.posDeliveryRequestsChecklistBalanceRoutesDescription,
              },
              {
                id: "confirm-window",
                label: t.posDeliveryRequestsChecklistConfirmWindowLabel,
                description: t.posDeliveryRequestsChecklistConfirmWindowDescription,
              },
            ],
            persistChecklistKey: "pos-delivery-requests",
          },
        ];
      case "delivery-orders":
        return [
          {
            id: "delivery-orders",
            title: t.posDeliveryOrdersCardTitle,
            description: t.posDeliveryOrdersCardDescription,
            icon: <Truck className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "delivery-orders-workspace",
                title: t.posDeliveryOrdersWorkspaceTitle,
                summary: t.posDeliveryOrdersWorkspaceSummary,
                defaultOpen: true,
                content: <DeliveryOrders />,
              },
            ],
            checklist: [
              {
                id: "notify-customer",
                label: t.posDeliveryOrdersChecklistNotifyCustomerLabel,
                description: t.posDeliveryOrdersChecklistNotifyCustomerDescription,
              },
              {
                id: "flag-issues",
                label: t.posDeliveryOrdersChecklistFlagIssuesLabel,
                description: t.posDeliveryOrdersChecklistFlagIssuesDescription,
              },
            ],
            persistChecklistKey: "pos-delivery-orders",
          },
        ];
      case "inventory":
        return [
          {
            id: "inventory",
            title: t.posInventoryCardTitle,
            description: t.posInventoryCardDescription,
            icon: <Settings className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "inventory-workspace",
                title: t.posInventoryWorkspaceTitle,
                summary: t.posInventoryWorkspaceSummary,
                defaultOpen: true,
                content: <InventoryManagement />,
              },
            ],
            checklist: [
              {
                id: "reorder-points",
                label: t.posInventoryChecklistReorderPointsLabel,
                description: t.posInventoryChecklistReorderPointsDescription,
              },
              {
                id: "sync-suppliers",
                label: t.posInventoryChecklistSyncSuppliersLabel,
                description: t.posInventoryChecklistSyncSuppliersDescription,
              },
            ],
            persistChecklistKey: "pos-inventory",
          },
        ];
      case "settings":
        return [
          {
            id: "settings",
            title: t.posSettingsCardTitle,
            description: t.posSettingsCardDescription,
            icon: <Settings className="size-5" aria-hidden="true" />,
            accordionSections: [
              {
                id: "settings-panel",
                title: t.posSettingsWorkspaceTitle,
                summary: t.posSettingsWorkspaceSummary,
                defaultOpen: true,
                content: <SystemSettings />,
              },
            ],
            checklist: [
              {
                id: "backup-config",
                label: t.posSettingsChecklistBackupConfigLabel,
                description: t.posSettingsChecklistBackupConfigDescription,
              },
              {
                id: "announce-change",
                label: t.posSettingsChecklistAnnounceChangesLabel,
                description: t.posSettingsChecklistAnnounceChangesDescription,
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
    t,
  ]);

  const currentCards = viewCards.length ? viewCards : [
    {
      id: "upcoming",
      title: t.posUpcomingCardTitle,
      description: t.posUpcomingCardDescription,
      icon: <Settings className="size-5" aria-hidden="true" />,
      accordionSections: [
        {
          id: "upcoming-overview",
          title: t.posUpcomingSectionTitle,
          summary: t.posUpcomingSectionSummary,
          defaultOpen: true,
          content: (
            <p className="text-[var(--text-sm)] text-muted-foreground">
              {t.posUpcomingBody}
            </p>
          ),
        },
      ],
      checklist: [
        {
          id: "share-feedback",
          label: t.posUpcomingChecklistLabel,
          description: t.posUpcomingChecklistDescription,
        },
      ],
      persistChecklistKey: "pos-upcoming",
    },
  ];

  return (
    <div className="full-bleed flex h-screen flex-col bg-[var(--pos-background)]">
      <POSHeader cartItemCount={cartSummary.itemCount} onToggleCart={toggleCart} />

      <div className="hidden border-b bg-[var(--surface-elevated)] px-6 py-3 text-[var(--text-sm)] text-muted-foreground lg:flex lg:items-center lg:justify-between">
        <span>
          {t.posShiftBannerPrefix}
          <GlossaryTooltip term={t.posGlossaryProgressiveDisclosureTerm} className="ml-1" />
          {t.posShiftBannerConnector}
          <GlossaryTooltip term={t.posGlossarySessionChecklistTerm} className="ml-1" />
          {t.posShiftBannerSuffix}
        </span>
        <LanguageSelector />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <POSSidebar activeView={activeView} onViewChange={setActiveView} />

        <main className="flex-1 overflow-y-auto bg-[var(--surface-muted)] flex flex-col min-h-0 min-w-0">
          <div className="px-4 py-6 lg:px-8 flex-1 min-h-0 min-w-0">
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
        branchCode={effectiveBranchCode}
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
