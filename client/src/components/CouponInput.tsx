import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuthContext } from "@/context/AuthContext";
import { useCurrency } from "@/lib/currency";
import { 
  TicketPercent, 
  X, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Shirt,
  Package 
} from "lucide-react";

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

interface CouponInputProps {
  couponCode: string;
  setCouponCode: (code: string) => void;
  appliedCoupon: AppliedCoupon | null;
  isCouponLoading: boolean;
  couponError: string | null;
  onApplyCoupon: (code: string, branchId: string) => Promise<{ success: boolean; error?: string; coupon?: AppliedCoupon }>;
  onRemoveCoupon: () => void;
  discountAmount?: number;
}

export function CouponInput({
  couponCode,
  setCouponCode,
  appliedCoupon,
  isCouponLoading,
  couponError,
  onApplyCoupon,
  onRemoveCoupon,
  discountAmount = 0
}: CouponInputProps) {
  const [inputValue, setInputValue] = useState("");
  const { branch } = useAuthContext();
  const { formatCurrency } = useCurrency();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !branch?.id || isCouponLoading) return;
    
    const result = await onApplyCoupon(inputValue.trim(), branch.id);
    if (result.success) {
      setInputValue("");
    }
  };

  const handleRemove = () => {
    onRemoveCoupon();
    setInputValue("");
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium flex items-center gap-2">
        <TicketPercent className="h-4 w-4" />
        Coupon Code
      </Label>

      {!appliedCoupon ? (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            placeholder="Enter coupon code"
            className="flex-1"
            disabled={isCouponLoading}
          />
          <Button 
            type="submit" 
            size="sm" 
            disabled={!inputValue.trim() || isCouponLoading}
            className="px-4"
          >
            {isCouponLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Apply"
            )}
          </Button>
        </form>
      ) : (
        <div className="space-y-2">
          {/* Applied Coupon Display */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <div className="font-medium text-green-800">
                    {appliedCoupon.code}
                  </div>
                  <div className="text-sm text-green-600">
                    {appliedCoupon.nameEn}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                className="text-green-600 hover:text-green-800 hover:bg-green-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Coupon Details */}
            <div className="mt-2 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700">Discount:</span>
                <span className="font-medium text-green-800">
                  {appliedCoupon.discountType === "percentage" 
                    ? `${appliedCoupon.discountValue}%` 
                    : formatCurrency(appliedCoupon.discountValue)
                  }
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-green-700">Savings:</span>
                <span className="font-medium text-green-800">
                  -{formatCurrency(discountAmount)}
                </span>
              </div>

              {/* Application Type Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {appliedCoupon.applicationType === "whole_cart" && (
                    <>
                      <Package className="h-3 w-3 mr-1" />
                      Whole Cart
                    </>
                  )}
                  {appliedCoupon.applicationType === "specific_items" && (
                    <>
                      <Shirt className="h-3 w-3 mr-1" />
                      Specific Items
                    </>
                  )}
                  {appliedCoupon.applicationType === "specific_services" && (
                    <>
                      <Package className="h-3 w-3 mr-1" />
                      Specific Services
                    </>
                  )}
                </Badge>
                
                {appliedCoupon.applicableItems && appliedCoupon.applicationType !== "whole_cart" && (
                  <span className="text-xs text-green-600">
                    Applied to {appliedCoupon.applicableItems.length} item{appliedCoupon.applicableItems.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {couponError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          <AlertCircle className="h-4 w-4" />
          {couponError}
        </div>
      )}
    </div>
  );
}