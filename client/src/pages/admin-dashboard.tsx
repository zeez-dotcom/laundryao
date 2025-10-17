import React, { Suspense, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import LoadingScreen from "@/components/common/LoadingScreen";
import {
  LogOut,
  Users,
  Tags,
  MapPin,
  ArrowLeft,
  Upload,
  QrCode,
  Truck,
  BarChart3,
  DollarSign,
  Store,
  TicketPercent,
} from "lucide-react";
import { Link } from "wouter";
import logoUrl from "@/assets/logo.png";
import CardGrid, { type CardChecklistItem, type CardGridCard } from "@/components/layout/CardGrid";
import { GlossaryTooltip, useTour } from "@/components/onboarding/TourProvider";

const CategoryManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/CategoryManager")
);
const UserManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/UserManager")
);
const BranchManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchManager").then((m) => ({ default: m.BranchManager }))
);
const BranchSettings = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchSettings").then((m) => ({ default: m.BranchSettings }))
);
const BulkUploadManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BulkUploadManager").then((m) => ({ default: m.BulkUploadManager }))
);
const CouponManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/CouponManager").then((m) => ({ default: m.CouponManager }))
);
const SuperAdminDashboard = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/SuperAdminDashboard").then((m) => ({ default: m.SuperAdminDashboard }))
);
const BranchCustomizationManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchCustomizationManager").then((m) => ({ default: m.BranchCustomizationManager }))
);
const FinancialReportsManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/FinancialReportsManager").then((m) => ({ default: m.FinancialReportsManager }))
);
const ExpenseManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/ExpenseManager").then((m) => ({ default: m.ExpenseManager }))
);
const BranchDeliveryManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchDeliveryManager").then((m) => ({ default: m.BranchDeliveryManager }))
);
const CustomerDashboardManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/CustomerDashboardManager").then((m) => ({ default: m.CustomerDashboardManager }))
);
const BranchQRCodeManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchQRCodeManager").then((m) => ({ default: m.BranchQRCodeManager }))
);

const defaultChecklist: CardChecklistItem[] = [
  {
    id: "share-update",
    label: "Communicate updates",
    description: "Post key changes in the internal announcement channel.",
  },
  {
    id: "verify-access",
    label: "Verify role access",
    description: "Double-check that the right team members can reach this module.",
  },
  {
    id: "log-decisions",
    label: "Log decisions",
    description: "Record configuration decisions for future audits.",
  },
];

const sectionChecklist: Record<string, CardChecklistItem[]> = {
  categories: [
    {
      id: "audit-categories",
      label: "Audit category hierarchy",
      description: "Ensure every service has a clear parent category with translations.",
    },
    {
      id: "seasonal-review",
      label: "Review seasonal offerings",
      description: "Archive expired campaigns and highlight active bundles.",
    },
    {
      id: "pricing-pass",
      label: "Confirm pricing rules",
      description: "Spot-check margin thresholds before publishing.",
    },
  ],
  "branch-settings": [
    {
      id: "update-hours",
      label: "Update branch hours",
      description: "Align operating hours with delivery windows.",
    },
    {
      id: "sync-contacts",
      label: "Sync emergency contacts",
      description: "Verify contact numbers for escalations are current.",
    },
    {
      id: "policy-check",
      label: "Publish policy changes",
      description: "Document any new service policies in the knowledge base.",
    },
  ],
  "qr-management": [
    {
      id: "refresh-codes",
      label: "Refresh QR artwork",
      description: "Download the latest branded codes for printing.",
    },
    {
      id: "test-links",
      label: "Test destination links",
      description: "Open each QR destination to confirm a 200 response.",
    },
    {
      id: "share-assets",
      label: "Share collateral",
      description: "Send updated QR assets to the marketing channel.",
    },
  ],
  "delivery-management": [
    {
      id: "route-audit",
      label: "Audit driver routes",
      description: "Check that route capacity aligns with today’s orders.",
    },
    {
      id: "notify-drivers",
      label: "Notify drivers",
      description: "Send SLA reminders to drivers with high-priority stops.",
    },
    {
      id: "customer-eta",
      label: "Update ETAs",
      description: "Confirm pickup/drop-off ETAs inside the customer timeline.",
    },
  ],
  customization: [
    {
      id: "brand-sync",
      label: "Sync branding",
      description: "Upload the latest brand kit to keep colors on message.",
    },
    {
      id: "preview-customer",
      label: "Preview customer view",
      description: "Ensure storefront messaging renders correctly in both languages.",
    },
    {
      id: "localize-copy",
      label: "Localize copy",
      description: "Pair every hero message with an Arabic translation before launch.",
    },
  ],
  "customer-dashboard": [
    {
      id: "reward-rules",
      label: "Validate rewards",
      description: "Confirm point multipliers match the current promotion.",
    },
    {
      id: "banner-rotation",
      label: "Rotate hero banners",
      description: "Swap in seasonal hero imagery for returning customers.",
    },
    {
      id: "support-macros",
      label: "Refresh support macros",
      description: "Align help content with the latest product updates.",
    },
  ],
  "financial-reports": [
    {
      id: "download-ledger",
      label: "Download ledger",
      description: "Export the weekly ledger for accounting sign-off.",
    },
    {
      id: "variance-check",
      label: "Investigate variances",
      description: "Flag revenue anomalies above the configured threshold.",
    },
    {
      id: "share-snapshot",
      label: "Share snapshot",
      description: "Send a summary to finance leadership via Slack.",
    },
  ],
  expenses: [
    {
      id: "receipt-upload",
      label: "Upload receipts",
      description: "Attach proof-of-purchase files for the week.",
    },
    {
      id: "categorize-expenses",
      label: "Categorize expenses",
      description: "Map each expense to the correct ledger code.",
    },
    {
      id: "approve-reimbursements",
      label: "Approve reimbursements",
      description: "Process outstanding reimbursement requests before payday.",
    },
  ],
  coupons: [
    {
      id: "expiry-sweep",
      label: "Sweep expiring codes",
      description: "Notify marketing about coupons expiring this week.",
    },
    {
      id: "audience-review",
      label: "Review eligibility",
      description: "Verify customer segments before activating a campaign.",
    },
    {
      id: "limit-check",
      label: "Check usage limits",
      description: "Ensure redemption limits are in place to prevent abuse.",
    },
  ],
  branches: [
    {
      id: "compliance-review",
      label: "Review compliance",
      description: "Confirm each branch has completed required audits.",
    },
    {
      id: "capacity-planning",
      label: "Plan capacity",
      description: "Adjust staffing forecasts based on order pipeline.",
    },
    {
      id: "sync-coordinates",
      label: "Sync coordinates",
      description: "Validate map coordinates for customer routing.",
    },
  ],
  users: [
    {
      id: "role-review",
      label: "Review access roles",
      description: "Remove inactive users and adjust permissions as needed.",
    },
    {
      id: "2fa-audit",
      label: "Audit 2FA enrollment",
      description: "Confirm all admins have two-factor authentication enabled.",
    },
    {
      id: "training-tracker",
      label: "Log training",
      description: "Document onboarding progress for new hires.",
    },
  ],
  "bulk-upload": [
    {
      id: "template-sync",
      label: "Sync templates",
      description: "Download the latest CSV template before uploading.",
    },
    {
      id: "data-sanitize",
      label: "Sanitize data",
      description: "Check for duplicate SKUs or malformed phone numbers.",
    },
    {
      id: "post-audit",
      label: "Run post-upload audit",
      description: "Compare record counts before and after the upload.",
    },
  ],
};

const sectionMetadata: Record<
  string,
  {
    title: string;
    description: string;
    overview: string;
    icon: React.ReactNode;
    accent?: "primary" | "secondary" | "neutral";
  }
> = {
  categories: {
    title: "Service Categories",
    description: "Structure laundry services for every branch and channel.",
    overview:
      "Use the category workspace to organize garments, map translations, and align POS sorting with online ordering.",
    icon: <Tags className="size-5" aria-hidden="true" />,
    accent: "primary",
  },
  "branch-settings": {
    title: "Branch Settings",
    description: "Fine-tune hours, contact info, and localized branch messaging.",
    overview:
      "Update operating hours, escalations, and branch-specific notices. Changes sync instantly to customer apps.",
    icon: <Store className="size-5" aria-hidden="true" />,
    accent: "secondary",
  },
  "qr-management": {
    title: "QR Codes",
    description: "Generate and monitor branded QR codes for quick ordering.",
    overview:
      "Create landing-page QR codes, monitor scans, and download artwork for in-store signage and delivery vehicles.",
    icon: <QrCode className="size-5" aria-hidden="true" />,
  },
  "delivery-management": {
    title: "Delivery Operations",
    description: "Coordinate pickup and delivery workflows across drivers.",
    overview:
      "Assign drivers, balance delivery routes, and keep customers informed with accurate pickup ETAs.",
    icon: <Truck className="size-5" aria-hidden="true" />,
  },
  customization: {
    title: "Experience Customization",
    description: "Personalize the customer dashboard and marketing surfaces.",
    overview:
      "Upload hero imagery, adjust messaging per segment, and localize banners before publishing updates.",
    icon: <TicketPercent className="size-5" aria-hidden="true" />,
  },
  "customer-dashboard": {
    title: "Customer Dashboard",
    description: "Preview loyalty, rewards, and communications for shoppers.",
    overview:
      "Review the customer-facing dashboard to ensure promotions, loyalty balances, and messaging render correctly.",
    icon: <Users className="size-5" aria-hidden="true" />,
  },
  "financial-reports": {
    title: "Financial Reports",
    description: "Monitor revenue performance with drill-down filters.",
    overview:
      "Explore sales, taxes, and payout summaries. Export ledgers for finance and flag anomalies for follow-up.",
    icon: <BarChart3 className="size-5" aria-hidden="true" />,
  },
  expenses: {
    title: "Expense Manager",
    description: "Track spending across branches and cost centers.",
    overview:
      "Review reimbursements, assign ledger codes, and keep procurement spend in sync with finance.",
    icon: <DollarSign className="size-5" aria-hidden="true" />,
  },
  coupons: {
    title: "Coupon Studio",
    description: "Design and monitor promotional campaigns.",
    overview:
      "Create single-use or recurring campaigns, validate eligibility, and monitor redemption velocity in real time.",
    icon: <TicketPercent className="size-5" aria-hidden="true" />,
  },
  branches: {
    title: "Branch Directory",
    description: "Oversee branch capacity, compliance, and staffing.",
    overview:
      "Maintain branch profiles, update contact details, and verify compliance tasks are logged.",
    icon: <MapPin className="size-5" aria-hidden="true" />,
  },
  users: {
    title: "Team Access",
    description: "Manage user accounts, roles, and authentication.",
    overview:
      "Invite staff, adjust permissions, and enforce security best practices like 2FA enrollment.",
    icon: <Users className="size-5" aria-hidden="true" />,
  },
  "bulk-upload": {
    title: "Bulk Upload",
    description: "Streamline large imports with validation helpers.",
    overview:
      "Use guided templates to batch import products, price lists, or customers with data quality checks built in.",
    icon: <Upload className="size-5" aria-hidden="true" />,
  },
};

function renderSectionContent(sectionId: string) {
  switch (sectionId) {
    case "categories":
      return <CategoryManager />;
    case "branch-settings":
      return <BranchSettings />;
    case "qr-management":
      return <BranchQRCodeManager />;
    case "delivery-management":
      return <BranchDeliveryManager />;
    case "customization":
      return <BranchCustomizationManager />;
    case "customer-dashboard":
      return <CustomerDashboardManager />;
    case "financial-reports":
      return <FinancialReportsManager />;
    case "expenses":
      return <ExpenseManager />;
    case "coupons":
      return <CouponManager />;
    case "branches":
      return <BranchManager />;
    case "users":
      return (
        <>
          <SuperAdminDashboard />
          <UserManager />
        </>
      );
    case "bulk-upload":
      return <BulkUploadManager />;
    default:
      return <div className="text-[var(--text-sm)] text-muted-foreground">This module will be available soon.</div>;
  }
}

export default function AdminDashboard() {
  const { user, branch, isSuperAdmin, isAdmin } = useAuthContext();
  const isAdminLike = isAdmin || isSuperAdmin;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registerTour, startTour, isTourDismissed, registerGlossaryEntries } = useTour();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/logout");
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: "Logged out successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error) => {
      toast({ title: "Logout failed", description: error.message, variant: "destructive" });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const availableSections = useMemo(() => {
    const sections: { value: string; label: string }[] = [{ value: "categories", label: "Categories" }];
    if (isAdminLike) {
      sections.push(
        { value: "branch-settings", label: "Branch Settings" },
        { value: "qr-management", label: "QR Code Management" },
        { value: "delivery-management", label: "Delivery Management" },
        { value: "customization", label: "Customization" },
        { value: "customer-dashboard", label: "Customer Dashboard" },
        { value: "financial-reports", label: "Financial Reports" },
        { value: "expenses", label: "Expenses" },
        { value: "coupons", label: "Coupons" },
      );
    }
    if (isAdminLike) {
      if (isSuperAdmin) {
        sections.push({ value: "branches", label: "Branches" }, { value: "users", label: "Users" });
      }
      sections.push({ value: "bulk-upload", label: "Bulk Upload" });
    }
    return sections;
  }, [isAdminLike, isSuperAdmin]);

  useEffect(() => {
    registerGlossaryEntries([
      {
        term: "Progressive disclosure",
        description: "Reveal detail gradually with accordion sections so teams aren’t overwhelmed with choices.",
      },
      {
        term: "Operational checklist",
        description: "A saved set of repeatable tasks that keep each module compliant and audit ready.",
      },
    ]);
    const cleanupTour = registerTour({
      id: "admin-dashboard",
      title: "Admin control center",
      description: "Learn how cards, accordions, and checklists guide your daily workflow.",
      steps: [
        {
          id: "admin-card-grid",
          title: "Cards group focus areas",
          description: "Each card represents a module with quick context and actions. Expand the accordions when you need detail.",
        },
        {
          id: "admin-accordion",
          title: "Progressive disclosure",
          description: "Open the workspace accordion to reveal the full management interface without leaving the page.",
        },
        {
          id: "admin-checklist",
          title: "Contextual checklist",
          description: "Use the checklist to track recurring admin tasks and persist progress across sessions.",
        },
      ],
    });

    if (!isTourDismissed("admin-dashboard")) {
      startTour("admin-dashboard");
    }

    return () => {
      cleanupTour();
    };
  }, [isTourDismissed, registerGlossaryEntries, registerTour, startTour]);

  const cards: CardGridCard[] = useMemo(() => {
    return availableSections.map((section, index) => {
      const metadata = sectionMetadata[section.value] ?? {
        title: section.label,
        description: `Manage ${section.label.toLowerCase()} settings and content.`,
        overview: `Expand the workspace accordion to configure ${section.label.toLowerCase()}.`,
        icon: <Tags className="size-5" aria-hidden="true" />,
      };
      const checklist = sectionChecklist[section.value] ?? defaultChecklist;
      return {
        id: section.value,
        title: metadata.title,
        description: metadata.description,
        icon: metadata.icon,
        accent: metadata.accent,
        badgeLabel:
          isSuperAdmin && (section.value === "branches" || section.value === "users") ? "Super admin" : undefined,
        accordionSections: [
          {
            id: `${section.value}-overview`,
            title: "Overview",
            summary: metadata.description,
            content: (
              <p className="text-[var(--text-sm)] leading-[var(--line-height-relaxed)] text-muted-foreground">
                {metadata.overview}
              </p>
            ),
          },
          {
            id: `${section.value}-workspace`,
            title: `${section.label} workspace`,
            summary: "Expand to manage this module",
            defaultOpen: index === 0,
            content: (
              <div className="rounded-lg border bg-[var(--surface-elevated)] p-4">
                <Suspense fallback={<LoadingScreen message={`Loading ${section.label}…`} />}>
                  {renderSectionContent(section.value)}
                </Suspense>
              </div>
            ),
          },
        ],
        checklist,
        persistChecklistKey: `admin-${section.value}`,
      } satisfies CardGridCard;
    });
  }, [availableSections, isSuperAdmin]);

  if (!user) {
    return null;
  }

  // If the current viewport is too small, open the dashboard in a larger popup once per session
  useEffect(() => {
    if (typeof window === "undefined") return;
    const alreadyOpened = sessionStorage.getItem("adminDashboardPopupOpened");
    const tooNarrow = window.innerWidth < 1200;
    const tooShort = window.innerHeight < 700;
    if (!alreadyOpened && (tooNarrow || tooShort)) {
      const w = Math.max(1200, window.innerWidth);
      const h = Math.max(800, window.innerHeight);
      const left = Math.max(0, Math.floor((screen.width - w) / 2));
      const top = Math.max(0, Math.floor((screen.height - h) / 2));
      const popup = window.open(
        "/admin?popup=1",
        "admin-dashboard",
        `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
      );
      if (popup) {
        try { popup.focus(); } catch {}
        sessionStorage.setItem("adminDashboardPopupOpened", "1");
      }
    }
  }, []);

  return (
    <div className="full-bleed flex min-h-screen flex-col bg-[var(--surface-muted)] text-foreground">
      <header className="border-b bg-[var(--surface-elevated)] shadow-sm">
        <div className="mx-auto flex w-full max-w-none flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="Laundry Logo" className="h-10 w-10 rounded-full object-cover" />
            <div>
              <h1 className="text-[var(--text-xl)] font-semibold">Admin control center</h1>
              <p className="text-[var(--text-sm)] text-muted-foreground">
                Manage operations with <GlossaryTooltip term="Progressive disclosure" /> and persistent
                <GlossaryTooltip term="Operational checklist" className="ml-2" /> support.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[var(--text-sm)] text-muted-foreground">
            <span>
              {user.firstName} {user.lastName} ({user.role})
            </span>
            <span className="hidden border-l border-border pl-3 sm:inline">
              {branch?.name ?? "Multi-branch"}
            </span>
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-2 size-4" aria-hidden="true" /> Back to POS
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={logoutMutation.isPending}>
                <LogOut className="mr-2 size-4" aria-hidden="true" /> Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-none flex-1 flex-col gap-[var(--space-xl)] px-6 py-8">
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="text-[var(--text-lg)] font-semibold">Today&apos;s focus</h2>
          <p className="mt-2 text-[var(--text-sm)] text-muted-foreground">
            Expand any card to progressively reveal its workspace and mark tasks complete as you go. Your progress is stored so the
            next admin can pick up where you left off.
          </p>
        </section>

        <CardGrid cards={cards} columns={{ base: 1, md: 2, lg: 3 }} />
      </main>
    </div>
  );
}
