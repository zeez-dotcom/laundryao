import { CustomerAuthProvider, useCustomerAuth } from "@/context/CustomerAuthContext";
import { EnhancedPackageDisplay } from "@/components/EnhancedPackageDisplay";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

function DashboardContent() {
  const { isAuthenticated, isLoading: authLoading } = useCustomerAuth();

  const { data: packages = [], isLoading: pkgLoading } = useQuery<any[]>({
    queryKey: ["/customer/packages"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/customer/packages");
      if (!res.ok) throw new Error("Failed to load packages");
      return await res.json();
    },
    enabled: isAuthenticated,
  });

  if (authLoading || pkgLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div className="p-4">Please log in to view packages.</div>;
  }

  return (
    <div className="p-4">
      <EnhancedPackageDisplay packages={packages} onUsePackage={() => {}} />
    </div>
  );
}

export default function CustomerDashboardPage() {
  return (
    <CustomerAuthProvider>
      <DashboardContent />
    </CustomerAuthProvider>
  );
}
