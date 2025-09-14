import { useState } from "react";
import { format, differenceInDays, isAfter, isBefore } from "date-fns";
import { Package, Clock, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useCurrency } from "@/lib/currency";

interface PackageData {
  id: string;
  packageId: string;
  nameEn: string;
  nameAr: string | null;
  balance: number;
  totalCredits: number;
  startsAt: Date;
  expiresAt: Date | null;
  items?: {
    serviceId: string;
    serviceName?: string;
    clothingItemId: string;
    clothingItemName?: string;
    balance: number;
    totalCredits: number;
  }[];
}

interface EnhancedPackageDisplayProps {
  packages: PackageData[];
  onUsePackage: () => void;
  isPackageUsageDisabled?: boolean;
  cartItems?: Array<{
    service: { id: string; name: string };
    clothingItem: { id: string; name: string };
    quantity: number;
  }>;
}

export function EnhancedPackageDisplay({ 
  packages, 
  onUsePackage, 
  isPackageUsageDisabled = false,
  cartItems = []
}: EnhancedPackageDisplayProps) {
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const { formatCurrency } = useCurrency();

  const togglePackageExpanded = (packageId: string) => {
    const newExpanded = new Set(expandedPackages);
    if (newExpanded.has(packageId)) {
      newExpanded.delete(packageId);
    } else {
      newExpanded.add(packageId);
    }
    setExpandedPackages(newExpanded);
  };

  const getPackageStatus = (pkg: PackageData) => {
    const now = new Date();
    const startDate = new Date(pkg.startsAt);
    const endDate = pkg.expiresAt ? new Date(pkg.expiresAt) : null;

    if (isBefore(now, startDate)) {
      return { status: 'not_started', label: 'Not Started', color: 'bg-gray-100 text-gray-600' };
    }
    
    if (endDate && isAfter(now, endDate)) {
      return { status: 'expired', label: 'Expired', color: 'bg-red-100 text-red-600' };
    }

    if (pkg.balance === 0) {
      return { status: 'depleted', label: 'Used Up', color: 'bg-orange-100 text-orange-600' };
    }

    if (endDate) {
      const daysLeft = differenceInDays(endDate, now);
      if (daysLeft <= 7) {
        return { status: 'expiring_soon', label: `${daysLeft} days left`, color: 'bg-yellow-100 text-yellow-600' };
      }
    }

    return { status: 'active', label: 'Active', color: 'bg-green-100 text-green-600' };
  };

  const getUsagePercentage = (balance: number, total: number) => {
    return total > 0 ? ((total - balance) / total) * 100 : 0;
  };

  const getCartCompatibility = (pkg: PackageData) => {
    if (!pkg.items || cartItems.length === 0) {
      return { compatibleItems: [], totalUsableCredits: 0 };
    }

    const compatibleItems: Array<{
      serviceId: string;
      clothingItemId: string;
      serviceName: string;
      clothingItemName: string;
      cartQuantity: number;
      availableCredits: number;
      usableCredits: number;
    }> = [];

    let totalUsableCredits = 0;

    cartItems.forEach(cartItem => {
      const packageItem = pkg.items?.find(
        item => item.serviceId === cartItem.service.id && 
                item.clothingItemId === cartItem.clothingItem.id
      );

      if (packageItem && packageItem.balance > 0) {
        const usableCredits = Math.min(packageItem.balance, cartItem.quantity);
        compatibleItems.push({
          serviceId: cartItem.service.id,
          clothingItemId: cartItem.clothingItem.id,
          serviceName: cartItem.service.name,
          clothingItemName: cartItem.clothingItem.name,
          cartQuantity: cartItem.quantity,
          availableCredits: packageItem.balance,
          usableCredits
        });
        totalUsableCredits += usableCredits;
      }
    });

    return { compatibleItems, totalUsableCredits };
  };

  if (packages.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-700">Customer Packages</span>
          <Badge variant="secondary" className="text-xs">
            {packages.length} active
          </Badge>
        </div>
      </div>

      <div className="space-y-2">
        {packages.map((pkg) => {
          const status = getPackageStatus(pkg);
          const isExpanded = expandedPackages.has(pkg.id);
          const usagePercentage = getUsagePercentage(pkg.balance, pkg.totalCredits);
          const isUsable = status.status === 'active' && pkg.balance > 0;
          const compatibility = getCartCompatibility(pkg);

          return (
            <Card 
              key={pkg.id} 
              className={`transition-all duration-200 ${
                isUsable ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'
              }`}
              data-testid={`package-card-${pkg.id}`}
            >
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <CardHeader 
                    className="pb-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => togglePackageExpanded(pkg.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-blue-500" />
                          <CardTitle className="text-sm font-medium">
                            {pkg.nameEn}
                          </CardTitle>
                          <Badge className={`text-xs ${status.color}`}>
                            {status.label}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <span className="text-lg font-bold text-blue-600">
                              {pkg.balance}
                            </span>
                            <span className="text-sm text-gray-500">
                              / {pkg.totalCredits} credits
                            </span>
                          </div>
                          
                          {pkg.expiresAt && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span>
                                Expires {format(new Date(pkg.expiresAt), "MMM d, yyyy")}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Progress 
                            value={usagePercentage} 
                            className="flex-1 h-2" 
                            data-testid={`package-progress-${pkg.id}`}
                          />
                          <span className="text-xs text-gray-500 min-w-fit">
                            {Math.round(usagePercentage)}% used
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 ml-3">
                        {status.status === 'expiring_soon' && (
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        )}
                        {status.status === 'expired' && (
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                        )}
                        {isUsable && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-3">
                    {/* Cart Compatibility Section */}
                    {cartItems.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                            🛒 Cart Compatibility
                          </div>
                          {compatibility.totalUsableCredits > 0 && (
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              {compatibility.totalUsableCredits} credits applicable
                            </Badge>
                          )}
                        </div>
                        
                        {compatibility.compatibleItems.length > 0 ? (
                          <div className="grid gap-2">
                            {compatibility.compatibleItems.map((item, index) => (
                              <div 
                                key={`${item.serviceId}:${item.clothingItemId}`}
                                className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200"
                                data-testid={`cart-compatible-item-${pkg.id}-${index}`}
                              >
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-green-800">
                                    ✓ {item.serviceName}
                                  </div>
                                  <div className="text-xs text-green-600">
                                    {item.clothingItemName} • Cart: {item.cartQuantity} items
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-bold text-green-700">
                                    Use {item.usableCredits}
                                  </div>
                                  <div className="text-xs text-green-600">
                                    of {item.availableCredits} available
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-3 bg-amber-50 rounded border border-amber-200">
                            <div className="text-sm text-amber-700">
                              💡 No cart items match this package
                            </div>
                            <div className="text-xs text-amber-600 mt-1">
                              Add matching services to use package credits
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Available Services Section */}
                    {pkg.items && pkg.items.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                          📋 All Available Services
                        </div>
                        <div className="grid gap-2">
                          {pkg.items.map((item, index) => {
                            const isInCart = compatibility.compatibleItems.some(
                              ci => ci.serviceId === item.serviceId && ci.clothingItemId === item.clothingItemId
                            );
                            return (
                              <div 
                                key={`${item.serviceId}:${item.clothingItemId}`}
                                className={`flex items-center justify-between p-2 rounded border ${
                                  isInCart 
                                    ? 'bg-blue-50 border-blue-200' 
                                    : 'bg-white border-gray-100'
                                }`}
                                data-testid={`package-item-${pkg.id}-${index}`}
                              >
                                <div className="flex-1">
                                  <div className={`text-sm font-medium ${isInCart ? 'text-blue-800' : ''}`}>
                                    {isInCart && '🛒 '}{item.serviceName || item.serviceId}
                                  </div>
                                  <div className={`text-xs ${isInCart ? 'text-blue-600' : 'text-gray-500'}`}>
                                    {item.clothingItemName || item.clothingItemId}
                                    {isInCart && ' • In current cart'}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`text-sm font-medium ${isInCart ? 'text-blue-700' : ''}`}>
                                    {item.balance} / {item.totalCredits}
                                  </div>
                                  <div className={`text-xs ${isInCart ? 'text-blue-600' : 'text-gray-500'}`}>credits</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-500 flex-1">
                        Valid from {format(new Date(pkg.startsAt), "MMM d, yyyy")}
                        {pkg.expiresAt && ` until ${format(new Date(pkg.expiresAt), "MMM d, yyyy")}`}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full mt-3 border-blue-200 text-blue-600 hover:bg-blue-50"
        onClick={onUsePackage}
        disabled={isPackageUsageDisabled || !packages.some(pkg => getPackageStatus(pkg).status === 'active' && pkg.balance > 0)}
        data-testid="use-package-button"
      >
        <Gift className="w-4 h-4 mr-2" />
        Use Package Credits
      </Button>
    </div>
  );
}