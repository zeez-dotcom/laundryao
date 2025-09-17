import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import { Order, OrderPrint } from "@shared/schema";
import { Search, Package, CheckCircle, AlertCircle, Printer } from "lucide-react";
import { format } from "date-fns";
import { useCurrency } from "@/lib/currency";
import { ReceiptModal } from "./receipt-modal";
import { useTranslation, Translations } from "@/lib/i18n";
import LoadingScreen from "@/components/common/LoadingScreen";
import EmptyState from "@/components/common/EmptyState";
import { useAuthContext } from "@/context/AuthContext";
import { buildReceiptData } from "@/lib/receipt";
import { useApiError } from "@/hooks/use-api-error";

export interface OrderItem {
  clothingItem: string | { name: string };
  service: string | { name: string };
  quantity: number;
}

const statusColors = {
  received: "bg-blue-100 text-blue-800",
  start_processing: "bg-blue-100 text-blue-800",
  processing: "bg-yellow-100 text-yellow-800",
  ready: "bg-green-100 text-green-800",
  handed_over: "bg-gray-100 text-gray-800",
};

const statusIcons = {
  received: Package,
  start_processing: Package,
  processing: AlertCircle,
  ready: CheckCircle,
  handed_over: CheckCircle,
};

export const getItemsSummary = (items: OrderItem[], t: Translations): string => {
  return items
    .map((item) => {
      const clothingName =
        typeof item.clothingItem === "string"
          ? item.clothingItem
          : item.clothingItem?.name || t.item;
      const serviceName =
        typeof item.service === "string"
          ? item.service
          : item.service?.name || t.service;
      return `${item.quantity}x ${clothingName} (${serviceName})`;
    })
    .join(", ");
};

export type OrderWithExtras = Order & { customerNickname?: string | null; balanceDue?: string | null };

export function matchesOrderSearch(order: OrderWithExtras, term: string) {
  const lower = term.toLowerCase();
  return (
    order.orderNumber.toLowerCase().includes(lower) ||
    order.customerName.toLowerCase().includes(lower) ||
    order.customerPhone.includes(term) ||
    (order.customerNickname?.toLowerCase().includes(lower) ?? false)
  );
}

export function sortOrders(
  orders: OrderWithExtras[],
  field: "createdAt" | "balanceDue",
  direction: "asc" | "desc",
) {
  return [...orders].sort((a, b) => {
    if (field === "balanceDue") {
      const diff = Number(a.balanceDue || 0) - Number(b.balanceDue || 0);
      return direction === "asc" ? diff : -diff;
    }
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return direction === "asc" ? diff : -diff;
  });
}

export function OrderTracking() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<"createdAt" | "balanceDue">("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'pay_later'>('all');
  const [payLaterOnly, setPayLaterOnly] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printInfo, setPrintInfo] = useState<OrderPrint | null>(null);
  const [isReceiptOpen, setReceiptOpen] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const { t } = useTranslation();
  const { user, branch } = useAuthContext();

  const statusLabels: Record<string, string> = {
    received: t.received,
    start_processing: t.startProcessing,
    processing: t.processing,
    ready: t.ready,
    handed_over: t.handedOver,
  };

  const paymentLabels: Record<string, string> = {
    cash: t.cash,
    card: t.card,
    pay_later: t.payLater,
  };

  const { data: orders = [], isLoading, error } = useQuery<OrderWithExtras[]>({
    queryKey: ["/api/orders", statusFilter, sortField, sortDirection],
    queryFn: async () => {
      const params = new URLSearchParams({
        sortBy: sortField,
        sortOrder: sortDirection,
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/orders?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(t.failedToFetchOrders);
      }
      const data: OrderWithExtras[] = await res.json();
      return data.filter((o) => !o.isDeliveryRequest);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, notify }: { orderId: string; status: string; notify: boolean }) => {
      const response = await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, notify });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t.success,
        description: t.orderStatusUpdated,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.failedToUpdateOrderStatus,
        variant: "destructive",
      });
    },
  });

  const apiError = useApiError(error);
  if (apiError) return apiError;

  const filteredOrders = orders.filter(order => {
    const matchesSearch = matchesOrderSearch(order, searchTerm);
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const matchesPayment = paymentFilter === 'all' || order.paymentMethod === paymentFilter;
    const matchesPayLaterOnly = !payLaterOnly || (order.paymentMethod === 'pay_later' && Number(order.balanceDue || 0) > 0);
    return matchesSearch && matchesStatus && matchesPayment && matchesPayLaterOnly;
  });

  const sortedOrders = sortOrders(filteredOrders, sortField, sortDirection);

  const handleStatusUpdate = (orderId: string, newStatus: string) => {
    updateStatusMutation.mutate({ orderId, status: newStatus, notify: notifyCustomer });
  };

  const handlePrintReceipt = async (order: Order) => {
    try {
      await apiRequest("GET", `/api/orders/${order.id}/prints`);
      const res = await apiRequest("POST", `/api/orders/${order.id}/print`);
      const record: OrderPrint = await res.json();
      setSelectedOrder(buildReceiptData(order, branch, user));
      setPrintInfo(record);
      setReceiptOpen(true);
    } catch (error) {
      toast({
        title: t.error,
        description: t.failedToRecordPrint,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <LoadingScreen message={t.loadingOrders} />;
  }

  return (
    <>
    <div className="h-full flex flex-col">
      <div className="p-6 flex-shrink-0 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t.orderTrackingTitle}</h2>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-blue-50">
            {orders.filter(o => o.status === 'received').length} {t.received}
          </Badge>
          <Badge variant="outline" className="bg-blue-50">
            {orders.filter(o => o.status === 'start_processing').length} {t.startProcessing}
          </Badge>
          <Badge variant="outline" className="bg-yellow-50">
            {orders.filter(o => o.status === 'processing').length} {t.inProgress}
          </Badge>
          <Badge variant="outline" className="bg-green-50">
            {orders.filter(o => o.status === 'ready').length} {t.ready}
          </Badge>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t.searchOrdersPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t.filterByStatus} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.allOrders}</SelectItem>
            <SelectItem value="received">{t.received}</SelectItem>
            <SelectItem value="start_processing">{t.startProcessing}</SelectItem>
            <SelectItem value="processing">{t.processing}</SelectItem>
            <SelectItem value="ready">{t.readyForPickup}</SelectItem>
            <SelectItem value="handed_over">{t.handedOver}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={`${sortField}-${sortDirection}`}
          onValueChange={(v) => {
            const [field, dir] = v.split("-");
            setSortField(field as "createdAt" | "balanceDue");
            setSortDirection(dir as "asc" | "desc");
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt-desc">Latest → Oldest</SelectItem>
            <SelectItem value="createdAt-asc">Oldest → Latest</SelectItem>
            <SelectItem value="balanceDue-desc">Highest balance → Lowest balance</SelectItem>
            <SelectItem value="balanceDue-asc">Lowest balance → Highest balance</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={(v) => setPaymentFilter(v as any)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="pay_later">Pay Later</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="payLaterOnly" checked={payLaterOnly} onCheckedChange={setPayLaterOnly} />
          <label htmlFor="payLaterOnly" className="text-sm">Pay Later outstanding</label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="notify" checked={notifyCustomer} onCheckedChange={setNotifyCustomer} />
          <label htmlFor="notify" className="text-sm">{t.notifyCustomer}</label>
        </div>
      </div>

      </div>
      
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="space-y-4">
        {sortedOrders.map((order) => {
          const StatusIcon = statusIcons[order.status as keyof typeof statusIcons];
          const items: OrderItem[] = Array.isArray(order.items)
            ? (order.items as OrderItem[])
            : [];
          
          return (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <StatusIcon className="w-5 h-5" />
                      {t.order} #{order.orderNumber}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {order.customerName} • {order.customerPhone}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[order.status as keyof typeof statusColors]}>
                      {statusLabels[order.status]}
                    </Badge>
                    {order.paymentMethod === 'pay_later' && (
                      <Badge variant="outline" className="text-red-600 border-red-200">
                        {t.payLater}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <h4 className="font-medium text-sm text-gray-700 mb-2">{t.items} ({items.length})</h4>
                    <div className="space-y-1">
                      {items.slice(0, 3).map((item, index) => (
                        <div key={index} className="text-sm flex justify-between">
                          <span>{item.quantity}x {typeof item.clothingItem === 'string' ? item.clothingItem : item.clothingItem?.name || t.item}</span>
                          <span className="text-gray-500">({typeof item.service === 'string' ? item.service : item.service?.name || t.service})</span>
                        </div>
                      ))}
                      {items.length > 3 && (
                        <div className="text-xs text-gray-500">+{items.length - 3} {t.moreItems}</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">{t.summary}</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>{t.total}:</span>
                        <span className="font-bold text-lg">{formatCurrency(order.total)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t.payment}:</span>
                        <span className="capitalize">{paymentLabels[order.paymentMethod]}</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{t.created}:</span>
                        <span>{format(new Date(order.createdAt), "MMM dd, HH:mm")}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {order.notes && (
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-1">{t.notes}</h4>
                    <p className="text-sm text-gray-600">{order.notes}</p>
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t">
                  <div className="flex items-center gap-2">
                    {order.promisedReadyDate && (
                      <Badge variant="outline" className="text-xs">
                        Ready By: {format(
                          new Date(order.promisedReadyDate),
                          "MMM dd",
                        )}
                      </Badge>
                    )}
                    {order.estimatedPickup && (
                      <Badge variant="outline" className="text-xs">
                        {t.pickup}: {format(new Date(order.estimatedPickup), "MMM dd")}
                      </Badge>
                    )}
                    {order.notes && (
                      <Badge variant="outline" className="text-xs">
                        {t.hasNotes}
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePrintReceipt(order)}
                    >
                      <Printer className="w-4 h-4 mr-1" /> {t.printReceipt}
                    </Button>
                    {order.paymentMethod === 'pay_later' && order.customerId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const defaultAmt = order.total;
                          const input = window.prompt(`Enter payment amount for order #${order.orderNumber}`, String(defaultAmt));
                          if (!input) return;
                          const amt = parseFloat(input);
                          if (!(amt > 0)) {
                            toast({ title: t.error, description: 'Invalid amount', variant: 'destructive' });
                            return;
                          }
                          try {
                            await apiRequest('POST', `/api/customers/${order.customerId}/payments`, {
                              amount: amt.toFixed(2),
                              paymentMethod: 'cash',
                              notes: `Payment for order ${order.orderNumber}`,
                              receivedBy: user?.username || 'System',
                            });
                            toast({ title: t.success, description: 'Payment recorded' });
                            queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
                          } catch (e) {
                            toast({ title: t.error, description: t.failedToRecordPayment, variant: 'destructive' });
                          }
                        }}
                      >
                        Record Payment
                      </Button>
                    )}
                    {(order.status === 'received' || order.status === 'start_processing') && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(order.id, 'processing')}
                        disabled={updateStatusMutation.isPending}
                      >
                        {t.startProcessing}
                      </Button>
                    )}
                    {order.status === 'processing' && (
                      <Button
                        size="sm"
                        onClick={() => handleStatusUpdate(order.id, 'ready')}
                        disabled={updateStatusMutation.isPending}
                      >
                        {t.markReady}
                      </Button>
                    )}
                    {order.status === 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusUpdate(order.id, 'handed_over')}
                        disabled={updateStatusMutation.isPending}
                      >
                        {t.markHandedOver}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {sortedOrders.length === 0 && (
          <EmptyState
            icon={<Package className="w-12 h-12 text-gray-400 mb-4" />}
            title={t.noOrdersFound}
            description={
              searchTerm || statusFilter !== "all"
                ? t.adjustSearchOrFilter
                : t.ordersWillAppearOncePlaced
            }
          />
        )}
        </div>
      </div>
    </div>
      {selectedOrder && printInfo && (
        <ReceiptModal
          order={selectedOrder}
          isOpen={isReceiptOpen}
          onClose={() => {
            setReceiptOpen(false);
            setSelectedOrder(null);
            setPrintInfo(null);
          }}
          printNumber={printInfo.printNumber}
          printedAt={printInfo.printedAt}
        />
      )}
    </>
  );
}
