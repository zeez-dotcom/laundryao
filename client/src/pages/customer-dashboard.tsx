import { useEffect, useMemo } from "react";
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
import { Package, Users, Activity } from "lucide-react";

function DashboardContent() {
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth() as any;
  const { branch } = useAuthContext();
  const { registerTour, startTour, isTourDismissed, registerGlossaryEntries } = useTour();

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

  const cards: CardGridCard[] = useMemo(() => {
    return [
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
  }, [adsContent, branch?.id, featureMessage, heroContent, metrics, packages.length]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-foreground">
      <header className="border-b bg-[var(--surface-elevated)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <h1 className="text-[var(--text-xl)] font-semibold">Customer engagement</h1>
            <p className="text-[var(--text-sm)] text-muted-foreground">
              Summaries update in real time so you can practice
              <GlossaryTooltip term="Progressive disclosure" className="ml-2" /> during conversations.
            </p>
          </div>
          <LanguageSelector />
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-[var(--space-xl)] px-6 py-8">
        <CardGrid cards={cards} columns={{ base: 1, md: 2 }} />
      </main>
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
