import React, { Suspense, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const CategoryManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/CategoryManager")
);
const UserManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/UserManager")
);
const BranchManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchManager").then(
    (m) => ({ default: m.BranchManager })
  )
);
const BranchSettings = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchSettings").then(
    (m) => ({ default: m.BranchSettings })
  )
);
const BulkUploadManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BulkUploadManager").then(
    (m) => ({ default: m.BulkUploadManager })
  )
);
const CouponManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/CouponManager").then(
    (m) => ({ default: m.CouponManager })
  )
);
const SuperAdminDashboard = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/SuperAdminDashboard").then(
    (m) => ({ default: m.SuperAdminDashboard })
  )
);
const BranchCustomizationManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchCustomizationManager").then(
    (m) => ({ default: m.BranchCustomizationManager })
  )
);
const FinancialReportsManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/FinancialReportsManager").then(
    (m) => ({ default: m.FinancialReportsManager })
  )
);
const ExpenseManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/ExpenseManager").then(
    (m) => ({ default: m.ExpenseManager })
  )
);
const BranchDeliveryManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchDeliveryManager").then(
    (m) => ({ default: m.BranchDeliveryManager })
  )
);
const CustomerDashboardManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/CustomerDashboardManager").then(
    (m) => ({ default: m.CustomerDashboardManager })
  )
);
const BranchQRCodeManager = React.lazy(() =>
  import(/* webpackPrefetch: true */ "@/components/admin/BranchQRCodeManager").then(
    (m) => ({ default: m.BranchQRCodeManager })
  )
);

export default function AdminDashboard() {
  const { user, branch, isSuperAdmin, isAdmin } = useAuthContext();
  
  // Helper variables to handle role combinations properly
  const isAdminLike = isAdmin || isSuperAdmin;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Helper function to get available sections based on user roles
  const getAvailableSections = () => {
    const sections = [
      { value: "categories", label: "Categories", icon: Tags },
    ];

    if (isAdminLike) {
      sections.push(
        { value: "branch-settings", label: "Branch Settings", icon: Store },
        { value: "qr-management", label: "QR Code Management", icon: QrCode },
        { value: "delivery-management", label: "Delivery Management", icon: Truck },
        { value: "customization", label: "Customization", icon: TicketPercent },
        { value: "customer-dashboard", label: "Customer Dashboard", icon: TicketPercent },
        { value: "financial-reports", label: "Financial Reports", icon: BarChart3 },
        { value: "expenses", label: "Expenses", icon: DollarSign },
        { value: "coupons", label: "Coupons", icon: TicketPercent }
      );
    }


    if (isAdminLike) {
      sections.push(
        // Super admin only sections
        ...(isSuperAdmin ? [
          { value: "branches", label: "Branches", icon: MapPin },
          { value: "users", label: "Users", icon: Users },
        ] : []),
        // Bulk Upload available to both admin and super admin
        { value: "bulk-upload", label: "Bulk Upload", icon: Upload }
      );
    }

    return sections;
  };

  const availableSections = getAvailableSections();
  
  // State management for selectedSection
  const [selectedSection, setSelectedSection] = useState(() => {
    return availableSections.length > 0 ? availableSections[0].value : "categories";
  });

  // Reset selectedSection if it becomes invalid when availableSections changes
  useEffect(() => {
    const isCurrentSectionValid = availableSections.some(section => section.value === selectedSection);
    if (!isCurrentSectionValid && availableSections.length > 0) {
      setSelectedSection(availableSections[0].value);
    }
  }, [availableSections, selectedSection]);

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <img src={logoUrl} alt="Laundry Logo" className="w-8 h-8 object-cover rounded" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Laundry Management - Admin
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to POS
                </Button>
              </Link>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {user.firstName} {user.lastName} ({user.role})
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={logoutMutation.isPending}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Admin Dashboard
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Manage system settings, categories, users, and branches
          </p>
        </div>

        <div className="space-y-6">
          {/* Dropdown Section Selector */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Select Section
              </h3>
            </div>
            <Select 
              value={selectedSection} 
              onValueChange={setSelectedSection}
              data-testid="select-admin-section"
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a section to manage" />
              </SelectTrigger>
              <SelectContent>
                {availableSections.map((section) => {
                  const IconComponent = section.icon;
                  return (
                    <SelectItem 
                      key={section.value} 
                      value={section.value}
                      data-testid={`select-option-${section.value}`}
                    >
                      <div className="flex items-center gap-2">
                        <IconComponent className="w-4 h-4" />
                        {section.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Content Area */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border shadow-sm" data-testid={`content-${selectedSection}`}>
            <Suspense fallback={<LoadingScreen />}>
              {selectedSection === "categories" && <CategoryManager />}
              {selectedSection === "branch-settings" && isAdminLike && <BranchSettings />}
              {selectedSection === "qr-management" && isAdminLike && <BranchQRCodeManager />}
              {selectedSection === "delivery-management" && isAdminLike && <BranchDeliveryManager />}
              {selectedSection === "customization" && isAdminLike && <BranchCustomizationManager />}
              {selectedSection === "customer-dashboard" && isAdminLike && <CustomerDashboardManager />}
              {selectedSection === "financial-reports" && isAdminLike && <FinancialReportsManager />}
              {selectedSection === "expenses" && isAdminLike && <ExpenseManager />}
              {selectedSection === "coupons" && isAdminLike && <CouponManager />}
              {selectedSection === "branches" && isSuperAdmin && <BranchManager />}
              {selectedSection === "users" && isSuperAdmin && <UserManager />}
              {selectedSection === "bulk-upload" && isAdminLike && <BulkUploadManager />}
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
