import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Download,
  Printer,
  RefreshCw,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Activity,
  Calendar,
} from "lucide-react";
import type { BranchQRCode } from "@shared/schema";

interface QRCodeWithBranch extends BranchQRCode {
  branch?: {
    name: string;
    code: string;
  };
}

export function BranchQRCodeManager() {
  const { user, branch } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInactiveQRs, setShowInactiveQRs] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const branchId = branch?.id;

  // Fetch all QR codes for the branch
  const {
    data: qrCodes = [],
    isLoading,
    error,
  } = useQuery<QRCodeWithBranch[]>({
    queryKey: ["/api/branches", branchId, "qr-codes"],
    queryFn: async () => {
      if (!branchId) return [];
      const response = await apiRequest("GET", `/api/branches/${branchId}/qr-codes`);
      return await response.json();
    },
    enabled: !!branchId,
  });

  // Get active QR code
  const { data: activeQRCode } = useQuery<QRCodeWithBranch | null>({
    queryKey: ["/api/branches", branchId, "qr-codes", "active"],
    queryFn: async () => {
      if (!branchId) throw new Error("No branch ID");
      const response = await apiRequest("GET", `/api/branches/${branchId}/qr-codes/active`);
      if (!response.ok) {
        if (response.status === 404) {
          return null; // No active QR code
        }
        throw new Error(`Failed to fetch active QR code: ${response.status}`);
      }
      return await response.json();
    },
    enabled: !!branchId,
  });

  // Create QR code mutation
  const createQRMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch ID");
      const response = await apiRequest("POST", `/api/branches/${branchId}/qr-codes`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branches", branchId, "qr-codes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branches", branchId, "qr-codes", "active"] });
      toast({ title: "QR code created successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error creating QR code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Regenerate QR code mutation
  const regenerateQRMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch ID");
      const response = await apiRequest("POST", `/api/branches/${branchId}/qr-codes/regenerate`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branches", branchId, "qr-codes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branches", branchId, "qr-codes", "active"] });
      toast({ title: "QR code regenerated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error regenerating QR code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Deactivate QR code mutation
  const deactivateQRMutation = useMutation({
    mutationFn: async (qrId: string) => {
      if (!branchId) throw new Error("No branch ID");
      const response = await apiRequest("PUT", `/api/branches/${branchId}/qr-codes/${qrId}/deactivate`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/branches", branchId, "qr-codes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/branches", branchId, "qr-codes", "active"] });
      toast({ title: "QR code deactivated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error deactivating QR code",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getQRCodeUrl = (qrCode: string) => `${origin}/order?qr=${qrCode}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  const downloadQRCode = (qrCode: string) => {
    const canvas = document.getElementById(`qr-canvas-${qrCode}`) as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL();
      const link = document.createElement("a");
      link.download = `${branch?.name || "branch"}-qr-${qrCode.slice(-8)}.png`;
      link.href = url;
      link.click();
    }
  };

  const printQRCode = (qrCode: string) => {
    const qrUrl = getQRCodeUrl(qrCode);
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>QR Code - ${branch?.name}</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                margin: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
              }
              .qr-container { 
                border: 2px solid #000; 
                padding: 20px; 
                margin: 20px auto; 
                border-radius: 8px;
                display: inline-block;
              }
              h1 { color: #333; margin-bottom: 10px; }
              .instructions { 
                margin: 20px 0; 
                font-size: 16px; 
                max-width: 400px;
                line-height: 1.5;
              }
              .qr-code { margin: 20px 0; }
              @media print {
                body { margin: 0; }
              }
            </style>
            <script src="https://unpkg.com/qrcode-generator@1.4.4/qrcode.js"></script>
          </head>
          <body>
            <h1>${branch?.name || "Branch"} - Customer Ordering</h1>
            <div class="qr-container">
              <div class="qr-code">
                <div id="qr-placeholder" style="width: 256px; height: 256px; margin: 0 auto;"></div>
              </div>
              <p><strong>Scan to Order</strong></p>
            </div>
            <div class="instructions">
              <p><strong>Instructions for customers:</strong></p>
              <p>1. Open your phone's camera</p>
              <p>2. Point it at this QR code</p>
              <p>3. Tap the notification to open</p>
              <p>4. Place your laundry order online</p>
            </div>
            <script>
              // Generate QR code using qrcode-generator library
              const qr = qrcode(0, 'M');
              qr.addData('${qrUrl}');
              qr.make();
              document.getElementById('qr-placeholder').innerHTML = qr.createImgTag(4);
              setTimeout(() => window.print(), 500);
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-center">Loading QR codes...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load QR codes. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const activeQRs = qrCodes.filter((qr) => qr.isActive);
  const inactiveQRs = qrCodes.filter((qr) => !qr.isActive);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <QrCode className="h-5 w-5" />
            <span>QR Code Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => createQRMutation.mutate()}
              disabled={createQRMutation.isPending}
              data-testid="button-create-qr"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New QR Code
            </Button>
            <Button
              onClick={() => regenerateQRMutation.mutate()}
              disabled={regenerateQRMutation.isPending}
              variant="outline"
              data-testid="button-regenerate-qr"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate Active QR
            </Button>
            <Button
              onClick={() => setShowInactiveQRs(!showInactiveQRs)}
              variant="outline"
              data-testid="button-toggle-inactive"
            >
              {showInactiveQRs ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showInactiveQRs ? "Hide" : "Show"} Inactive QRs
            </Button>
          </div>

          {activeQRCode && (
            <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <h3 className="font-medium text-green-900 dark:text-green-100 mb-3">
                Active QR Code
                <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                  ACTIVE
                </Badge>
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex flex-col items-center space-y-3">
                  <QRCodeCanvas
                    id={`qr-canvas-${activeQRCode.qrCode}`}
                    value={getQRCodeUrl(activeQRCode.qrCode)}
                    size={200}
                    level="M"
                    data-testid={`qr-canvas-${activeQRCode.qrCode}`}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => copyToClipboard(getQRCodeUrl(activeQRCode.qrCode))}
                      data-testid={`button-copy-${activeQRCode.qrCode}`}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy URL
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => downloadQRCode(activeQRCode.qrCode)}
                      data-testid={`button-download-${activeQRCode.qrCode}`}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => printQRCode(activeQRCode.qrCode)}
                      data-testid={`button-print-${activeQRCode.qrCode}`}
                    >
                      <Printer className="w-4 h-4 mr-1" />
                      Print
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>QR Code:</strong> {activeQRCode.qrCode.slice(-12)}...
                  </div>
                  <div>
                    <strong>Created:</strong>{" "}
                    {new Date(activeQRCode.createdAt).toLocaleDateString()}
                  </div>
                  <div className="break-all">
                    <strong>URL:</strong> {getQRCodeUrl(activeQRCode.qrCode)}
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deactivateQRMutation.mutate(activeQRCode.id)}
                    disabled={deactivateQRMutation.isPending}
                    data-testid={`button-deactivate-${activeQRCode.id}`}
                  >
                    Deactivate
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!activeQRCode && activeQRs.length === 0 && (
            <Alert>
              <Activity className="h-4 w-4" />
              <AlertDescription>
                No active QR code found. Create one to enable customer ordering via QR codes.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {showInactiveQRs && inactiveQRs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Inactive QR Codes ({inactiveQRs.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {inactiveQRs.map((qr) => (
                <div
                  key={qr.id}
                  className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800"
                  data-testid={`inactive-qr-${qr.id}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">INACTIVE</Badge>
                    <span className="text-xs text-muted-foreground">
                      {qr.qrCode.slice(-8)}...
                    </span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div>
                      <strong>Created:</strong> {new Date(qr.createdAt).toLocaleDateString()}
                    </div>
                    {qr.deactivatedAt && (
                      <div>
                        <strong>Deactivated:</strong>{" "}
                        {new Date(qr.deactivatedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default BranchQRCodeManager;