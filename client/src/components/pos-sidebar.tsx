import { ShoppingCart, Package, Settings, Users, Truck, TrendingUp, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useAuthContext } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import { useStaffChat } from "@/context/StaffChatContext";

interface POSSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function POSSidebar({ activeView, onViewChange }: POSSidebarProps) {
  const { isDriver, branch } = useAuthContext();
  const { t } = useTranslation();
  const { unreadCount, reset } = useStaffChat();
  (window as any).__resetStaffChat = reset;
  const menuItems = [
    { id: "sales", label: t.sales, icon: ShoppingCart },
    { id: "customers", label: t.customers, icon: Users },
    { id: "orders", label: t.orders, icon: Truck },
    { id: "order-management", label: t.orderManagement, icon: Package },
    { id: "packages", label: t.packages, icon: Package },
    { id: "reports", label: t.reports, icon: TrendingUp },
    { id: "chat", label: (t as any).supportChat || "Support Chat", icon: MessageSquare },
    ...(branch?.deliveryEnabled
      ? [
          { id: "delivery-orders", label: t.deliveryOrders, icon: Truck },
          {
            id: "delivery-order-requests",
            label: t.deliveryOrderRequests,
            icon: Truck,
          },
        ]
      : []),
    { id: "inventory", label: t.inventory, icon: Package },
    { id: "settings", label: t.settings, icon: Settings }
  ];

  return (
    <nav className="hidden lg:flex flex-col w-64 bg-pos-surface shadow-material border-r border-gray-200">
      <div className="p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-6">{t.navigation}</h2>
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            
            return (
              <li key={item.id}>
                <Button
                  variant="ghost"
                  className={`w-full justify-start space-x-3 px-4 py-3 ${
                    isActive 
                      ? "bg-blue-50 text-pos-primary font-medium" 
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onClick={() => onViewChange(item.id)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="flex items-center gap-2">
                    {item.label}
                    {item.id === 'chat' && unreadCount > 0 && (
                      <Badge variant="default">{unreadCount}</Badge>
                    )}
                  </span>
                </Button>
              </li>
            );
          })}
          {isDriver && (
            <li>
              <Link href="/driver">
                <Button
                  variant="ghost"
                  className="w-full justify-start space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50"
                >
                  <Truck className="h-5 w-5" />
                  <span>{t.driverDashboard}</span>
                </Button>
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
