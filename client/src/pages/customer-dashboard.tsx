import { CustomerAuthProvider, useCustomerAuth } from "@/context/CustomerAuthContext";
import { EnhancedPackageDisplay } from "@/components/EnhancedPackageDisplay";
import { CustomerOrders } from "@/components/customer-orders";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageSelector } from "@/components/language-selector";

function DashboardContent() {
  const { isAuthenticated, isLoading: authLoading, customer } = useCustomerAuth() as any;
  const { branch } = useAuthContext();

  const { data: packages = [], isLoading: pkgLoading } = useQuery<any[]>({
    queryKey: ["/customer/packages"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/customer/packages");
      if (!res.ok) throw new Error("Failed to load packages");
      return await res.json();
    },
    enabled: isAuthenticated,
  });

  const { data: dashboardSettings } = useQuery<any>({
    queryKey: ["/customer/dashboard-settings"],
    queryFn: async () => (await apiRequest("GET", "/customer/dashboard-settings")).json(),
    enabled: isAuthenticated,
  });

  const { data: customization } = useQuery<any>({
    queryKey: ["/customer/customization"],
    queryFn: async () => (await apiRequest("GET", "/customer/customization")).json(),
    enabled: isAuthenticated,
  });

  const { data: ads = [] } = useQuery<any[]>({
    queryKey: ["/customer/ads"],
    enabled: isAuthenticated,
  });

  if (authLoading || pkgLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div className="p-4">Please log in to view packages.</div>;
  }

  return (
    <div className="p-4 space-y-4 relative">
      <div className="absolute top-2 right-2">
        <LanguageSelector />
      </div>
      {(dashboardSettings?.heroTitleEn || customization?.headerText) && (
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          {customization?.logoUrl && (
            <div className="mb-3"><img src={customization.logoUrl} alt="Branch Logo" className="h-10" /></div>
          )}
          <h2 className="text-2xl font-bold">
            {dashboardSettings?.heroTitleEn || customization?.headerText}
          </h2>
          {dashboardSettings?.heroTitleAr || customization?.headerTextAr ? (
            <div className="text-right text-gray-700" dir="rtl">
              {dashboardSettings?.heroTitleAr || customization?.headerTextAr}
            </div>
          ) : null}
          {(dashboardSettings?.heroSubtitleEn || customization?.subHeaderText) && (
            <p className="text-gray-600 mt-2">
              {dashboardSettings?.heroSubtitleEn || customization?.subHeaderText}
              {(dashboardSettings?.heroSubtitleAr || customization?.subHeaderTextAr) && (
                <span className="block text-right" dir="rtl">{dashboardSettings?.heroSubtitleAr || customization?.subHeaderTextAr}</span>
              )}
            </p>
          )}
        </div>
      )}

      {ads.length > 0 && (
        <div className="space-y-3">
          {ads.map((ad) => (
            <Card key={ad.id} onMouseEnter={() => {
              void apiRequest("POST", `/customer/ads/${ad.id}/impression`, { language: navigator.language }).catch(() => {});
            }}>
              <CardContent className="p-0">
                <a
                  href={ad.targetUrl || '#'}
                  onClick={() => {
                    void apiRequest("POST", `/customer/ads/${ad.id}/click`, { language: navigator.language }).catch(() => {});
                  }}
                  target={ad.targetUrl ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  <img src={ad.imageUrl} alt={ad.titleEn} className="w-full h-40 object-cover" />
                </a>
                <div className="p-3">
                  <div className="font-medium">{ad.titleEn}</div>
                  {ad.titleAr && <div className="text-sm text-gray-600" dir="rtl">{ad.titleAr}</div>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(dashboardSettings?.featuredMessageEn || customization?.tagline) && (
        <Card>
          <CardContent className="p-4">
            <div>{dashboardSettings?.featuredMessageEn || customization?.tagline}</div>
            {(dashboardSettings?.featuredMessageAr || customization?.taglineAr) && (
              <div dir="rtl" className="text-right">{dashboardSettings?.featuredMessageAr || customization?.taglineAr}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer summary */}
      {customer && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">Active Packages</div>
              <div className="text-2xl font-bold">{packages.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">Loyalty Points</div>
              <div className="text-2xl font-bold">{customer.loyaltyPoints || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-600">Outstanding Balance</div>
              <div className="text-2xl font-bold">{customer.balanceDue || '0.00'}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {dashboardSettings?.showPackages !== false && (
        <EnhancedPackageDisplay packages={packages} onUsePackage={() => {}} />
      )}
      {dashboardSettings?.showOrders !== false && (
        <CustomerOrders />
      )}
    </div>
  );
}

export default function CustomerDashboardPage() {
  return (
    <AuthProvider>
      <CustomerAuthProvider>
        <DashboardContent />
      </CustomerAuthProvider>
    </AuthProvider>
  );
}
