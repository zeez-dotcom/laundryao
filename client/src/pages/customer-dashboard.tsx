import { useEffect, useRef, useState } from "react";
import { CustomerAuthProvider, useCustomerAuth } from "@/context/CustomerAuthContext";
import { EnhancedPackageDisplay } from "@/components/EnhancedPackageDisplay";
import { CustomerOrders } from "@/components/customer-orders";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageSelector } from "@/components/language-selector";
import CardGrid, { type CardGridCard } from "@/components/layout/CardGrid";
import { GlossaryTooltip, useTour } from "@/components/onboarding/TourProvider";
import { Package, Users, Activity, Truck, PlusCircle, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslationContext } from "@/context/TranslationContext";

function DashboardContent() {
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth() as any;
  const { branch } = useAuthContext();
  const { registerTour, startTour, isTourDismissed, registerGlossaryEntries } = useTour();
  const [, setLocation] = useLocation();
  const { t } = useTranslationContext();
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ sender: 'staff'|'customer'; text: string; timestamp: string }[]>([]);
  const [chatText, setChatText] = useState("");
  const chatWsRef = useRef<WebSocket | null>(null);

  const { data: packages = [], isLoading: pkgLoading } = useQuery<any[]>({
    queryKey: ["/customer/packages"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/customer/packages");
      if (!res.ok) throw new Error("Failed to load packages");
      return await res.json();
    },
    enabled: isAuthenticated,
  });

  const { data: dashboardSettings } = useQuery<any>({
    queryKey: ["/customer/dashboard-settings"],
    queryFn: async () => (await apiRequest("GET", "/customer/dashboard-settings")).json(),
    enabled: isAuthenticated,
  });

  const { data: customization } = useQuery<any>({
    queryKey: ["/customer/customization"],
    queryFn: async () => (await apiRequest("GET", "/customer/customization")).json(),
    enabled: isAuthenticated,
  });

  const { data: ads = [] } = useQuery<any[]>({
    queryKey: ["/customer/ads"],
    enabled: isAuthenticated,
  });

  // Customer deliveries summary (hook must be top-level before any early returns)
  const { data: deliveries = [] } = useQuery<any[]>({
    queryKey: ["/customer/deliveries"],
    enabled: isAuthenticated,
  });

  // Quick orders fetch for banner (ready for pickup)
  const { data: shortOrders = [] } = useQuery<any[]>({
    queryKey: ["/customer/orders", "banner"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    registerGlossaryEntries([
      {
        term: "Progressive disclosure",
        description: "Customers see highlights first and can expand accordions for more detail when they choose.",
      },
      {
        term: "Loyalty insight",
        description: "A quick summary of rewards and balances to personalize service conversations.",
      },
    ]);
    const cleanup = registerTour({
      id: "customer-dashboard",
      title: "Customer success overview",
      description: "Understand how the dashboard surfaces insights, packages, and order history.",
      steps: [
        {
          id: "customer-insights",
          title: "Snapshot card",
          description: "Use the snapshot card to review loyalty, balance, and localized messaging before you greet the customer.",
        },
        {
          id: "customer-packages",
          title: "Packages & rewards",
          description: "Expand the packages card to see available bundles, ads, and redemption-ready offers.",
        },
        {
          id: "customer-orders",
          title: "Order history",
          description: "Keep the activity card handy to answer status questions and identify upsell opportunities.",
        },
      ],
    });
    if (!isTourDismissed("customer-dashboard")) {
      startTour("customer-dashboard");
    }
    return () => cleanup();
  }, [isTourDismissed, registerGlossaryEntries, registerTour, startTour]);

  if (authLoading || pkgLoading) {
    return <div className="p-6 text-[var(--text-sm)] text-muted-foreground">Loading dashboard…</div>;
  }

  if (!isAuthenticated) {
    return <div className="p-6 text-[var(--text-sm)]">Please log in to view packages.</div>;
  }

  const heroContent = (
    <div className="space-y-3">
      {(dashboardSettings?.heroTitleEn || customization?.headerText) && (
        <div>
          {customization?.logoUrl ? (
            <img src={customization.logoUrl} alt="Branch Logo" className="mb-3 h-10" />
          ) : null}
          <h2 className="text-[var(--text-lg)] font-semibold">
            {dashboardSettings?.heroTitleEn || customization?.headerText}
          </h2>
          {dashboardSettings?.heroTitleAr || customization?.headerTextAr ? (
            <div className="text-[var(--text-sm)] text-muted-foreground" dir="rtl">
              {dashboardSettings?.heroTitleAr || customization?.headerTextAr}
            </div>
          ) : null}
        </div>
      )}
      {(dashboardSettings?.heroSubtitleEn || customization?.subHeaderText) && (
        <p className="text-[var(--text-sm)] text-muted-foreground">
          {dashboardSettings?.heroSubtitleEn || customization?.subHeaderText}
          {(dashboardSettings?.heroSubtitleAr || customization?.subHeaderTextAr) && (
            <span className="block" dir="rtl">
              {dashboardSettings?.heroSubtitleAr || customization?.subHeaderTextAr}
            </span>
          )}
        </p>
      )}
    </div>
  );

  const metrics = customer ? (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard label="Active Packages" value={packages.length} />
      <MetricCard label="Loyalty Points" value={customer.loyaltyPoints || 0} />
      <MetricCard label="Outstanding Balance" value={customer.balanceDue || "0.00"} />
    </div>
  ) : null;

  const adsContent = ads.length ? (
    <div className="space-y-3">
      {ads.map((ad) => (
        <Card
          key={ad.id}
          onMouseEnter={() => {
            void apiRequest("POST", `/customer/ads/${ad.id}/impression`, { language: navigator.language }).catch(() => {});
          }}
        >
          <CardContent className="p-0">
            <a
              href={ad.targetUrl || "#"}
              onClick={() => {
                void apiRequest("POST", `/customer/ads/${ad.id}/click`, { language: navigator.language }).catch(() => {});
              }}
              target={ad.targetUrl ? "_blank" : undefined}
              rel="noreferrer"
            >
              <img src={ad.imageUrl} alt={ad.titleEn} className="h-40 w-full rounded-t-lg object-cover" />
            </a>
            <div className="p-3">
              <div className="font-medium">{ad.titleEn}</div>
              {ad.titleAr && <div className="text-[var(--text-xs)] text-muted-foreground" dir="rtl">{ad.titleAr}</div>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  ) : (
    <p className="text-[var(--text-sm)] text-muted-foreground">No promotions are active for this customer right now.</p>
  );

  const deliveriesContent = deliveries.length ? (
    <div className="space-y-2">
      {deliveries.map((d) => (
        <div key={d.id} className="flex items-center justify-between rounded border p-2">
          <div>
            <div className="font-medium">Delivery #{d.orderNumber}</div>
            <div className="text-[var(--text-xs)] text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</div>
            <div className="mt-1 text-[var(--text-xs)]">Status: <span className="rounded bg-gray-100 px-2 py-0.5">{d.deliveryStatus || 'pending'}</span></div>
          </div>
          <button
            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            onClick={() => setLocation(`/portal/delivery-tracking?deliveryId=${d.id}`)}
          >
            <Truck className="h-4 w-4" /> {t.customerDashboard?.track || 'Track'}
          </button>
        </div>
      ))}
    </div>
  ) : (
    <div className="text-[var(--text-sm)] text-muted-foreground">{t.customerDashboardNoDeliveries || 'No delivery jobs yet.'}</div>
  );

  // Live chat connection
  useEffect(() => {
    if (!chatOpen || !branch?.code) return;
    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/customer-chat?branchCode=${encodeURIComponent(branch.code)}`);
      chatWsRef.current = ws;
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data?.eventType === 'chat:message') {
            setChatMessages((prev) => [...prev, { sender: data.sender, text: data.text, timestamp: data.timestamp }]);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => { chatWsRef.current = null; };
      return () => { ws.close(); chatWsRef.current = null; };
    } catch {
      // ignore
    }
  }, [chatOpen, branch?.code]);

  const sendChat = () => {
    const text = chatText.trim();
    if (!text || !chatWsRef.current || chatWsRef.current.readyState !== WebSocket.OPEN) return;
    chatWsRef.current.send(JSON.stringify({ type: 'chat', text }));
    setChatMessages((prev) => [...prev, { sender: 'customer', text, timestamp: new Date().toISOString() }]);
    setChatText("");
  };

  const featureMessage =
    dashboardSettings?.featuredMessageEn || customization?.tagline ? (
      <Card>
        <CardContent className="space-y-2 p-4">
          <div>{dashboardSettings?.featuredMessageEn || customization?.tagline}</div>
          {(dashboardSettings?.featuredMessageAr || customization?.taglineAr) && (
            <div dir="rtl" className="text-[var(--text-sm)] text-muted-foreground">
              {dashboardSettings?.featuredMessageAr || customization?.taglineAr}
            </div>
          )}
        </CardContent>
      </Card>
    ) : null;

  const cards: CardGridCard[] = [
      {
        id: "insights",
        title: "Customer snapshot",
        description: "Key loyalty and messaging insights for the current branch.",
        icon: <Users className="size-5" aria-hidden="true" />,
        accent: "primary",
        accordionSections: [
          {
            id: "insights-hero",
            title: "Localized greeting",
            summary: "Preview the hero banner your customer sees.",
            defaultOpen: true,
            content: heroContent,
          },
          {
            id: "insights-metrics",
            title: "Account metrics",
            summary: "Track loyalty, balance, and package counts.",
            content: metrics ?? (
              <p className="text-[var(--text-sm)] text-muted-foreground">Customer metrics will appear after the first order.</p>
            ),
          },
          {
            id: "insights-feature",
            title: "Featured message",
            summary: "Surface high-impact announcements.",
            content: featureMessage ?? (
              <p className="text-[var(--text-sm)] text-muted-foreground">No featured message is scheduled.</p>
            ),
          },
        ],
        checklist: [
          {
            id: "greet-customer",
            label: "Personalize greeting",
            description: "Reference the localized hero copy when you greet the customer.",
          },
          {
            id: "loyalty-review",
            label: "Review loyalty insight",
            description: "Confirm balance and potential rewards before upselling.",
          },
          {
            id: "balance-flag",
            label: "Flag outstanding balances",
            description: "Notify finance if balances exceed your branch threshold.",
          },
        ],
        persistChecklistKey: `customer-insights-${branch?.id ?? "global"}`,
      },
      {
        id: "deliveries",
        title: "My deliveries",
        description: "Track delivery requests and active drop-offs.",
        icon: <Truck className="size-5" aria-hidden="true" />,
        accent: "accent",
        actions: (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOrderModalOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-1" /> {t.customerDashboardNewDelivery || 'New Delivery Request'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setChatOpen(true)}>
              <MessageSquare className="h-4 w-4 mr-1" /> {t.customerDashboardChatCashier || 'Chat with cashier'}
            </Button>
          </div>
        ),
        accordionSections: [
          {
            id: "deliveries-list",
            title: t.customerDashboardActiveDeliveries || 'Active deliveries',
            summary: t.customerDashboard?.deliveriesSummary || 'Status and tracking for your deliveries.',
            defaultOpen: true,
            content: deliveriesContent,
          },
        ],
        checklist: [
          {
            id: "place-delivery",
            label: "Place a delivery request",
            description: "Schedule a pickup for your garments.",
          },
        ],
        cta: {
          label: "New Delivery Request",
          icon: <PlusCircle className="size-4" aria-hidden="true" />,
          onClick: () => branch?.code && setLocation(`/customer-ordering?branchCode=${branch.code}&next=ordering`),
        } as any,
        persistChecklistKey: `customer-deliveries-${branch?.id ?? 'global'}`,
      },
      {
        id: "packages",
        title: "Packages & rewards",
        description: "Showcase bundles, promotions, and ad placements.",
        icon: <Package className="size-5" aria-hidden="true" />,
        accent: "secondary",
        accordionSections: [
          {
            id: "packages-promotions",
            title: "Active promotions",
            summary: "Campaigns currently targeted to this customer.",
            content: adsContent,
          },
          {
            id: "packages-catalog",
            title: "Package catalog",
            summary: "Available subscriptions and bundles.",
            defaultOpen: packages.length > 0,
            content:
              packages.length > 0 ? (
                <EnhancedPackageDisplay packages={packages} onUsePackage={() => {}} />
              ) : (
                <p className="text-[var(--text-sm)] text-muted-foreground">No packages are active for this customer.</p>
              ),
          },
        ],
        checklist: [
          {
            id: "promote-package",
            label: "Promote relevant package",
            description: "Highlight bundles tied to the customer’s usage history.",
          },
          {
            id: "redeem-reward",
            label: "Redeem loyalty reward",
            description: "Offer to redeem points during checkout when available.",
          },
          {
            id: "capture-feedback",
            label: "Capture promo feedback",
            description: "Log any objections to help improve future campaigns.",
          },
        ],
        persistChecklistKey: `customer-packages-${branch?.id ?? "global"}`,
      },
      {
        id: "orders",
        title: "Orders & activity",
        description: "Monitor historical orders and delivery status.",
        icon: <Activity className="size-5" aria-hidden="true" />,
        accordionSections: [
          {
            id: "orders-history",
            title: "Order timeline",
            summary: "Stay ahead of customer questions about status.",
            defaultOpen: true,
            content: <CustomerOrders />,
          },
        ],
        checklist: [
          {
            id: "status-update",
            label: "Proactively update status",
            description: "Send a quick message if an order is delayed beyond SLA.",
          },
          {
            id: "schedule-follow-up",
            label: "Schedule follow-up",
            description: "Book a reminder call for premium customers with late pickups.",
          },
          {
            id: "note-preferences",
            label: "Note customer preferences",
            description: "Record fabric care notes that surfaced during the conversation.",
          },
        ],
        persistChecklistKey: `customer-orders-${branch?.id ?? "global"}`,
      },
    ];

  return (
    <div className="full-bleed min-h-screen bg-[var(--background)] text-foreground">
      <header className="border-b bg-[var(--surface-elevated)]">
        <div className="flex w-full flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-[var(--text-xl)] font-semibold">Customer engagement</h1>
            <p className="text-[var(--text-sm)] text-muted-foreground">
              Summaries update in real time so you can practice
              <GlossaryTooltip term="Progressive disclosure" className="ml-2" /> during conversations.
            </p>
          </div>
          <LanguageSelector />
        </div>
        {Array.isArray(shortOrders) && shortOrders.some((o: any) => o.status === 'ready') && (
          <div className="px-6 pb-4">
            <div className="rounded-md border border-green-300 bg-green-50 p-3 text-[var(--text-sm)] text-green-800">
              {t.readyForPickup || 'Ready for pickup'}
            </div>
          </div>
        )}
      </header>

      <main className="flex w-full max-w-none flex-col gap-[var(--space-xl)] px-6 py-8">
        <CardGrid cards={cards} columns={{ base: 1, md: 2 }} />
      </main>

      {/* Create Order Modal */}
      <Dialog open={orderModalOpen} onOpenChange={setOrderModalOpen}>
        <DialogContent className="max-w-3xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t.customerDashboardNewDelivery || 'New Delivery Request'}</DialogTitle>
          </DialogHeader>
          {branch?.code ? (
            <iframe
              title="Create Order"
              src={`/customer-ordering?branchCode=${encodeURIComponent(branch.code)}&next=ordering`}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">{t.branchContextMissing || 'Missing branch context.'}</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Live Chat Modal */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chat with cashier</DialogTitle>
          </DialogHeader>
          <div className="flex h-80 flex-col gap-2">
            <div className="flex-1 overflow-auto rounded border p-2">
              {chatMessages.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t.customerDashboard?.startConversation || 'Start the conversation…'}</div>
              ) : (
                <ul className="space-y-1">
                  {chatMessages.map((m, idx) => (
                    <li key={idx} className={m.sender === 'customer' ? 'text-right' : 'text-left'}>
                      <span className="inline-block rounded bg-gray-100 px-2 py-1 text-sm">{m.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2">
              <Input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder={t.customerDashboardTypeMessage || 'Type a message…'} onKeyDown={(e) => e.key === 'Enter' ? sendChat() : undefined} />
              <Button onClick={sendChat}>{t.customerDashboardSend || 'Send'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="bg-[var(--surface-elevated)]">
      <CardContent className="space-y-1 p-4">
        <div className="text-[var(--text-xs)] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-[var(--text-lg)] font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function CustomerDashboardPage() {
  return (
    <AuthProvider>
      <CustomerAuthProvider>
        <DashboardContent />
      </CustomerAuthProvider>
    </AuthProvider>
  );
}
