import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useCurrency } from "@/lib/currency";
import { useAuthContext } from "@/context/AuthContext";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area
} from "recharts";
import { PieChart, Pie, Cell } from "recharts";
import { 
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  FileText,
  Target,
  CreditCard,
  Users,
  Package,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { apiRequest } from "@/lib/queryClient";

type FinancialPoint = {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
  orders: number;
  avgOrderValue: number;
};

type PaymentMethodData = {
  method: string;
  amount: number;
  percentage: number;
  transactions: number;
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d'];

export function FinancialReportsManager() {
  const { formatCurrency } = useCurrency();
  const { user, branch } = useAuthContext();
  
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });

  // Fetch live report summary for this admin's branch
  const { data: summary } = useQuery<{
    transactions: any[];
    orders: any[];
    customers: any[];
    payments: any[];
    laundryServices: any[];
  }>({
    queryKey: ["/api/report/summary"],
  });

  const transactions = summary?.transactions ?? [];
  const orders = summary?.orders ?? [];
  const payments = summary?.payments ?? [];
  const { data: customization } = useQuery<any>({
    queryKey: branch?.id ? ["/api/branches", branch.id, "customization"] : ["customization:disabled"],
    enabled: !!branch?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/branches/${branch!.id}/customization`);
      return res.json();
    }
  });
  const { data: expenseReport } = useQuery<{ byMonth: { month: string; total: number }[]; byCategory: { category: string; total: number }[] }>({
    queryKey: ["/api/reports/expenses"],
    enabled: !!customization?.expensesEnabled,
  });

  // Helpers for month aggregation
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const lastNMonths = (n: number) => {
    const now = new Date();
    const months: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d));
    }
    return months;
  };

  // Build financial series from real payments and orders
  const financialData: FinancialPoint[] = useMemo(() => {
    const months = lastNMonths(6);
    const revenueByMonth: Record<string, number> = {};
    payments.forEach((p: any) => {
      const key = monthKey(new Date(p.createdAt));
      revenueByMonth[key] = (revenueByMonth[key] || 0) + parseFloat(p.amount);
    });
    const ordersByMonth: Record<string, number> = {};
    orders.forEach((o: any) => {
      const key = monthKey(new Date(o.createdAt));
      ordersByMonth[key] = (ordersByMonth[key] || 0) + 1;
    });
    const expenseByMonth: Record<string, number> = {};
    (expenseReport?.byMonth || []).forEach((e) => { expenseByMonth[e.month] = e.total; });

    return months.map((m) => {
      const revenue = revenueByMonth[m] || 0;
      const ordersCount = ordersByMonth[m] || 0;
      const expenses = expenseByMonth[m] || 0;
      const profit = revenue - expenses;
      return {
        period: m,
        revenue,
        expenses,
        profit,
        orders: ordersCount,
        avgOrderValue: ordersCount > 0 ? revenue / ordersCount : 0,
      };
    });
  }, [payments, orders, expenseReport]);

  // Payment method breakdown from real payments
  const paymentMethodData: PaymentMethodData[] = useMemo(() => {
    const totals: Record<string, { amount: number; transactions: number }> = {};
    payments.forEach((p: any) => {
      const method = p.paymentMethod || "unknown";
      const amt = parseFloat(p.amount);
      if (!totals[method]) totals[method] = { amount: 0, transactions: 0 };
      totals[method].amount += amt;
      totals[method].transactions += 1;
    });
    const totalAmount = Object.values(totals).reduce((s, v) => s + v.amount, 0) || 1;
    return Object.entries(totals).map(([method, v]) => ({
      method: method === "pay_later" ? "Pay Later" : method.charAt(0).toUpperCase() + method.slice(1),
      amount: v.amount,
      percentage: Math.round((v.amount / totalAmount) * 1000) / 10,
      transactions: v.transactions,
    }));
  }, [payments]);

  const currentMonthData = financialData[financialData.length - 1] || {
    period: "",
    revenue: 0,
    expenses: 0,
    profit: 0,
    orders: 0,
    avgOrderValue: 0,
  };
  const previousMonthData = financialData[financialData.length - 2] || currentMonthData;
  
  const revenueGrowth = previousMonthData 
    ? ((currentMonthData.revenue - previousMonthData.revenue) / previousMonthData.revenue * 100)
    : 0;
  
  const profitGrowth = previousMonthData 
    ? ((currentMonthData.profit - previousMonthData.profit) / previousMonthData.profit * 100)
    : 0;

  const totalExpenses = (expenseReport?.byCategory || []).reduce((s, c) => s + c.total, 0);
  const profitMargin = currentMonthData.revenue > 0 
    ? (currentMonthData.profit / currentMonthData.revenue * 100) 
    : 0;

  const renderGrowthIndicator = (growth: number) => {
    const isPositive = growth >= 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const colorClass = isPositive ? "text-green-600" : "text-red-600";
    
    return (
      <div className={`flex items-center gap-1 ${colorClass}`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">
          {isPositive ? "+" : ""}{growth.toFixed(1)}%
        </span>
      </div>
    );
  };

  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">
            Access denied. Only administrators can view financial reports.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Advanced Financial Reports
          </CardTitle>
          <CardDescription>
            Comprehensive financial analysis, profit/loss tracking, and expense management
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Financial KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(currentMonthData.revenue)}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">vs last month</p>
              {renderGrowthIndicator(revenueGrowth)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Profit</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(currentMonthData.profit)}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">vs last month</p>
              {renderGrowthIndicator(profitGrowth)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {profitMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              of total revenue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(currentMonthData.avgOrderValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {currentMonthData.orders} orders this month
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="profit-loss" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger>
          {customization?.expensesEnabled && (
            <TabsTrigger value="expenses">Expense Breakdown</TabsTrigger>
          )}
          <TabsTrigger value="payments">Payment Methods</TabsTrigger>
          <TabsTrigger value="trends">Trends Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="profit-loss" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Statement</CardTitle>
              <CardDescription>Monthly revenue, expenses, and profit analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={financialData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip 
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stackId="1"
                    stroke="#8884d8" 
                    fill="#8884d8" 
                    fillOpacity={0.6}
                    name="Revenue"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="expenses" 
                    stackId="2"
                    stroke="#82ca9d" 
                    fill="#82ca9d" 
                    fillOpacity={0.6}
                    name="Expenses"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="profit" 
                    stackId="3"
                    stroke="#ffc658" 
                    fill="#ffc658" 
                    fillOpacity={0.6}
                    name="Profit"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* P&L Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Current Month Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium">Total Revenue</span>
                  <span className="font-bold text-green-600">
                    {formatCurrency(currentMonthData.revenue)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium">Total Expenses</span>
                  <span className="font-bold text-red-600">
                    -{formatCurrency(currentMonthData.expenses)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b bg-muted p-2 rounded">
                  <span className="font-bold">Net Profit</span>
                  <span className="font-bold text-xl">
                    {formatCurrency(currentMonthData.profit)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {customization?.expensesEnabled ? (
        <TabsContent value="expenses" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Expense Distribution</CardTitle>
                <CardDescription>Breakdown of monthly expenses by category</CardDescription>
              </CardHeader>
              <CardContent>
                {expenseReport && expenseReport.byCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={expenseReport.byCategory}
                        dataKey="total"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(entry) => `${entry.category}: ${((entry.total / Math.max(totalExpenses, 1)) * 100).toFixed(1)}%`}
                      >
                        {expenseReport.byCategory.map((entry, idx) => (
                          <Cell key={entry.category} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'Expense']} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState title="No expense data" description="No expenses recorded for this month." icon={<AlertTriangle className="h-8 w-8 text-gray-400" />} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expense Categories</CardTitle>
                <CardDescription>Detailed breakdown with amounts</CardDescription>
              </CardHeader>
              <CardContent>
                {expenseReport && expenseReport.byCategory.length > 0 ? (
                  <div className="space-y-3">
                    {expenseReport.byCategory.map((row, index) => (
                      <div key={row.category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                          <span className="font-medium">{row.category}</span>
                        </div>
                        <div className="font-bold">{formatCurrency(row.total)}</div>
                        <Badge variant="outline">{((row.total / Math.max(totalExpenses, 1)) * 100).toFixed(1)}%</Badge>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span>Total Expenses</span>
                      <span>{formatCurrency(totalExpenses)}</span>
                    </div>
                  </div>
                ) : (
                  <EmptyState title="No expense categories" description="No expenses recorded for this month." icon={<AlertTriangle className="h-8 w-8 text-gray-400" />} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        ) : null}

        <TabsContent value="payments" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Revenue</CardTitle>
                <CardDescription>Revenue breakdown by payment method</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={paymentMethodData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="method" />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                    <Tooltip 
                      formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                    />
                    <Bar dataKey="amount" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Statistics</CardTitle>
                <CardDescription>Transaction counts and averages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {paymentMethodData.map((payment) => (
                    <div key={payment.method} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          <span className="font-medium">{payment.method}</span>
                        </div>
                        <Badge variant="outline">{payment.percentage}%</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <div className="text-muted-foreground">Revenue</div>
                          <div className="font-medium">{formatCurrency(payment.amount)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Transactions</div>
                          <div className="font-medium">{payment.transactions}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Avg Value</div>
                          <div className="font-medium">
                            {formatCurrency(payment.amount / payment.transactions)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Financial Trends</CardTitle>
              <CardDescription>Revenue and profit trends over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={financialData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), ""]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#8884d8" 
                    strokeWidth={3}
                    name="Revenue"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="profit" 
                    stroke="#82ca9d" 
                    strokeWidth={3}
                    name="Profit"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Financial Insights */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {revenueGrowth >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  )}
                  <span className="text-lg font-bold">
                    {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth.toFixed(1)}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Month-over-month growth
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profit Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  <span className="text-lg font-bold">{profitMargin.toFixed(1)}%</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Current profit margin
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost Efficiency</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <span className="text-lg font-bold">
                    {currentMonthData.revenue > 0 ? ((currentMonthData.expenses / currentMonthData.revenue) * 100).toFixed(1) : "0.0"}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Expense-to-revenue ratio
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Export Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium">Export Reports</h3>
              <p className="text-sm text-muted-foreground">
                Download detailed financial reports for accounting and analysis
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline">
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
