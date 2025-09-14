import { useState, useCallback } from "react";
import type {
  LaundryCartItem,
  LaundryCartSummary,
  ClothingItem,
  LaundryServiceWithItemPrice,
} from "@shared/schema";
import { getTaxRate } from "@/lib/tax";
import { apiRequest } from "@/lib/queryClient";

type AppliedCoupon = {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  discount: number;
  nameEn: string;
  applicationType: "whole_cart" | "specific_items" | "specific_services";
  applicableItems?: LaundryCartItem[];
};

export function useLaundryCart() {
  const [cartItems, setCartItems] = useState<LaundryCartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "pay_later">("cash");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [isCouponLoading, setIsCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const addToCart = useCallback((clothingItem: ClothingItem, service: LaundryServiceWithItemPrice, quantity: number = 1) => {
    setCartItems(prev => {
      // Create unique ID combining clothing item and service
      const uniqueId = `${clothingItem.id}-${service.id}`;
      const existing = prev.find(item => item.id === uniqueId);

      if (existing) {
        return prev.map(item =>
          item.id === uniqueId
            ? {
                ...item,
                quantity: item.quantity + quantity,
                total: (item.quantity + quantity) * parseFloat(service.itemPrice ?? service.price)
              }
            : item
        );
      }

      const price = parseFloat(service.itemPrice ?? service.price);
      return [...prev, {
        id: uniqueId,
        clothingItem,
        service,
        quantity,
        total: quantity * price
      }];
    });
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setCartItems(prev => prev.filter(item => item.id !== id));
      return;
    }
    
    setCartItems(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...item,
              quantity,
              total: quantity * parseFloat(item.service.itemPrice ?? item.service.price),
            }
          : item
      )
    );
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }, []);

  const applyCoupon = useCallback(async (code: string, branchId: string) => {
    setIsCouponLoading(true);
    setCouponError(null);
    
    try {
      const cartData = cartItems.map(item => ({
        clothingItem: item.clothingItem,
        service: item.service,
        quantity: item.quantity,
        total: item.total
      }));

      const response = await apiRequest("POST", "/api/coupons/validate", {
        code: code.trim(),
        branchId,
        cartItems: cartData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to validate coupon");
      }

      if (result.valid && result.coupon) {
        const coupon: AppliedCoupon = {
          id: result.coupon.id,
          code: result.coupon.code,
          discountType: result.coupon.discountType,
          discountValue: parseFloat(result.coupon.discountValue),
          discount: result.discount,
          nameEn: result.coupon.nameEn,
          applicationType: result.coupon.applicationType,
          applicableItems: result.applicableItems || cartItems
        };

        setAppliedCoupon(coupon);
        setCouponCode(code.trim());
        return { success: true, coupon };
      } else {
        throw new Error(result.message || "Invalid coupon");
      }
    } catch (error: any) {
      setCouponError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsCouponLoading(false);
    }
  }, [cartItems]);

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  }, []);

  const getCartSummary = useCallback((): LaundryCartSummary & { 
    coupon?: AppliedCoupon; 
    discountAmount?: number; 
    totalBeforeDiscount?: number; 
  } => {
    const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
    const taxRate = getTaxRate();
    
    let discountAmount = 0;
    let applicableSubtotal = subtotal;

    // Apply coupon discount if available
    if (appliedCoupon) {
      if (appliedCoupon.applicationType === "whole_cart") {
        applicableSubtotal = subtotal;
      } else if (appliedCoupon.applicableItems && appliedCoupon.applicableItems.length > 0) {
        applicableSubtotal = appliedCoupon.applicableItems.reduce((sum, item) => sum + item.total, 0);
      }
      discountAmount = Math.min(appliedCoupon.discount, applicableSubtotal);
    }

    const discountedSubtotal = subtotal - discountAmount;
    const tax = discountedSubtotal * taxRate;
    const total = discountedSubtotal + tax;
    const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    return {
      items: cartItems,
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round(total * 100) / 100,
      itemCount,
      coupon: appliedCoupon || undefined,
      discountAmount: Math.round(discountAmount * 100) / 100,
      totalBeforeDiscount: appliedCoupon ? Math.round((subtotal + (subtotal * taxRate)) * 100) / 100 : undefined
    };
  }, [cartItems, appliedCoupon]);

  return {
    cartItems,
    paymentMethod,
    setPaymentMethod,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getCartSummary,
    // Coupon functionality
    appliedCoupon,
    couponCode,
    isCouponLoading,
    couponError,
    applyCoupon,
    removeCoupon,
    setCouponCode
  };
}
