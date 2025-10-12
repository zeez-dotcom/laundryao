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

  const [range, setRange] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');

  const startIso = dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined;
  const endIso = dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined;

  const buildRangeParams = () => {
    const params = new URLSearchParams();
    if (startIso) params.set("start", startIso);
    if (endIso) params.set("end", endIso);
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

  return (
    <div className="flex-1 p-6 bg-pos-background">
      <div className="max-w-7xl mx-auto">
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
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-1">
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
        </Tabs>
      </div>
    </div>
  );
}
