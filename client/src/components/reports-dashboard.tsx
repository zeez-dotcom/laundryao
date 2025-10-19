import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, DollarSign, Calendar, Download, Package as PackageIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Transaction } from "@shared/schema";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { OrderLogsTable } from "./order-logs-table";
import { useCurrency } from "@/lib/currency";
import { useAuthContext } from "@/context/AuthContext";
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

type RevenueSummary = {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  daily: { date: string; orders: number; revenue: number }[];
};

type ServiceAggregate = {
  service: string;
  count: number;
  revenue: number;
};

type ClothingAggregate = {
  item: string;
  count: number;
  revenue: number;
};

type PaymentAggregate = {
  method: string;
  count: number;
  revenue: number;
};

type PayLaterReceipts = {
  totalReceipts: number;
  totalAmount: number;
  daily: { date: string; receipts: number; amount: number }[];
  details: {
    orderId: string | null;
    orderNumber: string | null;
    customerName: string | null;
    orderDate: string | null;
    paymentDate: string;
    paymentAmount: number;
    orderTotal: number | null;
    totalPaid: number | null;
    remaining: number | null;
    status: 'unpaid' | 'partial' | 'paid';
  }[];
};

const EMPTY_RECEIPTS: PayLaterReceipts = {
  totalReceipts: 0,
  totalAmount: 0,
  daily: [],
  details: [],
};

const EMPTY_SUMMARY: RevenueSummary = {
  totalOrders: 0,
  totalRevenue: 0,
  averageOrderValue: 0,
  daily: [],
};

export function ReportsDashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const { formatCurrency } = useCurrency();
  const { branch, isSuperAdmin } = useAuthContext();
  const [reportsBranchId, setReportsBranchId] = useState<string | undefined>(undefined);

  const [range, setRange] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');

  const startIso = dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined;
  const endIso = dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined;

  const buildRangeParams = () => {
    const params = new URLSearchParams();
    if (startIso) params.set("start", startIso);
    if (endIso) params.set("end", endIso);
    const effectiveBranchId = reportsBranchId || branch?.id;
    if (effectiveBranchId) params.set("branchId", effectiveBranchId);
    return params;
  };

  const { data: summaryData } = useQuery<RevenueSummary>({
    queryKey: ["/api/reports/summary", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      const query = params.toString();
      const url = query ? `/api/reports/summary?${query}` : `/api/reports/summary`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return EMPTY_SUMMARY;
      }
      const json = await res.json();
      return {
        totalOrders: Number(json.totalOrders ?? 0),
        totalRevenue: Number(json.totalRevenue ?? 0),
        averageOrderValue: Number(json.averageOrderValue ?? 0),
        daily: Array.isArray(json.daily)
          ? json.daily.map((row: any) => ({
              date: String(row.date ?? ''),
              orders: Number(row.orders ?? 0),
              revenue: Number(row.revenue ?? 0),
            }))
          : [],
      } satisfies RevenueSummary;
    },
    keepPreviousData: true,
  });

  const summary = summaryData ?? EMPTY_SUMMARY;

  const { data: serviceResponse } = useQuery<{ services: ServiceAggregate[] }>({
    queryKey: ["/api/reports/service-breakdown", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      const query = params.toString();
      const url = query ? `/api/reports/service-breakdown?${query}` : `/api/reports/service-breakdown`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return { services: [] };
      }
      const json = await res.json();
      const services = Array.isArray(json.services)
        ? json.services.map((item: any) => ({
            service: String(item.service ?? 'Unknown Service'),
            count: Number(item.count ?? 0),
            revenue: Number(item.revenue ?? 0),
          }))
        : [];
      return { services };
    },
    keepPreviousData: true,
  });

  const { data: clothingResponse } = useQuery<{ items: ClothingAggregate[] }>({
    queryKey: ["/api/reports/clothing-breakdown", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      const query = params.toString();
      const url = query ? `/api/reports/clothing-breakdown?${query}` : `/api/reports/clothing-breakdown`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return { items: [] };
      }
      const json = await res.json();
      const items = Array.isArray(json.items)
        ? json.items.map((item: any) => ({
            item: String(item.item ?? 'Unknown Item'),
            count: Number(item.count ?? 0),
            revenue: Number(item.revenue ?? 0),
          }))
        : [];
      return { items };
    },
    keepPreviousData: true,
  });

  const { data: paymentResponse } = useQuery<{ methods: PaymentAggregate[] }>({
    queryKey: ["/api/reports/payment-methods", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      const query = params.toString();
      const url = query ? `/api/reports/payment-methods?${query}` : `/api/reports/payment-methods`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return { methods: [] };
      }
      const json = await res.json();
      const methods = Array.isArray(json.methods)
        ? json.methods.map((item: any) => ({
            method: String(item.method ?? 'unknown'),
            count: Number(item.count ?? 0),
            revenue: Number(item.revenue ?? 0),
          }))
        : [];
      return { methods };
    },
    keepPreviousData: true,
  });

  const { data: topPackages = [] } = useQuery<{ pkg: string; count: number; revenue: number }[]>({
    queryKey: ["/api/reports/top-packages", range],
    queryFn: async () => {
      const res = await fetch(`/api/reports/top-packages?range=${range}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return json.packages || [];
    },
  });

  const { data: recentTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", "recent", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      params.set("limit", "50");
      const query = params.toString();
      const url = `/api/transactions?${query}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return [];
      }
      return res.json();
    },
    keepPreviousData: true,
  });

  // Pay-later receipts attributed to payment (receipt) date
  const { data: receiptsData } = useQuery<PayLaterReceipts>({
    queryKey: ["/api/reports/pay-later-receipts", startIso, endIso, reportsBranchId || branch?.id],
    queryFn: async () => {
      const params = buildRangeParams();
      const url = `/api/reports/pay-later-receipts?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return EMPTY_RECEIPTS;
      const json = await res.json();
      return {
        totalReceipts: Number(json.totalReceipts ?? 0),
        totalAmount: Number(json.totalAmount ?? 0),
        daily: Array.isArray(json.daily)
          ? json.daily.map((row: any) => ({
              date: String(row.date ?? ''),
              receipts: Number(row.receipts ?? 0),
              amount: Number(row.amount ?? 0),
            }))
          : [],
        details: Array.isArray(json.details)
          ? json.details.map((d: any) => ({
              orderId: d.orderId ?? null,
              orderNumber: d.orderNumber ?? null,
              customerName: d.customerName ?? null,
              orderDate: d.orderDate ?? null,
              paymentDate: d.paymentDate ?? '',
              paymentAmount: Number(d.paymentAmount ?? 0),
              orderTotal: d.orderTotal != null ? Number(d.orderTotal) : null,
              totalPaid: d.totalPaid != null ? Number(d.totalPaid) : null,
              remaining: d.remaining != null ? Number(d.remaining) : null,
              status: (d.status as any) ?? 'unpaid',
            }))
          : [],
      } as PayLaterReceipts;
    },
    keepPreviousData: true,
  });

  // Pay-later orders summarized by order-date (for comparison) 
  const { data: payLaterOrderDate } = useQuery<{ daily: { date: string; orders: number; revenue: number }[] }>({
    queryKey: ["/api/reports/pay-later-orders-by-date", startIso, endIso, reportsBranchId || branch?.id],
    queryFn: async () => {
      const params = buildRangeParams();
      const res = await fetch(`/api/reports/pay-later-orders-by-date?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return { daily: [] };
      const json = await res.json();
      return { daily: Array.isArray(json.daily) ? json.daily : [] };
    },
    keepPreviousData: true,
  });

  const [receiptsView, setReceiptsView] = useState<'payment' | 'order'>('payment');
  const [showOutstandingOnly, setShowOutstandingOnly] = useState(false);

  // Super admin branch selector
  type Branch = { id: string; name: string };
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["/api/branches", "reports"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/branches");
      return res.json();
    },
  });

  // Build combined overlay chart data for money values
  const overlay = (() => {
    const pay = receiptsData?.daily ?? [];
    const ord = payLaterOrderDate?.daily ?? [];
    const mapPay = new Map(pay.map((r) => [r.date, r.amount]));
    const mapOrd = new Map(ord.map((r) => [r.date, r.revenue]));
    const allDates = Array.from(new Set<string>([...mapPay.keys(), ...mapOrd.keys()])).sort();
    const pointsPay = allDates.map((d) => ({ date: d, value: mapPay.get(d) ?? 0 }));
    const pointsOrd = allDates.map((d) => ({ date: d, value: mapOrd.get(d) ?? 0 }));
    const maxVal = Math.max(1, ...pointsPay.map(p => p.value), ...pointsOrd.map(p => p.value));
    return { dates: allDates, pointsPay, pointsOrd, maxVal };
  })();

  const services = serviceResponse?.services ?? [];
  const clothing = clothingResponse?.items ?? [];
  const paymentMethods = paymentResponse?.methods ?? [];
  const totalRevenue = summary.totalRevenue;
  const totalOrders = summary.totalOrders;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const dailyRows = [...summary.daily].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  ).slice(0, 10);
  const recentTransactionsToShow = recentTransactions.slice(0, 20);

  const exportReport = async () => {
    try {
      const limit = 100;
      let offset = 0;
      const all: Transaction[] = [];

      while (true) {
        const params = buildRangeParams();
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        const res = await fetch(`/api/transactions?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Failed to export transactions");
        }
        const batch: Transaction[] = await res.json();
        all.push(...batch);
        if (batch.length < limit) break;
        offset += limit;
      }

      const rows = [
        ["Date", "Order ID", "Items", "Subtotal", "Tax", "Total", "Payment Method"],
        ...all.map((t) => [
          format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm'),
          t.id.slice(-6),
          JSON.stringify(t.items),
          t.subtotal,
          t.tax,
          t.total,
          t.paymentMethod,
        ]),
        [],
        ["Item", "Quantity", "Revenue"],
        ...clothing.map((item) => [
          item.item,
          String(item.count),
          item.revenue.toFixed(2),
        ]),
      ];

      const csvContent = rows.map((row) => row.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `laundry-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export report", error);
    }
  };

  const exportReceipts = () => {
    try {
      const rows: string[][] = [
        ["Date", "Receipts", "Amount"],
        ...((receiptsData?.daily ?? []).map((r) => [
          r.date,
          String(r.receipts),
          String(r.amount),
        ])),
        [],
        ["Order #", "Customer", "Order Date", "Payment Date", "Paid Amount", "Order Total", "Total Paid", "Remaining", "Status"],
        ...((receiptsData?.details ?? []).map((d) => [
          d.orderNumber ?? (d.orderId ? d.orderId.slice(-6) : ''),
          d.customerName ?? '',
          d.orderDate ? format(new Date(d.orderDate), 'yyyy-MM-dd HH:mm') : '',
          d.paymentDate ? format(new Date(d.paymentDate), 'yyyy-MM-dd HH:mm') : '',
          String(d.paymentAmount),
          d.orderTotal != null ? String(d.orderTotal) : '',
          d.totalPaid != null ? String(d.totalPaid) : '',
          d.remaining != null ? String(d.remaining) : '',
          d.status,
        ])),
      ];
      const csvContent = rows.map((row) => row.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pay-later-receipts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export receipts", error);
    }
  };

  return (
    <div className="full-bleed flex-1 p-6 bg-pos-background">
      <div className="w-full max-w-none">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="h-8 w-8 text-pos-primary" />
            <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          </div>

          <div className="flex items-center space-x-4">
            <DatePickerWithRange
              date={dateRange}
              onDateChange={setDateRange}
            />
            {isSuperAdmin && (
              <UiSelect value={reportsBranchId || branch?.id || undefined} onValueChange={(v) => setReportsBranchId(v)}>
                <UiSelectTrigger className="w-[200px]">
                  <UiSelectValue placeholder="All branches" />
                </UiSelectTrigger>
                <UiSelectContent>
                  {(branches as Branch[]).map((b) => (
                    <UiSelectItem key={b.id} value={b.id}>{b.name}</UiSelectItem>
                  ))}
                </UiSelectContent>
              </UiSelect>
            )}
            <Button onClick={() => { void exportReport(); }} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">
                From {totalOrders} orders
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOrders}</div>
              <p className="text-xs text-muted-foreground">
                In selected period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(averageOrderValue)}</div>
              <p className="text-xs text-muted-foreground">
                Per transaction
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="services" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-1">
            <TabsTrigger value="services" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Services</span>
              <span className="sm:hidden">Svc</span>
            </TabsTrigger>
            <TabsTrigger value="items" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Clothing Items</span>
              <span className="sm:hidden">Items</span>
            </TabsTrigger>
            <TabsTrigger value="daily" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Daily Revenue</span>
              <span className="sm:hidden">Daily</span>
            </TabsTrigger>
            <TabsTrigger value="packages" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Packages</span>
              <span className="sm:hidden">Pkgs</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Payment Methods</span>
              <span className="sm:hidden">Pay</span>
            </TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Recent Orders</span>
              <span className="sm:hidden">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="orderLogs" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Order Logs</span>
              <span className="sm:hidden">Logs</span>
            </TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Pay-Later Receipts</span>
              <span className="sm:hidden">Receipts</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Service Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {services.length === 0 ? (
                  <div className="text-sm text-gray-500">No service data found for the selected period.</div>
                ) : (
                  <div className="space-y-4">
                    {services.map((service) => (
                      <div key={service.service} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{service.service}</h3>
                          <p className="text-sm text-gray-600">{service.count} items processed</p>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">{formatCurrency(service.revenue)}</div>
                          <div className="text-sm text-gray-600">
                            {formatCurrency(service.count ? service.revenue / service.count : 0)} avg
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="packages" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle>Top Packages</CardTitle>
                <div className="flex items-center gap-2">
                  <PackageIcon className="h-4 w-4 text-muted-foreground" />
                  <Select value={range} onValueChange={(v) => setRange(v as any)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {topPackages.length === 0 ? (
                  <div className="text-sm text-gray-500">No package sales found for the selected period.</div>
                ) : (
                  <div className="space-y-3">
                    {topPackages.map((p) => (
                      <div key={p.pkg} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">{p.pkg}</div>
                          <div className="text-xs text-gray-600">{p.count} sold</div>
                        </div>
                        <div className="font-bold">{formatCurrency(p.revenue)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="items" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Clothing Item Performance</CardTitle>
              </CardHeader>
              <CardContent>
                {clothing.length === 0 ? (
                  <div className="text-sm text-gray-500">No clothing item data found for the selected period.</div>
                ) : (
                  <div className="space-y-4">
                    {clothing.map((item) => (
                      <div key={item.item} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{item.item}</h3>
                          <p className="text-sm text-gray-600">{item.count} items processed</p>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">{formatCurrency(item.revenue)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="daily" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyRows.length === 0 ? (
                  <div className="text-sm text-gray-500">No revenue recorded for the selected period.</div>
                ) : (
                  <div className="space-y-2">
                    {dailyRows.map((row) => (
                      <div key={row.date} className="flex items-center justify-between p-3 border rounded">
                        <span className="font-medium">
                          {format(new Date(row.date), 'MMM dd, yyyy')}
                        </span>
                        <span className="font-bold">{formatCurrency(row.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentMethods.length === 0 ? (
                  <div className="text-sm text-gray-500">No payments recorded for the selected period.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {paymentMethods.map((method) => (
                      <div key={method.method} className="p-4 border rounded-lg">
                        <h3 className="font-medium capitalize mb-2">{method.method} Payments</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Orders:</span>
                            <span className="font-medium">{method.count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Total:</span>
                            <span className="font-bold">{formatCurrency(method.revenue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Average:</span>
                            <span className="font-medium">{formatCurrency(method.count ? method.revenue / method.count : 0)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                {recentTransactionsToShow.length === 0 ? (
                  <div className="text-sm text-gray-500">No transactions found for the selected period.</div>
                ) : (
                  <div className="space-y-3">
                    {recentTransactionsToShow.map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="font-medium">Order #{transaction.id.slice(-6)}</div>
                          <div className="text-sm text-gray-600">
                            {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                          </div>
                          <div className="text-sm text-gray-600 capitalize">
                            {transaction.paymentMethod} • {transaction.sellerName}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">{formatCurrency(transaction.total)}</div>
                          <div className="text-sm text-gray-600">
                            {((transaction.items as any[]) || []).length} items
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orderLogs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Order Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <OrderLogsTable />
          </CardContent>
          </Card>
        </TabsContent>

        {/* Pay-Later Receipts tab content */}
        <TabsContent value="receipts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Pay-Later Receipts by Payment Date{branch?.name ? ` — ${branch.name}` : ''}</CardTitle>
              <Button onClick={() => { exportReceipts(); }} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              {(!receiptsData || receiptsData.daily.length === 0) ? (
                <div className="text-sm text-gray-500">No receipts recorded for the selected period.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 border rounded p-1">
                      <Button size="sm" variant={receiptsView === 'payment' ? 'default' : 'ghost'} onClick={() => setReceiptsView('payment')}>By Payment Date</Button>
                      <Button size="sm" variant={receiptsView === 'order' ? 'default' : 'ghost'} onClick={() => setReceiptsView('order')}>By Order Date</Button>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Show outstanding only</label>
                      <input type="checkbox" checked={showOutstandingOnly} onChange={(e) => setShowOutstandingOnly(e.target.checked)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 border rounded">
                      <div className="text-xs text-muted-foreground">Total Receipts</div>
                      <div className="text-xl font-semibold">{receiptsData.totalReceipts}</div>
                    </div>
                    <div className="p-3 border rounded">
                      <div className="text-xs text-muted-foreground">Total Amount</div>
                      <div className="text-xl font-semibold">{formatCurrency(receiptsData.totalAmount)}</div>
                    </div>
                  </div>
                  {/* Overlay chart */}
                  <div className="p-3 border rounded">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-muted-foreground">Overlay: Receipts (Payment Date) vs Pay-Later (Order Date)</div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-4 bg-blue-600" /> Receipts</span>
                        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-4 bg-emerald-600" /> Orders</span>
                      </div>
                    </div>
                    <svg viewBox="0 0 600 160" className="w-full h-40">
                      <rect x="0" y="0" width="600" height="160" fill="transparent" />
                      {overlay.dates.length > 1 && (
                        <>
                          {/* Receipts line */}
                          <polyline
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="2"
                            points={overlay.pointsPay.map((p, i) => {
                              const x = (i / (overlay.pointsPay.length - 1)) * 580 + 10;
                              const y = 150 - (p.value / overlay.maxVal) * 140;
                              return `${x},${y}`;
                            }).join(' ')}
                          />
                          {/* Orders line */}
                          <polyline
                            fill="none"
                            stroke="#059669"
                            strokeWidth="2"
                            points={overlay.pointsOrd.map((p, i) => {
                              const x = (i / (overlay.pointsOrd.length - 1)) * 580 + 10;
                              const y = 150 - (p.value / overlay.maxVal) * 140;
                              return `${x},${y}`;
                            }).join(' ')}
                          />
                        </>
                      )}
                    </svg>
                  </div>

                  <div className="space-y-2">
                    {(receiptsView === 'payment' ? receiptsData.daily : (payLaterOrderDate?.daily ?? [])).map((row: any) => (
                      <div key={row.date} className="flex items-center justify-between p-3 border rounded">
                        <span className="font-medium">{format(new Date(row.date), 'MMM dd, yyyy')}</span>
                        {receiptsView === 'payment' ? (
                          <>
                            <span className="text-sm text-muted-foreground mr-3">{row.receipts} receipts</span>
                            <span className="font-bold">{formatCurrency(row.amount)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-muted-foreground mr-3">{row.orders} orders</span>
                            <span className="font-bold">{formatCurrency(row.revenue)}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="text-sm font-medium mb-2">Receipt Details</div>
                    <div className="overflow-x-auto border rounded">
                      <table className="min-w-full text-sm">
                        <thead className="bg-[var(--surface-muted)]">
                          <tr>
                            <th className="text-left p-2">Order #</th>
                            <th className="text-left p-2">Customer</th>
                            <th className="text-left p-2">Order Date</th>
                            <th className="text-left p-2">Payment Date</th>
                            <th className="text-right p-2">Paid Amount</th>
                            <th className="text-right p-2">Order Total</th>
                            <th className="text-right p-2">Total Paid</th>
                            <th className="text-right p-2">Remaining</th>
                            <th className="text-left p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {((receiptsData.details ?? []).filter((d) => showOutstandingOnly ? (d.status !== 'paid') : true)).map((d, idx) => (
                            <tr key={d.orderId ?? `${d.paymentDate}-${idx}`} className="border-t">
                              <td className="p-2">{d.orderNumber ?? (d.orderId ? d.orderId.slice(-6) : '')}</td>
                              <td className="p-2">{d.customerName ?? ''}</td>
                              <td className="p-2">{d.orderDate ? format(new Date(d.orderDate), 'MMM dd, yyyy HH:mm') : ''}</td>
                              <td className="p-2">{format(new Date(d.paymentDate), 'MMM dd, yyyy HH:mm')}</td>
                              <td className="p-2 text-right">{formatCurrency(d.paymentAmount)}</td>
                              <td className="p-2 text-right">{d.orderTotal != null ? formatCurrency(d.orderTotal) : '-'}</td>
                              <td className="p-2 text-right">{d.totalPaid != null ? formatCurrency(d.totalPaid) : '-'}</td>
                              <td className="p-2 text-right">{d.remaining != null ? formatCurrency(d.remaining) : '-'}</td>
                              <td className="p-2 capitalize">{d.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
