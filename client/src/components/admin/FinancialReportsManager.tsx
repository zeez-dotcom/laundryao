import React, { useState } from "react";
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
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from "recharts";
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

type FinancialData = {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
  orders: number;
  avgOrderValue: number;
};

type ExpenseCategory = {
  category: string;
  amount: number;
  percentage: number;
  color: string;
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

  // Mock data - In real implementation, these would be API calls
  const financialData: FinancialData[] = [
    { period: "Jan", revenue: 45000, expenses: 32000, profit: 13000, orders: 450, avgOrderValue: 100 },
    { period: "Feb", revenue: 52000, expenses: 35000, profit: 17000, orders: 520, avgOrderValue: 100 },
    { period: "Mar", revenue: 48000, expenses: 33000, profit: 15000, orders: 480, avgOrderValue: 100 },
    { period: "Apr", revenue: 61000, expenses: 38000, profit: 23000, orders: 610, avgOrderValue: 100 },
    { period: "May", revenue: 55000, expenses: 36000, profit: 19000, orders: 550, avgOrderValue: 100 },
    { period: "Jun", revenue: 67000, expenses: 40000, profit: 27000, orders: 670, avgOrderValue: 100 },
  ];

  const expenseData: ExpenseCategory[] = [
    { category: "Rent & Utilities", amount: 15000, percentage: 37.5, color: "#0088FE" },
    { category: "Staff Wages", amount: 12000, percentage: 30, color: "#00C49F" },
    { category: "Cleaning Supplies", amount: 6000, percentage: 15, color: "#FFBB28" },
    { category: "Equipment Maintenance", amount: 4000, percentage: 10, color: "#FF8042" },
    { category: "Marketing", amount: 2000, percentage: 5, color: "#8884D8" },
    { category: "Other", amount: 1000, percentage: 2.5, color: "#82ca9d" },
  ];

  const paymentMethodData: PaymentMethodData[] = [
    { method: "Cash", amount: 28000, percentage: 42, transactions: 280 },
    { method: "Card", amount: 25000, percentage: 37, transactions: 250 },
    { method: "Pay Later", amount: 14000, percentage: 21, transactions: 140 },
  ];

  const currentMonthData = financialData[financialData.length - 1];
  const previousMonthData = financialData[financialData.length - 2];
  
  const revenueGrowth = previousMonthData 
    ? ((currentMonthData.revenue - previousMonthData.revenue) / previousMonthData.revenue * 100)
    : 0;
  
  const profitGrowth = previousMonthData 
    ? ((currentMonthData.profit - previousMonthData.profit) / previousMonthData.profit * 100)
    : 0;

  const totalExpenses = expenseData.reduce((sum, expense) => sum + expense.amount, 0);
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
          <TabsTrigger value="expenses">Expense Breakdown</TabsTrigger>
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

        <TabsContent value="expenses" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Expense Distribution</CardTitle>
                <CardDescription>Breakdown of monthly expenses by category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={expenseData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ category, percentage }) => `${category}: ${percentage}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="amount"
                    >
                      {expenseData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expense Categories</CardTitle>
                <CardDescription>Detailed breakdown with amounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {expenseData.map((expense, index) => (
                    <div key={expense.category} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: expense.color }}
                        />
                        <span className="font-medium">{expense.category}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCurrency(expense.amount)}</div>
                        <div className="text-sm text-muted-foreground">
                          {expense.percentage}%
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between items-center font-bold">
                      <span>Total Expenses</span>
                      <span>{formatCurrency(totalExpenses)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

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
                    {((currentMonthData.expenses / currentMonthData.revenue) * 100).toFixed(1)}%
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