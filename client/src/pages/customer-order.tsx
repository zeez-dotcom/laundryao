import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import { LanguageSelector } from "@/components/language-selector";
import {
  Store,
  Phone,
  MapPin,
  QrCode,
  ArrowRight,
  AlertCircle,
  CheckCircle,
  Loader2,
} from "lucide-react";

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

export default function CustomerOrderPage() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const qrCode = searchParams.get("qr");
  const { toast } = useToast();
  const { t } = useTranslation();

  // Fetch QR code and branch data
  const {
    data: qrData,
    isLoading,
    error,
  } = useQuery<QRCodeData>({
    queryKey: ["/api/qr", qrCode],
    queryFn: async () => {
      if (!qrCode) throw new Error("No QR code provided");
      const response = await apiRequest("GET", `/api/qr/${qrCode}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Invalid QR code");
      }
      return await response.json();
    },
    enabled: !!qrCode,
    retry: 1,
  });

  const handleStartOrder = () => {
    if (qrData?.branch) {
      // Redirect to customer authentication page with QR code
      setLocation(`/customer-auth?qr=${qrCode}`);
    }
  };

  const handleStartChat = () => {
    if (qrData?.branch) {
      // Go to auth first, then redirect to chatbot ordering after login
      setLocation(`/customer-auth?qr=${qrCode}&next=ordering`);
    }
  };

  const handleCallBranch = () => {
    if (qrData?.branch?.phone) {
      window.open(`tel:${qrData.branch.phone}`, "_self");
    }
  };

  // If no QR code is provided, show error
  if (!qrCode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t.customerOrder?.invalidQr || "Invalid QR code. Please scan a valid QR code from one of our branch locations."}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
              <p className="text-muted-foreground">{t.customerOrder?.verifying || "Verifying QR code..."}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !qrData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error ? error.message : (t.customerOrder?.notFound || "QR code not found or has expired")}
              </AlertDescription>
            </Alert>
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                {t.customerOrder?.contactBranch || "If you believe this is an error, please contact the branch directly."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { qrCode: qrInfo, branch } = qrData;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg relative">
        {/* Language selector top-right */}
        <div className="absolute top-2 right-2">
          <LanguageSelector />
        </div>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-green-100 dark:bg-green-900/20 rounded-full w-fit">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl font-bold">{t.customerOrder?.welcomeTo || "Welcome to"} {branch.name}</CardTitle>
          <p className="text-muted-foreground">
            {t.customerOrder?.successScan || "You've successfully scanned our QR code! Start your laundry order below."}
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Branch Information */}
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 space-y-3">
            <div className="flex items-center space-x-2 text-blue-800 dark:text-blue-200">
              <Store className="h-5 w-5" />
              <span className="font-medium">{t.customerOrder?.branchInfo || "Branch Information"}</span>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t.customerOrder?.branch || "Branch:"}</span>
                <span className="font-medium">{branch.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t.customerOrder?.code || "Code:"}</span>
                <Badge variant="secondary">{branch.code}</Badge>
              </div>
              {branch.address && (
                <div className="flex items-start justify-between">
                  <span className="text-muted-foreground">{t.customerOrder?.address || "Address:"}</span>
                  <span className="text-right font-medium max-w-xs">{branch.address}</span>
                </div>
              )}
              {branch.phone && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t.customerOrder?.phone || "Phone:"}</span>
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="p-0 h-auto font-medium"
                    onClick={handleCallBranch}
                    data-testid="button-call-branch"
                  >
                    <Phone className="h-4 w-4 mr-1" />
                    {branch.phone}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Order Options */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">{t.customerOrder?.readyToStart || "Ready to start your order?"}</h3>
            <p className="text-muted-foreground text-sm">
              {t.customerOrder?.chooseHow || "Choose how you'd like to proceed with your laundry service:"}
            </p>
            <p className="text-muted-foreground text-xs">
              {t.customerOrder?.chatAssistantHint || "Tip: The Smart Chat Assistant guides you step-by-step to build your order quickly."}
            </p>
            
            <div className="space-y-3">
              <Button 
                onClick={handleStartOrder} 
                className="w-full" 
                size="lg"
                data-testid="button-start-order"
              >
                <QrCode className="w-5 h-5 mr-2" />
                {t.customerOrder?.startOnlineOrder || "Start Online Order"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              
              <Button 
                onClick={handleStartChat}
                variant="outline"
                className="w-full"
                size="lg"
                data-testid="button-start-chat"
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                {t.customerOrder?.startChat || "Try Smart Chat Assistant"}
              </Button>
              
              {branch.phone && (
                <Button 
                  onClick={handleCallBranch} 
                  variant="outline" 
                  className="w-full" 
                  size="lg"
                  data-testid="button-call-order"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  {t.customerOrder?.callToOrder || "Call to Place Order"}
                </Button>
              )}
            </div>
          </div>

          {/* QR Code Info */}
          <div className="text-center pt-4 border-t">
            <div className="flex items-center justify-center space-x-2 text-xs text-muted-foreground">
              <QrCode className="h-4 w-4" />
              <span>
                {(t.customerOrder?.qrCodeLabel || "QR Code:") + " "}{qrInfo.qrCode.slice(-8)}... • 
                {(t.customerOrder?.created || "Created:") + " "}{new Date(qrInfo.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
