import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";
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
  Cell
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  Users, 
  Building2,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

type GlobalStats = {
  totalRevenue: number;
  revenueGrowth: number;
  totalOrders: number;
  orderGrowth: number;
  activeUsers: number;
  activeBranches: number;
  totalBranches: number;
};

type BranchPerformance = {
  branchId: string;
  branchName: string;
  branchCode: string;
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
  isActive: boolean;
};

type RevenueTrend = {
  month: string;
  revenue: number;
  orderCount: number;
};

type ServiceAnalytics = {
  serviceName: string;
  orderCount: number;
  revenue: number;
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export function GlobalReportsComponent() {
  const { formatCurrency } = useCurrency();

  const { data: globalStats } = useQuery<GlobalStats>({
    queryKey: ["/api/reports/global-stats"],
  });

  const { data: branchPerformance = [] } = useQuery<BranchPerformance[]>({
    queryKey: ["/api/reports/branch-performance"],
  });

  const { data: revenueTrends = [] } = useQuery<RevenueTrend[]>({
    queryKey: ["/api/reports/revenue-trends"],
  });

  const { data: serviceAnalytics = [] } = useQuery<ServiceAnalytics[]>({
    queryKey: ["/api/reports/service-analytics"],
  });

  const formatMonth = (monthStr: string) => {
    const date = new Date(monthStr + '-01');
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const renderGrowthIndicator = (growth: number) => {
    const isPositive = growth >= 0;
    const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
    const colorClass = isPositive ? "text-green-600" : "text-red-600";
    
    return (
      <div className={`flex items-center gap-1 ${colorClass}`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-medium">
          {Math.abs(growth).toFixed(1)}%
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Global KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(globalStats?.totalRevenue || 0)}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">vs last month</p>
              {globalStats?.revenueGrowth !== undefined && 
                renderGrowthIndicator(globalStats.revenueGrowth)
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {globalStats?.totalOrders?.toLocaleString() || "0"}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">vs last month</p>
              {globalStats?.orderGrowth !== undefined && 
                renderGrowthIndicator(globalStats.orderGrowth)
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {globalStats?.activeUsers?.toLocaleString() || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Branches</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {globalStats?.activeBranches || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              of {globalStats?.totalBranches || 0} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Revenue Trends */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trends</CardTitle>
            <CardDescription>Monthly revenue over the last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="month" 
                  tickFormatter={formatMonth}
                />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip 
                  labelFormatter={formatMonth}
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  dot={{ fill: '#8884d8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Branch Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Branch Performance</CardTitle>
            <CardDescription>Revenue comparison across all branches</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={branchPerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="branchCode" />
                <YAxis tickFormatter={(value) => formatCurrency(value)} />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), 'Revenue']}
                />
                <Bar dataKey="revenue" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tables Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Services */}
        <Card>
          <CardHeader>
            <CardTitle>Top Services</CardTitle>
            <CardDescription>Best performing services by revenue</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {serviceAnalytics.slice(0, 5).map((service, index) => (
                <div key={service.serviceName} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{service.serviceName}</p>
                      <p className="text-sm text-muted-foreground">
                        {service.orderCount} orders
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(service.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Branch Status */}
        <Card>
          <CardHeader>
            <CardTitle>Branch Status</CardTitle>
            <CardDescription>Overview of all branch locations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {branchPerformance.map((branch) => (
                <div key={branch.branchId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={branch.isActive ? "default" : "secondary"}>
                      {branch.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <div>
                      <p className="font-medium">{branch.branchName}</p>
                      <p className="text-sm text-muted-foreground">
                        {branch.branchCode}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(branch.revenue)}</p>
                    <p className="text-sm text-muted-foreground">
                      {branch.orderCount} orders
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}