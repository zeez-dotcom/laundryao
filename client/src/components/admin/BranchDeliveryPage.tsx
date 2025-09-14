import { useQuery } from "@tanstack/react-query";
import { useAuthContext } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Branch, BranchQRCode } from "@shared/schema";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Printer, RefreshCw, AlertCircle, QrCode } from "lucide-react";

interface BranchWithQR extends Branch {
  activeQRCode?: BranchQRCode;
}

function BranchDeliveryPage() {
  const { user, branch, isSuperAdmin, isAdmin } = useAuthContext();
  const { toast } = useToast();

  const { data: branches = [], isLoading, error } = useQuery<BranchWithQR[]>({
    queryKey: ["/api/branches", "delivery-qr"],
    queryFn: async () => {
      // For super admins, get all branches. For regular admins, just their branch
      if (isSuperAdmin) {
        const branchesResponse = await apiRequest("GET", "/api/branches");
        const allBranches = await branchesResponse.json();
        
        // Get QR codes for each branch
        const branchesWithQR = await Promise.all(
          allBranches.map(async (branch: Branch) => {
            try {
              const qrResponse = await apiRequest("GET", `/api/branches/${branch.id}/qr-codes/active`);
              if (qrResponse.ok) {
                const activeQRCode = await qrResponse.json();
                return { ...branch, activeQRCode };
              }
            } catch (error) {
              // Branch might not have active QR code, that's ok
            }
            return branch;
          })
        );
        return branchesWithQR;
      } else if (branch) {
        // For regular admins, just their branch
        try {
          const qrResponse = await apiRequest("GET", `/api/branches/${branch.id}/qr-codes/active`);
          if (qrResponse.ok) {
            const activeQRCode = await qrResponse.json();
            return [{ ...branch, activeQRCode }];
          }
        } catch (error) {
          // Branch might not have active QR code
        }
        return [branch];
      }
      return [];
    },
    enabled: !!user && (isSuperAdmin || !!branch),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const getQRCodeUrl = (qrCode: string) => `${origin}/order?qr=${qrCode}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  const downloadQRCode = (branchName: string, qrCode: string) => {
    const canvas = document.getElementById(`qr-canvas-${qrCode}`) as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL();
      const link = document.createElement("a");
      link.download = `${branchName}-delivery-qr.png`;
      link.href = url;
      link.click();
    }
  };

  const printQRCode = (branchName: string, qrCode: string) => {
    const qrUrl = getQRCodeUrl(qrCode);
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Delivery QR Code - ${branchName}</title>
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
            <h1>${branchName} - Delivery Orders</h1>
            <div class="qr-container">
              <div class="qr-code">
                <div id="qr-placeholder" style="width: 256px; height: 256px; margin: 0 auto;"></div>
              </div>
              <p><strong>Scan to Start Delivery Order</strong></p>
            </div>
            <div class="instructions">
              <p><strong>For customers:</strong></p>
              <p>1. Open your phone's camera</p>
              <p>2. Point it at this QR code</p>
              <p>3. Tap the notification to open</p>
              <p>4. Place your delivery order</p>
            </div>
            <script>
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
      <div className="flex items-center justify-center p-8">
        <div className="text-center">Loading delivery QR codes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load delivery QR codes. Please refresh the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Delivery QR Codes</h2>
        <p className="text-muted-foreground">
          QR codes for customer delivery orders. Customers can scan these to start a delivery order.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch) => (
          <Card key={branch.id} className="flex flex-col">
            <CardHeader className="text-center pb-3">
              <CardTitle className="text-lg">{branch.name}</CardTitle>
              <Badge variant="secondary">{branch.code}</Badge>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col items-center space-y-4">
              {branch.activeQRCode ? (
                <>
                  <QRCodeCanvas
                    id={`qr-canvas-${branch.activeQRCode.qrCode}`}
                    value={getQRCodeUrl(branch.activeQRCode.qrCode)}
                    size={150}
                    level="M"
                    className="border rounded"
                  />
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button
                      size="sm"
                      onClick={() => copyToClipboard(getQRCodeUrl(branch.activeQRCode!.qrCode))}
                      data-testid={`copy-qr-${branch.id}`}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy Link
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => downloadQRCode(branch.name, branch.activeQRCode!.qrCode)}
                      data-testid={`download-qr-${branch.id}`}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => printQRCode(branch.name, branch.activeQRCode!.qrCode)}
                      data-testid={`print-qr-${branch.id}`}
                    >
                      <Printer className="w-4 h-4 mr-1" />
                      Print
                    </Button>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground break-all">
                      {getQRCodeUrl(branch.activeQRCode.qrCode)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created: {new Date(branch.activeQRCode.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center space-y-3">
                  <div className="w-[150px] h-[150px] border-2 border-dashed border-muted rounded flex items-center justify-center">
                    <QrCode className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      No active QR code found. Create one in the QR Code Management section.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {branches.length === 0 && (
        <div className="text-center py-12">
          <QrCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No branches available for delivery QR codes.</p>
        </div>
      )}
    </div>
  );
}

export default BranchDeliveryPage;
