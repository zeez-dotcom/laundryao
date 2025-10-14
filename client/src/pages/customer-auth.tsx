import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CustomerAuthProvider, useCustomerAuth } from "@/context/CustomerAuthContext";
import { CustomerRegistrationForm } from "@/components/auth/CustomerRegistrationForm";
import { CustomerLoginForm } from "@/components/auth/CustomerLoginForm";
import { CustomerPasswordResetForm } from "@/components/auth/CustomerPasswordResetForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Store, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { LanguageSelector } from "@/components/language-selector";
import { useTranslationContext } from "@/context/TranslationContext";

interface QRCodeData {
  qrCode: {
    id: string;
    branchId: string;
    qrCode: string;
    isActive: boolean;
    createdAt: string;
  };
  branch: {
    id: string;
    name: string;
    code: string;
    address?: string;
    phone?: string;
  };
}

type AuthView = "login" | "register" | "reset";

function CustomerAuthContent() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const qrCode = searchParams.get("qr");
  const branchCodeParam = searchParams.get("branchCode");
  const next = searchParams.get("next");
  const [authView, setAuthView] = useState<AuthView>("login");
  const [resetPhoneNumber, setResetPhoneNumber] = useState("");
  const { customer, isLoading: isAuthLoading, isAuthenticated } = useCustomerAuth();
  const { t } = useTranslationContext();

  // Fetch QR code and branch data
  const {
    data: qrData,
    isLoading: isQRLoading,
    error: qrError,
  } = useQuery<QRCodeData>({
    queryKey: ["/api/qr-or-branch", qrCode || branchCodeParam],
    queryFn: async () => {
      if (qrCode) {
        const response = await apiRequest("GET", `/api/qr/${qrCode}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || t.customerAuth.qr.invalid);
        }
        return await response.json();
      }
      if (branchCodeParam) {
        const response = await apiRequest("GET", `/api/branches/${branchCodeParam}`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || t.customerAuth.qr.invalid);
        }
        const branch = await response.json();
        // Fabricate minimal qrCode info to satisfy existing UI typings
        return {
          qrCode: {
            id: "",
            branchId: branch.id,
            qrCode: "",
            isActive: true,
            createdAt: new Date().toISOString(),
          },
          branch,
        } as QRCodeData;
      }
      throw new Error(t.customerAuth.qr.missing);
    },
    enabled: !!qrCode || !!branchCodeParam,
    retry: 1,
  });

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated && customer && qrData?.branch) {
      // Redirect based on intent
      if (next === "ordering") {
        setLocation(`/customer-ordering?branchCode=${qrData.branch.code}&customerId=${customer.id}`);
      } else {
        setLocation(`/customer-dashboard?branchCode=${qrData.branch.code}`);
      }
    }
  }, [isAuthenticated, customer, qrData, setLocation, next]);

  const handleLoginSuccess = (customer: any) => {
    if (qrData?.branch) {
      if (next === "ordering") {
        setLocation(`/customer-ordering?branchCode=${qrData.branch.code}&customerId=${customer.id}`);
      } else {
        setLocation(`/customer-dashboard?branchCode=${qrData.branch.code}`);
      }
    }
  };

  const handleRegistrationSuccess = (customer: any) => {
    if (qrData?.branch) {
      if (next === "ordering") {
        setLocation(`/customer-ordering?branchCode=${qrData.branch.code}&customerId=${customer.id}`);
      } else {
        setLocation(`/customer-dashboard?branchCode=${qrData.branch.code}`);
      }
    }
  };

  const handleForgotPassword = (phoneNumber: string) => {
    setResetPhoneNumber(phoneNumber);
    setAuthView("reset");
  };

  const handleResetSuccess = () => {
    setAuthView("login");
    setResetPhoneNumber("");
  };

  // Show loading while checking authentication or QR code
  if (isAuthLoading || isQRLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
              <p className="text-muted-foreground">
                {isQRLoading
                  ? t.customerAuth.qr.verifying
                  : t.loading}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error if QR code is invalid
  if ((!qrCode && !branchCodeParam) || qrError || !qrData) {
    const qrErrorMessage = !qrCode && !branchCodeParam
      ? t.customerAuth.qr.missing
      : t.customerAuth.qr.invalid;
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{qrErrorMessage}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { branch } = qrData;

  // Show authentication forms
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Branch Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b relative">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 dark:bg-blue-900/20 p-2 rounded-lg">
              <Store className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="font-semibold text-lg">{branch.name}</h1>
              <p className="text-sm text-muted-foreground">
                {t.customerAuth.qr.branchSubtitle.replace("{code}", branch.code)}
              </p>
            </div>
          </div>
        </div>
        <div className="absolute top-2 right-2">
          <LanguageSelector />
        </div>
      </div>

      {/* Authentication Forms */}
      <div className="py-4">
        {authView === "login" && (
          <CustomerLoginForm
            onSuccess={handleLoginSuccess}
            onRegisterRedirect={() => setAuthView("register")}
            onForgotPassword={handleForgotPassword}
          />
        )}

        {authView === "register" && (
          <CustomerRegistrationForm
            branchCode={branch.code}
            onSuccess={handleRegistrationSuccess}
            onLoginRedirect={() => setAuthView("login")}
          />
        )}

        {authView === "reset" && (
          <CustomerPasswordResetForm
            initialPhoneNumber={resetPhoneNumber}
            onSuccess={handleResetSuccess}
            onBackToLogin={() => setAuthView("login")}
          />
        )}
      </div>
    </div>
  );
}

export default function CustomerAuthPage() {
  return (
    <CustomerAuthProvider>
      <CustomerAuthContent />
    </CustomerAuthProvider>
  );
}
