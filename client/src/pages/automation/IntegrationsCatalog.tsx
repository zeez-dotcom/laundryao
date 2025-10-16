import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConnectorListing {
  id: string;
  name: string;
  category: "accounting" | "marketing-automation" | "messaging";
  summary: string;
  features: string[];
  oauthScopes: string[];
  setupTime: string;
  icon?: string;
  availability: "beta" | "ga";
  pricing: string;
  docsUrl: string;
  webhookEvents: string[];
}

const CONNECTORS: ConnectorListing[] = [
  {
    id: "xero",
    name: "Xero Accounting",
    category: "accounting",
    summary:
      "Sync journal entries, invoices, and contact balances. Ideal for laundries wanting accurate daily reconciliation.",
    features: ["Two-way invoice sync", "Auto-categorise detergents", "Tax group mapping"],
    oauthScopes: ["openid", "profile", "offline_access", "accounting.transactions"],
    setupTime: "6 minutes",
    pricing: "Included",
    availability: "ga",
    docsUrl: "https://docs.laundryao.com/integrations/accounting/xero",
    webhookEvents: ["invoices.created", "payments.applied"],
  },
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    category: "accounting",
    summary: "Push payouts, settlements, and branch profitability into QuickBooks in near real-time.",
    features: ["Daily payout summary", "Multi-branch class tracking", "Auto expense categorisation"],
    oauthScopes: ["com.intuit.quickbooks.accounting"],
    setupTime: "8 minutes",
    pricing: "Included",
    availability: "beta",
    docsUrl: "https://docs.laundryao.com/integrations/accounting/quickbooks",
    webhookEvents: ["salesreceipt.create", "payment.create"],
  },
  {
    id: "hubspot",
    name: "HubSpot Journeys",
    category: "marketing-automation",
    summary: "Trigger lifecycle nurture campaigns when orders are delayed or loyalty balances change.",
    features: ["Segment sync", "Personalised coupons", "Churn risk journeys"],
    oauthScopes: ["crm.objects.contacts.write", "automation.functions.read"],
    setupTime: "4 minutes",
    pricing: "Growth plan",
    availability: "ga",
    docsUrl: "https://docs.laundryao.com/integrations/marketing/hubspot",
    webhookEvents: ["contact.created", "workflow.completed"],
  },
  {
    id: "klaviyo",
    name: "Klaviyo Campaigns",
    category: "marketing-automation",
    summary: "Send hyper-targeted SMS and email sequences for VIP and lapsed laundry customers.",
    features: ["SMS + email triggers", "One-click coupon redemption", "Audience suppression"],
    oauthScopes: ["campaigns:write", "events:write", "profiles:write"],
    setupTime: "5 minutes",
    pricing: "Add-on",
    availability: "beta",
    docsUrl: "https://docs.laundryao.com/integrations/marketing/klaviyo",
    webhookEvents: ["message.delivered", "profile.updated"],
  },
  {
    id: "twilio",
    name: "Twilio Messaging",
    category: "messaging",
    summary: "Deliver order updates, driver ETAs, and upsell nudges via SMS and WhatsApp.",
    features: ["Two-way conversations", "WhatsApp rich cards", "Regional sender compliance"],
    oauthScopes: ["messages", "whatsapp"],
    setupTime: "3 minutes",
    pricing: "Usage based",
    availability: "ga",
    docsUrl: "https://docs.laundryao.com/integrations/messaging/twilio",
    webhookEvents: ["message.received", "message.failed"],
  },
  {
    id: "messenger",
    name: "Meta Messenger",
    category: "messaging",
    summary: "Engage customers on Facebook Messenger with automated pickup confirmations and receipts.",
    features: ["Persistent menu", "Suggested replies", "Location capture"],
    oauthScopes: ["pages_manage_metadata", "pages_messaging"],
    setupTime: "7 minutes",
    pricing: "Included",
    availability: "beta",
    docsUrl: "https://docs.laundryao.com/integrations/messaging/messenger",
    webhookEvents: ["message", "messaging_postbacks"],
  },
];

const CATEGORY_LABELS: Record<ConnectorListing["category"], string> = {
  accounting: "Accounting",
  "marketing-automation": "Marketing automation",
  messaging: "Messaging",
};

export default function IntegrationsCatalogPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ConnectorListing["category"] | "all">("all");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return CONNECTORS.filter((connector) => {
      const matchesTerm =
        !term ||
        connector.name.toLowerCase().includes(term) ||
        connector.summary.toLowerCase().includes(term) ||
        connector.features.some((feature) => feature.toLowerCase().includes(term));
      const matchesCategory = category === "all" || connector.category === category;
      return matchesTerm && matchesCategory;
    });
  }, [search, category]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Integration Marketplace</h1>
        <p className="text-muted-foreground">
          Connect LaundryAO to your accounting, marketing automation, and messaging stack. OAuth-secured connectors ship with
          webhook registries so you can react to external events inside the workflow builder.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 gap-2">
              <Input
                placeholder="Search integrations by name, feature, or capability"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="w-48 rounded border bg-background p-2 text-sm"
                value={category}
                onChange={(event) => setCategory(event.target.value as any)}
              >
                <option value="all">All categories</option>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSearch("")}>Clear</Button>
              <Button asChild>
                <a href="/automation/workflows">Open workflow builder</a>
              </Button>
            </div>
          </div>
          <CardDescription>
            {filtered.length} of {CONNECTORS.length} integrations shown. Beta connectors require a support ticket to enable in
            production tenants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="grid" className="space-y-4">
            <TabsList>
              <TabsTrigger value="grid">Grid</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="grid">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((connector) => (
                  <Card key={connector.id} className="border border-border/70 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-2 text-lg">
                        <span>{connector.name}</span>
                        <Badge variant="secondary">{CATEGORY_LABELS[connector.category]}</Badge>
                      </CardTitle>
                      <CardDescription>{connector.summary}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {connector.features.map((feature) => (
                          <Badge key={feature} variant="outline">
                            {feature}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        OAuth scopes: {connector.oauthScopes.join(", ")}
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Setup time: {connector.setupTime}</span>
                        <span>{connector.availability === "beta" ? "Beta access" : "Generally available"}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild size="sm" className="flex-1">
                          <a href={connector.docsUrl}>View docs</a>
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1">
                          Request access
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="details">
              <ScrollArea className="max-h-[520px] pr-4">
                <div className="space-y-6">
                  {filtered.map((connector) => (
                    <div key={connector.id} className="space-y-2 rounded border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-lg font-semibold">{connector.name}</h3>
                          <p className="text-sm text-muted-foreground">{connector.summary}</p>
                        </div>
                        <Badge variant={connector.availability === "beta" ? "destructive" : "secondary"}>
                          {connector.availability === "beta" ? "Beta" : "GA"}
                        </Badge>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-medium">Webhook events</h4>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                            {connector.webhookEvents.map((event) => (
                              <li key={event}>{event}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium">OAuth scopes</h4>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                            {connector.oauthScopes.map((scope) => (
                              <li key={scope}>{scope}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span>Setup time: {connector.setupTime}</span>
                        <span>Pricing: {connector.pricing}</span>
                        <a className="underline" href={connector.docsUrl}>
                          Implementation guide
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
