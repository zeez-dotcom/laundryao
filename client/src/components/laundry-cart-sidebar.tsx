import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Trash2, X, User, CreditCard, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LaundryCartSummary, Customer } from "@shared/schema";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCurrency } from "@/lib/currency";
import { getTaxRate } from "@/lib/tax";
import { CustomerDialog } from "./customer-dialog";
import { PackageUsageModal } from "./PackageUsageModal";
import { CouponInput } from "./CouponInput";
import { EnhancedPackageDisplay } from "./EnhancedPackageDisplay";
import { format } from "date-fns";

type AppliedCoupon = {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  discount: number;
  nameEn: string;
  applicationType: "whole_cart" | "specific_items" | "specific_services";
  applicableItems?: any[];
};

interface LaundryCartSidebarProps {
  cartSummary: LaundryCartSummary & {
    coupon?: AppliedCoupon;
    discountAmount?: number;
    totalBeforeDiscount?: number;
    creditedAmount?: number;
  };
  getCartSummary?: (
    usage?: {
      items: { serviceId: string; clothingItemId: string; quantity: number }[];
    }
  ) =>
    LaundryCartSummary & {
      coupon?: AppliedCoupon;
      discountAmount?: number;
      totalBeforeDiscount?: number;
      creditedAmount?: number;
    };
  paymentMethod: "cash" | "card" | "pay_later";
  selectedCustomer: Customer | null;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onSelectPayment: (method: "cash" | "card" | "pay_later") => void;
  onSelectCustomer: (customer: Customer | null) => void;
  onCheckout: (
    redeemedPoints: number,
    readyByOption: string,
    readyByDate: Date,
    packageUsage?: {
      packageId: string;
      items: {
        serviceId: string;
        clothingItemId: string;
        quantity: number;
      }[];
    },
  ) => void;
  isVisible: boolean;
  onClose: () => void;
  // Coupon functionality
  appliedCoupon?: AppliedCoupon | null;
  couponCode?: string;
  isCouponLoading?: boolean;
  couponError?: string | null;
  onApplyCoupon?: (code: string, branchId: string) => Promise<{ success: boolean; error?: string; coupon?: AppliedCoupon }>;
  onRemoveCoupon?: () => void;
  setCouponCode?: (code: string) => void;
}

export function LaundryCartSidebar({
  cartSummary,
  getCartSummary = () => cartSummary,
  paymentMethod,
  selectedCustomer,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onSelectPayment,
  onSelectCustomer,
  onCheckout,
  isVisible,
  onClose,
  // Coupon props
  appliedCoupon = null,
  couponCode = "",
  isCouponLoading = false,
  couponError = null,
  onApplyCoupon,
  onRemoveCoupon,
  setCouponCode
}: LaundryCartSidebarProps) {
  const isMobile = useIsMobile();
  const { formatCurrency } = useCurrency();
  const taxRate = getTaxRate();

  const [redeemPoints, setRedeemPoints] = useState(0);
  const [readyBy, setReadyBy] = useState("tomorrow");
  const [isPackageModalOpen, setPackageModalOpen] = useState(false);
  const [packageUsage, setPackageUsage] = useState<
    | {
        packageId: string;
        items: {
          serviceId: string;
          clothingItemId: string;
          quantity: number;
        }[];
      }
    | null
  >(null);

  const getReadyByDate = () => computeReadyBy(readyBy);

  useEffect(() => {
    setRedeemPoints(0);
    setPackageUsage(null);
  }, [selectedCustomer, cartSummary.total]);
  const adjustedSummary = getCartSummary(packageUsage || undefined);

  const maxRedeemable = selectedCustomer
    ? Math.min(selectedCustomer.loyaltyPoints, Math.floor(adjustedSummary.total * 10))
    : 0;
  const finalTotal = Math.max(adjustedSummary.total - redeemPoints * 0.1, 0);
  const { data: customerPackages = [] } = useQuery<any[]>({
    queryKey: ["/api/customers", selectedCustomer?.id, "packages"],
    enabled: !!selectedCustomer?.id,
  });

  return (
    <div
      className={`
      ${isMobile ? 'fixed inset-0 z-50' : 'w-96'}
      ${isMobile && !isVisible ? 'hidden' : 'flex'}
      bg-pos-surface shadow-material-lg border-l border-gray-200 flex-col h-full overflow-hidden
    `}
    >
      {/* Cart Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Laundry Cart</h2>
          {isMobile && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5 text-gray-500" />
            </Button>
          )}
        </div>
      </div>

      {/* Unified Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Customer Selection */}
        <div className="border-b border-gray-200 bg-gray-50">
          <div className="p-4 space-y-3">
            <Label className="text-sm font-medium">Customer (Optional)</Label>
            
            {selectedCustomer ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="font-medium">
                        {selectedCustomer.name}
                        {selectedCustomer.nickname && (
                          <span className="text-sm text-gray-500 ml-1">
                            ({selectedCustomer.nickname})
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500">{selectedCustomer.phoneNumber}</p>
                      {parseFloat(selectedCustomer.balanceDue) > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          Balance: {formatCurrency(selectedCustomer.balanceDue)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectCustomer(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                {/* Enhanced Package Display */}
                {customerPackages.length > 0 && (
                  <EnhancedPackageDisplay
                    packages={customerPackages}
                    onUsePackage={() => setPackageModalOpen(true)}
                    isPackageUsageDisabled={cartSummary.items.length === 0}
                    cartItems={cartSummary.items.map(item => ({
                      service: { id: item.service.id, name: item.service.name },
                      clothingItem: { id: item.clothingItem.id, name: item.clothingItem.name },
                      quantity: item.quantity
                    }))}
                  />
                )}
              </div>
            ) : (
              <CustomerDialog onSelectCustomer={onSelectCustomer} />
            )}
          </div>
        </div>

        {/* Cart Items */}
        <div className="p-4">
        {cartSummary.items.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            Your cart is empty
          </div>
        ) : (
          <div className="space-y-3">
            {cartSummary.items.map((item) => (
              <Card key={item.id} className="bg-gray-50">
                <CardContent className="p-3">
                  <div className="flex items-start space-x-3">
                    {item.clothingItem.imageUrl && (
                      <img
                        src={item.clothingItem.imageUrl}
                        alt={item.clothingItem.name}
                        className="w-12 h-12 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">
                        {item.clothingItem.name}
                      </h4>
                      <p className="text-sm text-blue-600 font-medium">
                        {item.service.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatCurrency(item.service.price)} each
                      </p>
                      
                      {/* Quantity Controls */}
                      <div className="flex items-center space-x-2 mt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-7 h-7 p-0 rounded-full"
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-medium w-8 text-center">
                          {item.quantity}
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-7 h-7 p-0 rounded-full"
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-medium text-gray-900">
                        {formatCurrency(item.total)}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-pos-error hover:text-red-700 p-0 mt-1"
                        onClick={() => onRemoveItem(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Cart Summary and Checkout */}
      {cartSummary.items.length > 0 && (
        <div className="border-t border-gray-200 p-4 space-y-4">
          {/* Coupon Section */}
          {(() => {
            const safeSet = setCouponCode || (() => {});
            const safeApply = onApplyCoupon || (async () => ({ success: false }));
            const safeRemove = onRemoveCoupon || (() => {});
            return (
              <CouponInput
                couponCode={couponCode}
                setCouponCode={safeSet}
                appliedCoupon={appliedCoupon}
                isCouponLoading={isCouponLoading}
                couponError={couponError}
                onApplyCoupon={safeApply}
                onRemoveCoupon={safeRemove}
                discountAmount={adjustedSummary.discountAmount}
              />
            );
          })()}

          {/* Summary */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">{formatCurrency(cartSummary.subtotal)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">Tax ({(taxRate * 100).toString()}%):</span>
                <span className="font-medium">{formatCurrency(adjustedSummary.tax)}</span>
              </div>
            )}
            {selectedCustomer && maxRedeemable > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">
                  Redeem Points (Avail: {selectedCustomer.loyaltyPoints})
                </span>
                <Input
                  type="number"
                  min={0}
                  max={maxRedeemable}
                  value={redeemPoints}
                  onChange={(e) =>
                    setRedeemPoints(
                      Math.min(
                        Math.max(0, parseInt(e.target.value) || 0),
                        maxRedeemable
                      )
                    )
                  }
                  className="w-20 h-7"
                />
              </div>
            )}
            {redeemPoints > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Loyalty Discount:</span>
                <span>-{formatCurrency(redeemPoints * 0.1)}</span>
              </div>
            )}
            {adjustedSummary.creditedAmount && adjustedSummary.creditedAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Package Credit:</span>
                <span>-{formatCurrency(adjustedSummary.creditedAmount)}</span>
              </div>
            )}
            {adjustedSummary.discountAmount && adjustedSummary.discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Coupon Discount:</span>
                <span>-{formatCurrency(adjustedSummary.discountAmount)}</span>
              </div>
            )}
          <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-3">
            <span>Total:</span>
            <span>{formatCurrency(finalTotal)}</span>
          </div>
        </div>

          {/* Ready By Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Ready By:</label>
            <RadioGroup
              value={readyBy}
              onValueChange={setReadyBy}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="today" id="ready-today" />
                <Label htmlFor="ready-today">Today</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="tomorrow" id="ready-tomorrow" />
                <Label htmlFor="ready-tomorrow">Tomorrow</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="day_after_tomorrow"
                  id="ready-day-after"
                />
                <Label htmlFor="ready-day-after">Day After Tomorrow</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Payment Method:</label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={paymentMethod === "cash" ? "default" : "outline"}
                className={`justify-center space-x-1 ${
                  paymentMethod === "cash" 
                    ? "bg-pos-primary hover:bg-blue-700 text-white" 
                    : ""
                }`}
                onClick={() => onSelectPayment("cash")}
              >
                <DollarSign className="h-4 w-4" />
                <span>Cash</span>
              </Button>
              <Button
                variant={paymentMethod === "card" ? "default" : "outline"}
                className={`justify-center space-x-1 ${
                  paymentMethod === "card" 
                    ? "bg-pos-primary hover:bg-blue-700 text-white" 
                    : ""
                }`}
                onClick={() => onSelectPayment("card")}
              >
                <CreditCard className="h-4 w-4" />
                <span>Card</span>
              </Button>
              <Button
                variant={paymentMethod === "pay_later" ? "default" : "outline"}
                className={`justify-center space-x-1 ${
                  paymentMethod === "pay_later" 
                    ? "bg-pos-primary hover:bg-blue-700 text-white" 
                    : ""
                }`}
                onClick={() => onSelectPayment("pay_later")}
                disabled={!selectedCustomer}
              >
                <User className="h-4 w-4" />
                <span>Pay Later</span>
              </Button>
            </div>
            {paymentMethod === "pay_later" && !selectedCustomer && (
              <p className="text-xs text-amber-600">
                Please select a customer for pay later option
              </p>
            )}
          </div>

          {/* Checkout Button */}
          <Button
            className="w-full bg-pos-secondary hover:bg-green-600 text-white font-medium py-4"
            onClick={() =>
              onCheckout(
                redeemPoints,
                readyBy,
                getReadyByDate(),
                packageUsage || undefined,
              )
            }
            disabled={
              cartSummary.items.length === 0 ||
              (paymentMethod === "pay_later" && !selectedCustomer)
            }
          >
            <span className="mr-2">✓</span>
            {paymentMethod === "pay_later" ? "Create Order (Pay Later)" : "Complete Order"}
          </Button>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-800">
              ⏸️ Hold
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-pos-error hover:text-red-700"
              onClick={onClearCart}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}
      <PackageUsageModal
        open={isPackageModalOpen}
        onClose={() => setPackageModalOpen(false)}
        packages={customerPackages}
        cartSummary={cartSummary}
        onApply={(u) => {
          setPackageUsage(u);
          setPackageModalOpen(false);
        }}
      />
    </div>
  );
}

export function computeReadyBy(choice: string) {
  const date = new Date();
  if (choice === "tomorrow") {
    date.setDate(date.getDate() + 1);
  } else if (choice === "day_after_tomorrow") {
    date.setDate(date.getDate() + 2);
  }
  return date;
}
