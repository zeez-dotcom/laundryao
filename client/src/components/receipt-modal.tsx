import { X, Printer, Mail, Truck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Transaction, Customer } from "@shared/schema";
import { useTranslation, loadLocale, type Translations } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { ReactNode, useEffect, useState, Fragment } from "react";
import logoImage from "@/assets/logo.png";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getTaxRate } from "@/lib/tax";
import { format } from "date-fns";
import { useAuthContext } from "@/context/AuthContext";

interface ReceiptModalProps {
  transaction?: Transaction | null;
  order?: any | null;
  customer?: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  printNumber?: number;
  printedAt?: string | Date;
}

export function ReceiptModal({ transaction, order, customer, isOpen, onClose, printNumber, printedAt }: ReceiptModalProps) {
  const receiptData = transaction
    ? { ...transaction, packages: order?.packages || (transaction as any).packages }
    : order;
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const taxRate = getTaxRate();
  const [tEn, setTEn] = useState<Translations | null>(null);
  const [tAr, setTAr] = useState<Translations | null>(null);

  const [receiptHeaderEn, setReceiptHeaderEn] = useState("");
  const [receiptHeaderAr, setReceiptHeaderAr] = useState("");
  const [receiptFooterEn, setReceiptFooterEn] = useState("");
  const [receiptFooterAr, setReceiptFooterAr] = useState("");

  useEffect(() => {
    const settings = localStorage.getItem("laundrySettings");
    if (settings) {
      try {
        const parsed = JSON.parse(settings);
        // New language-specific fields with backward compatibility
        if (parsed.receiptHeaderEn || parsed.receiptHeaderAr) {
          setReceiptHeaderEn(parsed.receiptHeaderEn || "");
          setReceiptHeaderAr(parsed.receiptHeaderAr || "");
        } else if (parsed.receiptHeader) {
          setReceiptHeaderEn(parsed.receiptHeader);
        }

        if (parsed.receiptFooterEn || parsed.receiptFooterAr) {
          setReceiptFooterEn(parsed.receiptFooterEn || "");
          setReceiptFooterAr(parsed.receiptFooterAr || "");
        } else if (parsed.receiptFooter) {
          setReceiptFooterEn(parsed.receiptFooter);
        }
      } catch {
        // ignore JSON parse errors
      }
    }
    loadLocale("en").then(setTEn);
    loadLocale("ar").then(setTAr);
  }, []);

  const { branch } = useAuthContext();
  // Company logo - branch logo if available, else default asset
  const logoUrl = branch?.logoUrl || logoImage;

  const renderBilingualRow = (
    enLabel: string,
    arLabel: string,
    value: ReactNode,
    className = ''
  ) => (
    <div className={`grid grid-cols-2 ${className}`} dir="rtl">
      <span className="text-right">
        {arLabel}: <span dir="ltr">{value}</span>
      </span>
      <span className="text-left" dir="ltr">
        {enLabel}: {value}
      </span>
    </div>
  );

  const renderBilingualItemRow = (
    enText: string,
    arText: string,
    price: number,
    key: React.Key,
    creditUsage?: { creditsUsed: number; totalQuantity: number }
  ) => {
    if (!creditUsage || creditUsage.creditsUsed === 0) {
      // No credits used - show normal pricing
      return (
        <div key={key} className="flex justify-between">
          <div className="flex flex-col flex-1">
            <span>{enText}</span>
            <span dir="rtl" className="text-gray-500">
              {arText}
            </span>
          </div>
          <span className="text-right">
            {formatCurrency(price)}
          </span>
        </div>
      );
    }

    const { creditsUsed, totalQuantity } = creditUsage;
    const cashQuantity = totalQuantity - creditsUsed;
    const unitPrice = totalQuantity > 0 ? price / totalQuantity : 0;
    const cashAmount = cashQuantity * unitPrice;

    if (creditsUsed === totalQuantity) {
      // Full credits used
      return (
        <div key={key} className="flex justify-between">
          <div className="flex flex-col flex-1">
            <span>{enText}</span>
            <span dir="rtl" className="text-gray-500">
              {arText}
            </span>
          </div>
          <span className="text-right">
            <div className="flex flex-col items-end">
              <span className="text-sm text-blue-600 font-medium">Credit Used</span>
              <span className="text-xs text-blue-500" dir="rtl">إستعمال الرصيد</span>
            </div>
          </span>
        </div>
      );
    }

    // Partial credits used - show breakdown
    return (
      <Fragment key={key}>
        {/* Credit portion */}
        <div className="flex justify-between">
          <div className="flex flex-col flex-1">
            <span>{enText} (Credits × {creditsUsed})</span>
            <span dir="rtl" className="text-gray-500">
              {arText} (رصيد × {creditsUsed})
            </span>
          </div>
          <span className="text-right">
            <div className="flex flex-col items-end">
              <span className="text-sm text-blue-600 font-medium">Credit Used</span>
              <span className="text-xs text-blue-500" dir="rtl">إستعمال الرصيد</span>
            </div>
          </span>
        </div>
        {/* Cash portion */}
        {cashQuantity > 0 && (
          <div className="flex justify-between pl-2">
            <div className="flex flex-col flex-1">
              <span>{enText} (Cash × {cashQuantity})</span>
              <span dir="rtl" className="text-gray-500">
                {arText} (نقدي × {cashQuantity})
              </span>
            </div>
            <span className="text-right">
              {formatCurrency(cashAmount)}
            </span>
          </div>
        )}
      </Fragment>
    );
  };

  const splitBilingualText = (text: string): { en: string; ar: string } => {
    const arMatch = text.match(/[\u0600-\u06FF]+/g);
    const enMatch = text.match(/[A-Za-z0-9&() ]+/g);
    const clean = (s: string) => s.replace(/^[\s\-()]+|[\s\-()]+$/g, "").trim();
    const en = enMatch ? clean(enMatch.join(" ")) : "";
    const ar = arMatch ? clean(arMatch.join(" ")) : en;
    return { en, ar };
  };

  // Create credit pool map from packages - tracks remaining credits per (serviceId, clothingItemId)
  const createCreditPool = () => {
    const creditPool = new Map<string, number>();
    
    if (!receiptData.packages || receiptData.packages.length === 0) {
      return creditPool;
    }
    
    receiptData.packages.forEach((pkg: any) => {
      if (pkg.items) {
        pkg.items.forEach((pkgItem: any) => {
          if (pkgItem.serviceId && pkgItem.clothingItemId && pkgItem.used && pkgItem.used > 0) {
            const key = `${pkgItem.serviceId}-${pkgItem.clothingItemId}`;
            const currentCredits = creditPool.get(key) || 0;
            creditPool.set(key, currentCredits + pkgItem.used);
          }
        });
      }
    });
    
    return creditPool;
  };

  // Helper function to allocate credits for an item from the credit pool
  const allocateCreditsForItem = (
    item: any,
    creditPool: Map<string, number>
  ): { creditsUsed: number; totalQuantity: number } => {
    const serviceId = item.service?.id;
    const clothingItemId = item.clothingItem?.id;
    const itemQuantity = item.quantity || 0;
    
    if (!serviceId || !clothingItemId || itemQuantity === 0) {
      return { creditsUsed: 0, totalQuantity: itemQuantity };
    }
    
    const key = `${serviceId}-${clothingItemId}`;
    const remainingCredits = creditPool.get(key) || 0;
    
    // Allocate credits: min of (item quantity, remaining credits)
    const creditsToAllocate = Math.min(itemQuantity, remainingCredits);
    
    // Update the credit pool - subtract allocated credits
    if (creditsToAllocate > 0) {
      creditPool.set(key, remainingCredits - creditsToAllocate);
    }
    
    return {
      creditsUsed: creditsToAllocate,
      totalQuantity: itemQuantity
    };
  };

  const estimatedPickupEn = 'Est. Pickup';
  const estimatedPickupAr = 'الاستلام المتوقع';
  const readyByEn = 'Ready By';
  const readyByAr = 'جاهز بتاريخ';

  const branchAddress = receiptData?.branchAddress || branch?.address;
  if (!receiptData) return null;
  if (!tEn || !tAr) return null;

  const storedCompanyName = localStorage.getItem('companyName');
  const storedCompanyPhone = localStorage.getItem('companyPhone');
  const storedCompanyTagline =
    localStorage.getItem('companyTagline') ||
    receiptData?.branchTagline ||
    branch?.tagline;

  const branchName = storedCompanyName || branch?.name || tEn.companyName;
  const branchPhone = storedCompanyPhone || branch?.phone || tEn.phone;
  const companyTaglineEn = storedCompanyTagline || tEn.companyTagline;
  const companyTaglineAr = storedCompanyTagline || tAr.companyTagline;

  const sellerName = receiptData.sellerName;

  const paymentMethodKey =
    receiptData.paymentMethod === 'pay_later'
      ? 'payLater'
      : receiptData.paymentMethod === 'cash'
        ? 'cash'
        : 'card';

  const handlePrint = () => {
    const receiptContent = document.getElementById('receiptContent');
    if (!receiptContent) return;

    // Create a new window for printing
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    // Get the receipt HTML content
    const receiptHTML = receiptContent.outerHTML;
    
    // Create a complete HTML document for printing
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body { 
              font-family: monospace; 
              font-size: 12px; 
              margin: 0; 
              padding: 20px;
              line-height: 1.4;
            }
            .space-y-4 > * + * { margin-top: 1rem; }
            .space-y-2 > * + * { margin-top: 0.5rem; }
            .space-y-1 > * + * { margin-top: 0.25rem; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-xs { font-size: 10px; }
            .font-bold { font-weight: bold; }
            .text-lg { font-size: 16px; }
            .text-gray-600 { color: #666; }
            .text-gray-400 { color: #999; }
            .text-yellow-800 { color: #92400e; }
            .text-red-600 { color: #dc2626; }
            .text-green-800 { color: #166534; }
            .text-green-700 { color: #15803d; }
            .text-yellow-700 { color: #a16207; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .border-t { border-top: 1px solid #d1d5db; }
            .border-b { border-bottom: 1px solid #d1d5db; }
            .border-gray-400 { border-color: #9ca3af; }
            .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
            .pt-3 { padding-top: 0.75rem; }
            .pt-1 { padding-top: 0.25rem; }
            .pl-2 { padding-left: 0.5rem; }
            .p-3 { padding: 0.75rem; }
            .p-2 { padding: 0.5rem; }
            .mt-3 { margin-top: 0.75rem; }
            .mt-2 { margin-top: 0.5rem; }
            .mt-1 { margin-top: 0.25rem; }
            .mx-auto { margin-left: auto; margin-right: auto; }
            .w-16 { width: 4rem; }
            .h-16 { height: 4rem; }
            .object-contain { object-fit: contain; }
            .rounded-lg { border-radius: 0.5rem; }
            .rounded { border-radius: 0.25rem; }
            .bg-yellow-50 { background-color: #fefce8; }
            .bg-green-50 { background-color: #f0fdf4; }
            .border { border-width: 1px; }
            .border-yellow-200 { border-color: #fde047; }
            .border-green-200 { border-color: #bbf7d0; }
            .capitalize { text-transform: capitalize; }
            .flex-1 { flex: 1; }
            img { max-width: 100%; height: auto; }
            @media print {
              body { margin: 0; padding: 10px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          ${receiptHTML}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const handleEmail = async () => {
    if (!customer?.email) return;
    const receiptContent = document.getElementById('receiptContent');
    if (!receiptContent) return;
    const receiptHTML = receiptContent.outerHTML;

    try {
      await apiRequest("POST", "/api/receipts/email", {
        email: customer.email,
        html: receiptHTML,
      });
      toast({
        title: "Email sent",
        description: "Receipt emailed successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send receipt email",
        variant: "destructive",
      });
    }
  };

  const items = (receiptData.items as any[]) || [];
  const date = new Date(receiptData.createdAt);
  const isPayLater = receiptData.paymentMethod === 'pay_later';
  const identifier = receiptData.orderNumber || receiptData.id.slice(-6).toUpperCase();

  // Initialize credit pool for stateful allocation
  const creditPool = createCreditPool();

  // Pre-calculate credit usage and totals
  let subtotalBeforeCredits = 0;
  let totalCreditsValue = 0;
  const creditUsages = items.map((item) => {
    const itemTotal = item.total || 0;
    subtotalBeforeCredits += itemTotal;
    const usage = allocateCreditsForItem(item, creditPool);
    const unitPrice =
      usage.totalQuantity > 0 ? itemTotal / usage.totalQuantity : 0;
    totalCreditsValue += usage.creditsUsed * unitPrice;
    return usage;
  });
  const netSubtotal = subtotalBeforeCredits - totalCreditsValue;
  const taxAmount = taxRate > 0 ? netSubtotal * taxRate : 0;
  const finalTotal = netSubtotal + taxAmount;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            {isPayLater ? t.payLaterReceipt : t.receipt}
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            View and print receipt details for this transaction
          </DialogDescription>
        </DialogHeader>

        {/* Receipt Content */}
        <div className="font-mono text-sm space-y-4" id="receiptContent">
          {/* Company Header with Logo */}
          <div className="text-center space-y-2">
            <img 
              src={logoUrl} 
              alt="Company Logo" 
              className="w-16 h-16 mx-auto object-contain rounded-lg"
            />
            <h3 className="font-bold text-lg">{branchName}</h3>
            <div className="flex">
              <p className="flex-1 text-gray-600">{companyTaglineEn}</p>
              <p className="flex-1 text-gray-600 text-right" dir="rtl">{companyTaglineAr}</p>
            </div>
            {(receiptHeaderEn || receiptHeaderAr) && (
              receiptHeaderEn && receiptHeaderAr ? (
                <div className="flex">
                  <p className="flex-1 text-gray-600">{receiptHeaderEn}</p>
                  <p className="flex-1 text-gray-600 text-right" dir="rtl">
                    {receiptHeaderAr}
                  </p>
                </div>
              ) : (
                <p
                  className="text-gray-600"
                  dir={receiptHeaderAr ? "rtl" : "ltr"}
                >
                  {receiptHeaderEn || receiptHeaderAr}
                </p>
              )
            )}
            {branchAddress && (
              <div className="flex">
                <p className="flex-1 text-gray-600">{branchAddress}</p>
                <p className="flex-1 text-gray-600 text-right" dir="rtl">{branchAddress}</p>
              </div>
            )}
            <div className="flex">
              <p className="flex-1 text-gray-600">{branchPhone}</p>
              <p className="flex-1 text-gray-600 text-right" dir="rtl">
                <span dir="ltr">{branchPhone}</span>
              </p>
          </div>
        </div>

        {printNumber && printedAt && (
          <div className="text-center text-xs text-gray-500">
            {`Print #${printNumber} – ${format(new Date(printedAt), "MMM dd, HH:mm")}`}
          </div>
        )}

        <div className="border-t border-b border-gray-400 py-3 space-y-1">
            {renderBilingualRow(
              tEn.date,
              tAr.date,
              date.toLocaleDateString()
            )}
            {renderBilingualRow(
              tEn.time,
              tAr.time,
              date.toLocaleTimeString()
            )}
            {renderBilingualRow(
              isPayLater ? tEn.orderNumber : tEn.receiptNumber,
              isPayLater ? tAr.orderNumber : tAr.receiptNumber,
              identifier
            )}
            {sellerName &&
              renderBilingualRow(
                tEn.staff,
                tAr.staff,
                sellerName
              )}
            {customer &&
              renderBilingualRow(
                tEn.customer,
                tAr.customer,
                customer.name
              )}
            {receiptData.customerName &&
              renderBilingualRow(
                tEn.customer,
                tAr.customer,
                receiptData.customerName
              )}
          </div>

          {/* Delivery Information */}
          {receiptData.deliveryOrder && (
            <div className="border-t border-b border-gray-400 py-3 space-y-1">
              <div className="flex">
                <div className="flex-1 font-bold text-center">
                  <Truck className="inline-block h-4 w-4 mr-1" />
                  Delivery Order
                </div>
                <div className="flex-1 font-bold text-center" dir="rtl">
                  <Truck className="inline-block h-4 w-4 ml-1" />
                  طلب توصيل
                </div>
              </div>
              
              {receiptData.deliveryOrder.deliveryAddress && (
                <>
                  {renderBilingualRow(
                    "Delivery Address",
                    "عنوان التوصيل",
                    receiptData.deliveryOrder.deliveryAddress.label
                  )}
                  <div className="flex">
                    <div className="flex-1 text-xs text-gray-600">
                      <MapPin className="inline-block h-3 w-3 mr-1" />
                      {receiptData.deliveryOrder.deliveryAddress.address}
                    </div>
                    <div className="flex-1 text-xs text-gray-600 text-right" dir="rtl">
                      <MapPin className="inline-block h-3 w-3 ml-1" />
                      {receiptData.deliveryOrder.deliveryAddress.address}
                    </div>
                  </div>
                </>
              )}
              
              {receiptData.deliveryOrder.deliveryMode &&
                renderBilingualRow(
                  "Delivery Mode",
                  "طريقة التوصيل",
                  receiptData.deliveryOrder.deliveryMode === "driver_pickup" ? "Driver Pickup / سائق التوصيل" : "Customer Cart / عربة العميل"
                )}
              
              {receiptData.deliveryOrder.deliveryFee &&
                renderBilingualRow(
                  "Delivery Fee",
                  "رسوم التوصيل",
                  formatCurrency(receiptData.deliveryOrder.deliveryFee)
                )}
              
              {receiptData.deliveryOrder.deliveryInstructions && (
                <div className="mt-2">
                  {renderBilingualRow(
                    "Delivery Instructions",
                    "تعليمات التوصيل",
                    ""
                  )}
                  <div className="flex">
                    <div className="flex-1 text-xs text-gray-600 mt-1">
                      {receiptData.deliveryOrder.deliveryInstructions}
                    </div>
                    <div className="flex-1 text-xs text-gray-600 text-right mt-1" dir="rtl">
                      {receiptData.deliveryOrder.deliveryInstructions}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Items */}
          <div className="space-y-2">
            {items.map((item, index) => {
              const serviceName =
                typeof item.service === "string"
                  ? item.service
                  : item.service?.name;
              const clothingItem =
                typeof item.name === "string"
                  ? item.name
                  : typeof item.clothingItem === "string"
                    ? item.clothingItem
                    : item.clothingItem?.name;
              const clothing = splitBilingualText(clothingItem || "");
              const service = splitBilingualText(serviceName || "");
              const englishLine =
                [clothing.en, service.en].filter(Boolean).join(" - ") +
                ` × ${item.quantity}`;
              const arabicLine =
                [clothing.ar, service.ar].filter(Boolean).join(" - ") +
                ` × ${item.quantity}`;
              const creditUsage = creditUsages[index];
              return renderBilingualItemRow(
                englishLine,
                arabicLine,
                item.total,
                index,
                creditUsage
              );
            })}
          </div>

          <div className="border-t border-gray-400 pt-3 space-y-1">
            {renderBilingualRow(
              tEn.subtotal,
              tAr.subtotal,
              formatCurrency(subtotalBeforeCredits)
            )}
            {totalCreditsValue > 0 &&
              renderBilingualRow(
                "Package Credits",
                "أرصدة الباقة",
                formatCurrency(-totalCreditsValue)
              )}
            {taxRate > 0 &&
              renderBilingualRow(
                tEn.tax,
                tAr.tax,
                formatCurrency(taxAmount)
              )}
            {renderBilingualRow(
              tEn.total,
              tAr.total,
              formatCurrency(finalTotal),
              'font-bold border-t pt-1'
            )}
          </div>

          {receiptData.packages && receiptData.packages.length > 0 && (
            <div className="border-t border-gray-400 pt-3 space-y-1">
              {receiptData.packages.map((pkg: any) => (
                <Fragment key={pkg.id}>
                  {renderBilingualRow(
                    pkg.nameEn,
                    pkg.nameAr || pkg.nameEn,
                    `Remaining: ${pkg.balance}/${pkg.totalCredits}`,
                  )}
                  {pkg.items && pkg.items.length > 0 && (
                    <div className="pl-2 space-y-1">
                      {pkg.items.map((item: any) => {
                        const label = item.clothingItemName
                          ? `${item.serviceName} – ${item.clothingItemName}`
                          : item.serviceName;
                        return renderBilingualRow(
                          label,
                          label,
                          `Used: ${item.used || 0}, Remaining: ${item.balance}/${item.totalCredits}`,
                          "text-sm",
                        );
                      })}
                    </div>
                  )}
                  {pkg.startsAt &&
                    renderBilingualRow(
                      "Purchased on",
                      "تاريخ الشراء",
                      format(new Date(pkg.startsAt), "MMM dd, yyyy"),
                    )}
                  {pkg.expiresAt &&
                    renderBilingualRow(
                      "Expires on",
                      "تاريخ الانتهاء",
                      format(new Date(pkg.expiresAt), "MMM dd, yyyy"),
                    )}
                </Fragment>
              ))}
            </div>
          )}

          {/* Payment Information */}
          <div className="border-t border-gray-400 pt-3 space-y-1">
            {renderBilingualRow(
              tEn.paymentMethod,
              tAr.paymentMethod,
              `${tEn[paymentMethodKey]} / ${tAr[paymentMethodKey]}`
            )}

            {isPayLater ? (
              <>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                  <div className="text-center space-y-1">
                    <div className="flex">
                      <p className="font-bold text-yellow-800 flex-1">{tEn.paymentDue}</p>
                      <p className="font-bold text-yellow-800 flex-1 text-right" dir="rtl">
                        {tAr.paymentDue}
                      </p>
                    </div>
                    <div className="flex">
                      <p className="text-lg font-bold text-red-600 flex-1">
                        {formatCurrency(finalTotal)}
                      </p>
                      <p className="text-lg font-bold text-red-600 flex-1 text-right" dir="rtl">
                        {formatCurrency(finalTotal)}
                      </p>
                    </div>
                    <div className="flex">
                      <p className="text-xs text-yellow-700 mt-1 flex-1">
                        {tEn.paymentDueUponPickup}
                      </p>
                      <p
                        className="text-xs text-yellow-700 mt-1 flex-1 text-right"
                        dir="rtl"
                      >
                        {tAr.paymentDueUponPickup}
                      </p>
                    </div>
                  </div>
                </div>
                {receiptData.promisedReadyDate &&
                  renderBilingualRow(
                    readyByEn,
                    readyByAr,
                    new Date(
                      receiptData.promisedReadyDate,
                    ).toLocaleDateString(),
                    'text-xs mt-2'
                  )}
                {receiptData.estimatedPickup &&
                  renderBilingualRow(
                    estimatedPickupEn,
                    estimatedPickupAr,
                    new Date(receiptData.estimatedPickup).toLocaleDateString(),
                    'text-xs mt-2'
                  )}
              </>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded p-2 mt-2">
                <div className="text-center space-y-1">
                  <div className="flex">
                    <p className="font-bold text-green-800 flex-1">{tEn.paidInFull}</p>
                    <p className="font-bold text-green-800 flex-1 text-right" dir="rtl">
                      {tAr.paidInFull}
                    </p>
                  </div>
                  <div className="flex">
                    <p className="text-xs text-green-700 flex-1">{tEn.thankYouPayment}</p>
                    <p className="text-xs text-green-700 flex-1 text-right" dir="rtl">
                      {tAr.thankYouPayment}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-400 pt-3 text-center text-xs text-gray-600 space-y-1">
            <div className="flex">
              <p className="flex-1">{tEn.thankYouService}</p>
              <p className="flex-1 text-right" dir="rtl">{tAr.thankYouService}</p>
            </div>
            <div className="flex">
              <p className="flex-1">
                {tEn.inquiriesCall} {branchPhone}
              </p>
              <p className="flex-1 text-right" dir="rtl">
                {tAr.inquiriesCall} <span dir="ltr">{branchPhone}</span>
              </p>
            </div>
            {isPayLater && (
              <div className="flex">
                <p className="font-bold text-red-600 flex-1">
                  {tEn.bringReceiptPickup}
                </p>
                <p className="font-bold text-red-600 flex-1 text-right" dir="rtl">
                  {tAr.bringReceiptPickup}
                </p>
              </div>
            )}
            {(receiptFooterEn || receiptFooterAr) && (
              receiptFooterEn && receiptFooterAr ? (
                <div className="flex">
                  <p className="flex-1">{receiptFooterEn}</p>
                  <p className="flex-1 text-right" dir="rtl">
                    {receiptFooterAr}
                  </p>
                </div>
              ) : (
                <p dir={receiptFooterAr ? "rtl" : "ltr"}>
                  {receiptFooterEn || receiptFooterAr}
                </p>
              )
            )}
            <div className="flex">
              <p className="flex-1">{tEn.damagedItemsCompensation}</p>
              <p className="flex-1 text-right" dir="rtl">
                {tAr.damagedItemsCompensation}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <Button onClick={handlePrint} className="flex-1">
            <Printer className="w-4 h-4 mr-2" />
            {t.print}
          </Button>
          {customer?.email && (
            <Button onClick={handleEmail} variant="outline" className="flex-1">
              <Mail className="w-4 h-4 mr-2" />
              {t.email}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
