import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { User, MapPin, Phone, Mail, AlertCircle } from "lucide-react";

export type GuestCheckoutData = {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: {
    street: string;
    area: string;
    city: string;
    block?: string;
    building?: string;
    floor?: string;
    apartment?: string;
    additionalInfo?: string;
  };
};

interface GuestCheckoutFormProps {
  isVisible: boolean;
  onSubmit: (data: GuestCheckoutData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  requireAddress: boolean;
}

export function GuestCheckoutForm({ 
  isVisible, 
  onSubmit, 
  onCancel, 
  isLoading = false,
  requireAddress = true 
}: GuestCheckoutFormProps) {
  const [formData, setFormData] = useState<GuestCheckoutData>({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    address: {
      street: "",
      area: "",
      city: "",
      block: "",
      building: "",
      floor: "",
      apartment: "",
      additionalInfo: "",
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isVisible) return null;

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleAddressChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      address: { ...prev.address, [field]: value }
    }));
    if (errors[`address.${field}`]) {
      setErrors(prev => ({ ...prev, [`address.${field}`]: "" }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.customerName.trim()) {
      newErrors.customerName = "Name is required";
    }

    if (!formData.customerPhone.trim()) {
      newErrors.customerPhone = "Phone number is required";
    } else if (!/^\+?[0-9\s-()]{8,}$/.test(formData.customerPhone.trim())) {
      newErrors.customerPhone = "Please enter a valid phone number";
    }

    if (formData.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customerEmail)) {
      newErrors.customerEmail = "Please enter a valid email address";
    }

    // Address validation (if required)
    if (requireAddress) {
      if (!formData.address.street.trim()) {
        newErrors["address.street"] = "Street address is required";
      }
      if (!formData.address.area.trim()) {
        newErrors["address.area"] = "Area is required";
      }
      if (!formData.address.city.trim()) {
        newErrors["address.city"] = "City is required";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Guest Checkout
          </CardTitle>
          <CardDescription>
            Please provide your contact information and delivery address to complete your order.
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer Information */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="h-4 w-4" />
                <h3 className="font-medium">Contact Information</h3>
                <Badge variant="outline" className="text-xs">Required</Badge>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customerName">Full Name *</Label>
                  <Input
                    id="customerName"
                    placeholder="Enter your full name"
                    value={formData.customerName}
                    onChange={(e) => handleInputChange("customerName", e.target.value)}
                    className={errors.customerName ? "border-red-500" : ""}
                  />
                  {errors.customerName && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.customerName}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="customerPhone">Phone Number *</Label>
                  <Input
                    id="customerPhone"
                    placeholder="+965 1234 5678"
                    value={formData.customerPhone}
                    onChange={(e) => handleInputChange("customerPhone", e.target.value)}
                    className={errors.customerPhone ? "border-red-500" : ""}
                  />
                  {errors.customerPhone && (
                    <p className="text-sm text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.customerPhone}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="customerEmail">Email Address (Optional)</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  placeholder="your.email@example.com"
                  value={formData.customerEmail}
                  onChange={(e) => handleInputChange("customerEmail", e.target.value)}
                  className={errors.customerEmail ? "border-red-500" : ""}
                />
                {errors.customerEmail && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.customerEmail}
                  </p>
                )}
              </div>
            </div>

            {/* Delivery Address */}
            {requireAddress && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="h-4 w-4" />
                    <h3 className="font-medium">Delivery Address</h3>
                    <Badge variant="outline" className="text-xs">Required</Badge>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="street">Street Address *</Label>
                      <Input
                        id="street"
                        placeholder="Street name and number"
                        value={formData.address.street}
                        onChange={(e) => handleAddressChange("street", e.target.value)}
                        className={errors["address.street"] ? "border-red-500" : ""}
                      />
                      {errors["address.street"] && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {errors["address.street"]}
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="area">Area *</Label>
                      <Input
                        id="area"
                        placeholder="Area or district"
                        value={formData.address.area}
                        onChange={(e) => handleAddressChange("area", e.target.value)}
                        className={errors["address.area"] ? "border-red-500" : ""}
                      />
                      {errors["address.area"] && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {errors["address.area"]}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="city">City *</Label>
                      <Input
                        id="city"
                        placeholder="City"
                        value={formData.address.city}
                        onChange={(e) => handleAddressChange("city", e.target.value)}
                        className={errors["address.city"] ? "border-red-500" : ""}
                      />
                      {errors["address.city"] && (
                        <p className="text-sm text-red-500 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {errors["address.city"]}
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="block">Block</Label>
                      <Input
                        id="block"
                        placeholder="Block"
                        value={formData.address.block}
                        onChange={(e) => handleAddressChange("block", e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="building">Building</Label>
                      <Input
                        id="building"
                        placeholder="Building"
                        value={formData.address.building}
                        onChange={(e) => handleAddressChange("building", e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="floor">Floor</Label>
                      <Input
                        id="floor"
                        placeholder="Floor number"
                        value={formData.address.floor}
                        onChange={(e) => handleAddressChange("floor", e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="apartment">Apartment</Label>
                      <Input
                        id="apartment"
                        placeholder="Apartment number"
                        value={formData.address.apartment}
                        onChange={(e) => handleAddressChange("apartment", e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="additionalInfo">Additional Information</Label>
                    <Textarea
                      id="additionalInfo"
                      placeholder="Any additional delivery instructions or landmarks..."
                      value={formData.address.additionalInfo}
                      onChange={(e) => handleAddressChange("additionalInfo", e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Form Actions */}
            <Separator />
            <div className="flex gap-3 justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="min-w-[120px]"
              >
                {isLoading ? "Processing..." : "Complete Order"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}