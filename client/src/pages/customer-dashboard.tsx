import { CustomerAuthProvider, useCustomerAuth } from "@/context/CustomerAuthContext";
import { EnhancedPackageDisplay } from "@/components/EnhancedPackageDisplay";
import { CustomerOrders } from "@/components/customer-orders";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AuthProvider, useAuthContext } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageSelector } from "@/components/language-selector";

function DashboardContent() {
  const { isAuthenticated, isLoading: authLoading } = useCustomerAuth();
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
    queryKey: ["/api/branches", branch?.id, "customer-dashboard-settings"],
    enabled: !!branch?.id,
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
      {(dashboardSettings?.heroTitleEn || dashboardSettings?.heroTitleAr) && (
        <div>
          <h2 className="text-2xl font-bold">{dashboardSettings?.heroTitleEn}</h2>
          {dashboardSettings?.heroTitleAr && (
            <div className="text-right" dir="rtl">{dashboardSettings?.heroTitleAr}</div>
          )}
          {(dashboardSettings?.heroSubtitleEn || dashboardSettings?.heroSubtitleAr) && (
            <p className="text-gray-600">
              {dashboardSettings?.heroSubtitleEn}
              {dashboardSettings?.heroSubtitleAr && (
                <span className="block text-right" dir="rtl">{dashboardSettings?.heroSubtitleAr}</span>
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

      {dashboardSettings?.featuredMessageEn && (
        <Card>
          <CardContent className="p-4">
            <div>{dashboardSettings.featuredMessageEn}</div>
            {dashboardSettings.featuredMessageAr && (
              <div dir="rtl" className="text-right">{dashboardSettings.featuredMessageAr}</div>
            )}
          </CardContent>
        </Card>
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
