import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, DollarSign, Calendar, Download, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Transaction } from "@shared/schema";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { OrderLogsTable } from "./order-logs-table";

export function ReportsDashboard() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [serviceFilter, setServiceFilter] = useState("all");

  // Fetch transactions with pagination based on date range
  const { data: transactions = [] } = useQuery({
    queryKey: [
      "/api/transactions",
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
    ],
    queryFn: async () => {
      const limit = 100;
      const params = new URLSearchParams();
      if (dateRange?.from)
        params.set("start", startOfDay(dateRange.from).toISOString());
      if (dateRange?.to)
        params.set("end", endOfDay(dateRange.to).toISOString());
      let all: Transaction[] = [];
      let offset = 0;
      while (true) {
        const search = new URLSearchParams(params);
        search.set("limit", String(limit));
        search.set("offset", String(offset));
        const response = await fetch(`/api/transactions?${search.toString()}`);
        const batch: Transaction[] = await response.json();
        all = all.concat(batch);
        if (batch.length < limit) break;
        offset += limit;
      }
      return all;
    },
  }) as { data: Transaction[] };

  // Filter transactions by date range
  const filteredTransactions = transactions.filter(transaction => {
    if (!dateRange?.from || !dateRange?.to) return true;
    const transactionDate = new Date(transaction.createdAt);
    return transactionDate >= startOfDay(dateRange.from) &&
           transactionDate <= endOfDay(dateRange.to);
  });

  // Calculate metrics
  const totalRevenue = filteredTransactions.reduce((sum, t) => sum + parseFloat(t.total), 0);
  const totalOrders = filteredTransactions.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Service breakdown
  const serviceBreakdown = filteredTransactions.reduce((acc, transaction) => {
    const items = transaction.items as any[];
    items.forEach(item => {
      const serviceName =
        typeof item.service === "string"
          ? item.service
          : item.service?.name || "Unknown Service";
      if (!acc[serviceName]) {
        acc[serviceName] = { count: 0, revenue: 0 };
      }
      acc[serviceName].count += item.quantity || 1;
      acc[serviceName].revenue += item.total || 0;
    });
    return acc;
  }, {} as Record<string, { count: number; revenue: number }>);

  // Clothing item breakdown
  const clothingBreakdown = filteredTransactions.reduce((acc, transaction) => {
    const items = transaction.items as any[];
    items.forEach(item => {
      const clothingName =
        typeof item.clothingItem === "string"
          ? item.clothingItem
          : item.clothingItem?.name || "Unknown Item";
      if (!acc[clothingName]) {
        acc[clothingName] = { count: 0, revenue: 0 };
      }
      acc[clothingName].count += item.quantity || 1;
      acc[clothingName].revenue += item.total || 0;
    });
    return acc;
  }, {} as Record<string, { count: number; revenue: number }>);

  // Daily revenue data
  const dailyRevenue = filteredTransactions.reduce((acc, transaction) => {
    const date = format(new Date(transaction.createdAt), 'yyyy-MM-dd');
    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date] += parseFloat(transaction.total);
    return acc;
  }, {} as Record<string, number>);

  // Payment method breakdown
  const paymentMethods = filteredTransactions.reduce((acc, transaction) => {
    const method = transaction.paymentMethod;
    if (!acc[method]) {
      acc[method] = { count: 0, amount: 0 };
    }
    acc[method].count += 1;
    acc[method].amount += parseFloat(transaction.total);
    return acc;
  }, {} as Record<string, { count: number; amount: number }>);

  const exportReport = () => {
    const csvContent = [
      ["Date", "Order ID", "Items", "Subtotal", "Tax", "Total", "Payment Method"],
      ...filteredTransactions.map(t => [
        format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm'),
        t.id.slice(-6),
        JSON.stringify(t.items),
        t.subtotal,
        t.tax,
        t.total,
        t.paymentMethod
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laundry-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
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
            <Button onClick={exportReport} variant="outline">
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
              <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
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
              <div className="text-2xl font-bold">${averageOrderValue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Per transaction
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="services" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
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
                <div className="space-y-4">
                  {Object.entries(serviceBreakdown)
                    .sort(([,a], [,b]) => b.revenue - a.revenue)
                    .map(([service, data]) => (
                    <div key={service} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h3 className="font-medium">{service}</h3>
                        <p className="text-sm text-gray-600">{data.count} items processed</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg">${data.revenue.toFixed(2)}</div>
                        <div className="text-sm text-gray-600">
                          ${(data.revenue / data.count).toFixed(2)} avg
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="items" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Clothing Item Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(clothingBreakdown)
                    .sort(([,a], [,b]) => b.revenue - a.revenue)
                    .map(([item, data]) => (
                      <div key={item} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{item}</h3>
                          <p className="text-sm text-gray-600">{data.count} items processed</p>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">${data.revenue.toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="daily" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(dailyRevenue)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 10)
                    .map(([date, revenue]) => (
                    <div key={date} className="flex items-center justify-between p-3 border rounded">
                      <span className="font-medium">
                        {format(new Date(date), 'MMM dd, yyyy')}
                      </span>
                      <span className="font-bold">${revenue.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(paymentMethods).map(([method, data]) => (
                    <div key={method} className="p-4 border rounded-lg">
                      <h3 className="font-medium capitalize mb-2">{method} Payments</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Orders:</span>
                          <span className="font-medium">{data.count}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Total:</span>
                          <span className="font-bold">${data.amount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Average:</span>
                          <span className="font-medium">${(data.amount / data.count).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredTransactions.slice(0, 20).map((transaction) => (
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
                        <div className="font-bold text-lg">${parseFloat(transaction.total).toFixed(2)}</div>
                        <div className="text-sm text-gray-600">
                          {((transaction.items as any[]) || []).length} items
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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