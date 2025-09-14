import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/context/AuthContext";
import { 
  Building2, 
  Users, 
  DollarSign, 
  Package, 
  TrendingUp, 
  MapPin,
  Settings,
  BarChart3,
  Globe,
  Target
} from "lucide-react";
import { Link } from "wouter";
import { GlobalReportsComponent } from "./GlobalReportsComponent";

type Branch = {
  id: string;
  name: string;
  code: string;
  tagline?: string;
  logoUrl?: string;
  deliveryEnabled: boolean;
  serviceCityIds?: string[];
  deliveryUrl: string;
};

export function SuperAdminDashboard() {
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const { user } = useAuthContext();

  const { data: branches = [], isLoading: branchesLoading } = useQuery<Branch[]>({
    queryKey: ["/api/branches"],
  });

  const { data: globalStats = {} } = useQuery<{
    totalRevenue?: number;
    revenueGrowth?: number;
    totalOrders?: number;
    orderGrowth?: number;
    activeUsers?: number;
  }>({
    queryKey: ["/api/reports/global-stats"],
  });

  const { data: branchStats } = useQuery({
    queryKey: ["/api/reports/branch-stats", selectedBranch],
    enabled: selectedBranch !== "all",
  });

  const activeBranches = branches.filter(b => b.deliveryEnabled);
  const totalBranches = branches.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Global overview and branch management for all locations
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedBranch} onValueChange={setSelectedBranch}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Global Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Branches</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBranches}</div>
            <p className="text-xs text-muted-foreground">
              {activeBranches.length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Global Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${globalStats?.totalRevenue?.toLocaleString() || "0"}
            </div>
            <p className="text-xs text-muted-foreground">
              +{globalStats?.revenueGrowth || 0}% from last month
            </p>
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
            <p className="text-xs text-muted-foreground">
              +{globalStats?.orderGrowth || 0}% from last month
            </p>
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
              Across all branches
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Branch Navigation */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch) => (
          <Card key={branch.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{branch.name}</CardTitle>
                    <CardDescription>{branch.tagline || branch.code}</CardDescription>
                  </div>
                </div>
                <Badge variant={branch.deliveryEnabled ? "default" : "secondary"}>
                  {branch.deliveryEnabled ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {branch.serviceCityIds && branch.serviceCityIds.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {branch.serviceCityIds.length} service cities
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/admin/branch/${branch.id}`}>
                      <Settings className="h-4 w-4 mr-1" />
                      Manage
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/admin/reports/${branch.id}`}>
                      <BarChart3 className="h-4 w-4 mr-1" />
                      Reports
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={branch.deliveryUrl} target="_blank">
                      <Globe className="h-4 w-4 mr-1" />
                      Public
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Global Management Tabs */}
      <Tabs defaultValue="global-reports" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="global-reports" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Global Reports
          </TabsTrigger>
          <TabsTrigger value="branch-comparison" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Branch Comparison
          </TabsTrigger>
          <TabsTrigger value="system-settings" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            System Settings
          </TabsTrigger>
          <TabsTrigger value="user-management" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            User Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global-reports" className="space-y-4">
          <GlobalReportsComponent />
        </TabsContent>

        <TabsContent value="branch-comparison" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Branch Performance Comparison</CardTitle>
              <CardDescription>
                Compare revenue, orders, and efficiency across branches
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                Branch comparison charts will be displayed here
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system-settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System-wide Settings</CardTitle>
              <CardDescription>
                Configure global settings that apply to all branches
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                Global system settings will be displayed here
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="user-management" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Global User Management</CardTitle>
              <CardDescription>
                Manage users, roles, and permissions across all branches
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center text-muted-foreground py-8">
                User management interface will be displayed here
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}