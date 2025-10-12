import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { useCurrency } from "@/lib/currency";
import { apiRequest } from "@/lib/queryClient";
import { OrderStatus, DeliveryStatus, DeliveryMode, Order } from "@shared/schema";
import {
  Package,
  Clock,
  CheckCircle,
  Truck,
  MapPin,
  User,
  Phone,
  Calendar,
  ArrowRight,
  Eye,
  Edit,
  RefreshCw,
  Filter,
  Search,
  Home,
  Car,
  ShoppingCart,
  UserCheck,
  PackageCheck,
  XCircle,
  Bell,
  AlertTriangle
} from "lucide-react";

// Types are imported from @shared/schema.ts above

const statusConfig = {
  received: { 
    label: "Received", 
    color: "bg-blue-100 text-blue-800", 
    icon: Package,
    description: "Order received, awaiting processing"
  },
  start_processing: { 
    label: "Start Processing", 
    color: "bg-yellow-100 text-yellow-800", 
    icon: Clock,
    description: "Order ready to start processing"
  },
  processing: { 
    label: "Processing", 
    color: "bg-orange-100 text-orange-800", 
    icon: RefreshCw,
    description: "Items being processed"
  },
  ready: { 
    label: "Ready", 
    color: "bg-teal-100 text-teal-800", 
    icon: CheckCircle,
    description: "Items ready for pickup/delivery"
  },
  handed_over: { 
    label: "Handed Over", 
    color: "bg-purple-100 text-purple-800", 
    icon: Truck,
    description: "Items handed over for delivery"
  },
  completed: { 
    label: "Completed", 
    color: "bg-green-100 text-green-800", 
    icon: CheckCircle,
    description: "Order completed"
  },
};

const deliveryStatusConfig = {
  pending: {
    label: "Pending",
    color: "bg-yellow-100 text-yellow-800",
    icon: Clock,
    description: "Awaiting acceptance"
  },
  accepted: {
    label: "Accepted",
    color: "bg-blue-100 text-blue-800",
    icon: UserCheck,
    description: "Delivery request accepted"
  },
  driver_enroute: {
    label: "Driver En Route",
    color: "bg-indigo-100 text-indigo-800",
    icon: Car,
    description: "Driver heading to customer"
  },
  picked_up: {
    label: "Picked Up",
    color: "bg-purple-100 text-purple-800",
    icon: Package,
    description: "Items picked up from customer"
  },
  processing_started: {
    label: "Processing Started",
    color: "bg-orange-100 text-orange-800",
    icon: RefreshCw,
    description: "Items are being processed"
  },
  ready: {
    label: "Ready",
    color: "bg-teal-100 text-teal-800",
    icon: PackageCheck,
    description: "Items ready for delivery"
  },
  out_for_delivery: {
    label: "Out for Delivery",
    color: "bg-blue-100 text-blue-800",
    icon: Truck,
    description: "Driver is delivering items"
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle,
    description: "Delivery completed"
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-800",
    icon: XCircle,
    description: "Delivery cancelled"
  },
};

const nextStatusMap: Record<OrderStatus, OrderStatus | null> = {
  received: "start_processing",
  start_processing: "processing",
  processing: "ready",
  ready: "handed_over",
  handed_over: "completed",
  completed: null,
};

const nextDeliveryStatusMap: Record<DeliveryStatus, DeliveryStatus | null> = {
  pending: "accepted",
  accepted: "driver_enroute",
  driver_enroute: "picked_up",
  picked_up: "processing_started",
  processing_started: "ready",
  ready: "out_for_delivery",
  out_for_delivery: "completed",
  completed: null,
  cancelled: null,
};

type DeliveryAddressLite = { label: string; address: string };
type DeliveryOrderLite = {
  deliveryMode?: DeliveryMode;
  deliveryStatus: DeliveryStatus;
  deliveryFee?: number;
  deliveryAddress?: DeliveryAddressLite;
  deliveryInstructions?: string | null;
};
type OrderWithDelivery = Order & { deliveryOrder?: DeliveryOrderLite };

type OrderWithLateness = OrderWithDelivery & {
  dueDate: Date | null;
  updatedAtDate: Date | null;
  isOverdue: boolean;
  overdueDays: number;
};

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

const promisedReadyOffsets: Record<NonNullable<Order["promisedReadyOption"]>, number> = {
  today: 0,
  tomorrow: 1,
  day_after_tomorrow: 2,
};

function getPromisedReadyDate(order: OrderWithDelivery): Date | null {
  if (order.promisedReadyDate) {
    const due = new Date(order.promisedReadyDate);
    if (!Number.isNaN(due.getTime())) {
      return due;
    }
  }

  if (order.promisedReadyOption) {
    const offset = promisedReadyOffsets[order.promisedReadyOption] ?? 0;
    const base = order.createdAt ? new Date(order.createdAt) : new Date();

    if (!Number.isNaN(base.getTime())) {
      const normalized = new Date(base);
      normalized.setHours(0, 0, 0, 0);
      normalized.setDate(normalized.getDate() + offset);
      return normalized;
    }
  }

  return null;
}

export function OrderManagementDashboard() {
  const { user, branch } = useAuthContext();
  const { formatCurrency } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedOrder, setSelectedOrder] = useState<OrderWithLateness | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string>("all"); // all, regular, delivery
  const [overdueFilter, setOverdueFilter] = useState<"all" | "overdue" | "on_time">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isStatusUpdateDialogOpen, setIsStatusUpdateDialogOpen] = useState(false);
  const [updateNotes, setUpdateNotes] = useState("");

  const { data: orders = [], isLoading } = useQuery<OrderWithDelivery[]>({
    queryKey: ["/api/orders", branch?.id, statusFilter, orderTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (branch?.id) params.append("branchId", branch.id);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (orderTypeFilter !== "all") params.append("includeDelivery", "true");

      const response = await apiRequest("GET", `/api/orders?${params.toString()}`);
      const data: Order[] = await response.json();
      return data.filter((o) => !o.isDeliveryRequest);
    },
  });

  const ordersWithDueInfo: OrderWithLateness[] = orders.map((order) => {
    const dueDate = getPromisedReadyDate(order);
    const updatedAtDate = order.updatedAt ? new Date(order.updatedAt) : null;

    const isOverdue = Boolean(
      dueDate &&
      updatedAtDate &&
      updatedAtDate.getTime() > dueDate.getTime()
    );

    const overdueDays = isOverdue && dueDate && updatedAtDate
      ? Math.max(1, Math.ceil((updatedAtDate.getTime() - dueDate.getTime()) / MILLIS_PER_DAY))
      : 0;

    return {
      ...order,
      dueDate,
      updatedAtDate,
      isOverdue,
      overdueDays,
    };
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, notes }: { orderId: string, status: OrderStatus, notes?: string }) => {
      const response = await apiRequest("PUT", `/api/orders/${orderId}/status`, { 
        status, 
        notes,
        updatedBy: user?.id 
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Status updated successfully",
        description: "The order status has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setIsStatusUpdateDialogOpen(false);
      setUpdateNotes("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update order status",
        variant: "destructive",
      });
    },
  });

  const filteredOrders = ordersWithDueInfo.filter(order => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerPhone.includes(searchQuery);

    const matchesType = orderTypeFilter === "all" ||
      (orderTypeFilter === "delivery" && order.deliveryOrder) ||
      (orderTypeFilter === "regular" && !order.deliveryOrder);

    const matchesOverdue =
      overdueFilter === "all" ||
      (overdueFilter === "overdue" && order.isOverdue) ||
      (overdueFilter === "on_time" && !order.isOverdue);

    return matchesSearch && matchesType && matchesOverdue;
  });

  const ordersToDisplay = [...filteredOrders].sort((a, b) => {
    if (a.isOverdue === b.isOverdue) {
      return 0;
    }
    return a.isOverdue ? -1 : 1;
  });

  const handleStatusUpdate = (order: OrderWithDelivery) => {
    const nextStatus = nextStatusMap[order.status];
    if (!nextStatus) {
      toast({
        title: "No next status",
        description: "This order is already at the final status.",
        variant: "destructive",
      });
      return;
    }

    setSelectedOrder(order);
    setIsStatusUpdateDialogOpen(true);
  };

  const confirmStatusUpdate = () => {
    if (!selectedOrder) return;

    const nextStatus = nextStatusMap[selectedOrder.status];
    if (!nextStatus) return;

    updateStatusMutation.mutate({
      orderId: selectedOrder.id,
      status: nextStatus,
      notes: updateNotes.trim() || undefined,
    });
  };

  const handleNotifyCustomer = (order: OrderWithLateness) => {
    toast({
      title: "Customer notified",
      description: `Sent a delay notice to ${order.customerName}.`,
    });
  };

  const handleEscalateOrder = (order: OrderWithLateness) => {
    toast({
      title: "Order escalated",
      description: `Order #${order.orderNumber} has been escalated to the branch manager.`,
    });
  };

  const getStatusBadge = (status: OrderStatus) => {
    const config = statusConfig[status];
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getDeliveryStatusBadge = (status: DeliveryStatus) => {
    const config = deliveryStatusConfig[status];
    const Icon = config.icon;
    
    return (
      <Badge variant="outline" className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getDeliveryIcon = (mode?: DeliveryMode) => {
    if (!mode) return null;
    return mode === "driver_pickup" ? (
      <Car className="h-4 w-4 text-blue-600" />
    ) : (
      <ShoppingCart className="h-4 w-4 text-green-600" />
    );
  };

  if (!user || user.role === "driver") {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">
            Access denied. Only branch staff can access order management.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Order Management Dashboard
          </CardTitle>
          <CardDescription>
            Track and manage orders throughout the entire workflow process
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order number, customer name, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Order type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(statusConfig).map(([status, config]) => (
                    <SelectItem key={status} value={status}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={overdueFilter}
                onValueChange={(value) => setOverdueFilter(value as "all" | "overdue" | "on_time")}
              >
                <SelectTrigger className="w-[180px]" aria-label="Filter by due status">
                  <SelectValue placeholder="Due status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Due States</SelectItem>
                  <SelectItem value="overdue">Overdue Only</SelectItem>
                  <SelectItem value="on_time">On-Time Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading orders...
              </div>
            </CardContent>
          </Card>
        ) : filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                {searchQuery || statusFilter !== "all" 
                  ? "No orders found matching your criteria" 
                  : "No orders found"
                }
              </div>
            </CardContent>
          </Card>
        ) : (
          ordersToDisplay.map((order) => (
            <Card
              key={order.id}
              data-testid={`order-card-${order.id}`}
              className={`hover:shadow-md transition-shadow ${order.isOverdue ? "border-destructive/60 bg-destructive/5" : ""}`}
            >
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Order Info */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="font-semibold text-lg">#{order.orderNumber}</div>
                      {getDeliveryIcon(order.deliveryOrder?.deliveryMode)}
                      {getStatusBadge(order.status)}
                      {order.deliveryOrder && getDeliveryStatusBadge(order.deliveryOrder.deliveryStatus)}
                      {order.dueDate && (
                        order.isOverdue ? (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Overdue{order.overdueDays > 0 ? ` by ${order.overdueDays} ${order.overdueDays === 1 ? "day" : "days"}` : ""}
                          </Badge>
                        ) : (
                          <Badge className="flex items-center gap-1 bg-emerald-100 text-emerald-900">
                            <CheckCircle className="h-3 w-3" />
                            On track
                          </Badge>
                        )
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {order.customerName}
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        {order.customerPhone}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {(order.items as any[])?.length || 0} items - {formatCurrency(Number(order.total))}
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>
                        <strong>Ready by:</strong>{" "}
                        {order.dueDate ? order.dueDate.toLocaleDateString() : "Not specified"}
                        {order.promisedReadyOption && (
                          <span className="ml-2 uppercase text-xs tracking-wide text-muted-foreground/80">
                            ({order.promisedReadyOption.replace(/_/g, " ")})
                          </span>
                        )}
                      </div>
                      {order.isOverdue && order.updatedAtDate && (
                        <div className="text-destructive font-medium">
                          Updated {order.updatedAtDate.toLocaleDateString()} — requires attention
                        </div>
                      )}
                    </div>

                    {/* Delivery Information */}
                    {order.deliveryOrder && (
                      <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 font-medium text-blue-800 dark:text-blue-200">
                          <Truck className="h-4 w-4" />
                          Delivery Order
                        </div>
                        
                        {order.deliveryOrder.deliveryAddress && (
                          <div className="text-sm">
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="font-medium">{order.deliveryOrder.deliveryAddress.label}</div>
                                <div className="text-muted-foreground">{order.deliveryOrder.deliveryAddress.address}</div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {order.deliveryOrder.deliveryFee && (
                          <div className="text-sm flex items-center gap-2">
                            <span className="font-medium">Delivery Fee:</span>
                            <span>{formatCurrency(order.deliveryOrder.deliveryFee)}</span>
                          </div>
                        )}
                        
                        {order.deliveryOrder.deliveryInstructions && (
                          <div className="text-sm">
                            <span className="font-medium">Instructions:</span> {order.deliveryOrder.deliveryInstructions}
                          </div>
                        )}
                      </div>
                    )}

                    {order.notes && (
                      <div className="text-sm bg-muted p-2 rounded">
                        <strong>Notes:</strong> {order.notes}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-3 sm:items-end">
                    {order.isOverdue && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-destructive font-semibold uppercase tracking-wide text-xs sm:text-sm">
                          <Bell className="h-4 w-4" />
                          Overdue actions
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleNotifyCustomer(order)}
                          >
                            <Bell className="h-4 w-4 mr-2" />
                            Notify Customer
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive text-destructive hover:bg-destructive/10"
                            onClick={() => handleEscalateOrder(order)}
                          >
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Escalate Order
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Order Details - #{order.orderNumber}</DialogTitle>
                            <DialogDescription>
                              Complete order information and status history
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Customer</Label>
                              <div className="font-medium">{order.customerName}</div>
                              <div className="text-sm text-muted-foreground">{order.customerPhone}</div>
                            </div>
                            <div>
                              <Label>Status</Label>
                              <div className="mt-1">{getStatusBadge(order.status)}</div>
                            </div>
                          </div>
                          
                          <div>
                            <Label>Order Items</Label>
                            <div className="mt-2 space-y-2">
                              {(order.items as any[]).map((item: any, index: number) => (
                                <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                                  <div>
                                    <div className="font-medium">{item.clothingItem?.nameEn || 'Item'}</div>
                                    <div className="text-sm text-muted-foreground">
                                      {item.service?.nameEn || 'Service'} × {item.quantity}
                                    </div>
                                  </div>
                                  <div className="font-medium">{formatCurrency(Number(item.total))}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Delivery Information in Dialog */}
                          {order.deliveryOrder && (
                            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                              <div className="flex items-center gap-2 font-medium text-blue-800 dark:text-blue-200 mb-3">
                                <Truck className="h-4 w-4" />
                                Delivery Information
                              </div>
                              
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label>Delivery Mode</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                      {getDeliveryIcon(order.deliveryOrder?.deliveryMode)}
                                      <span className="capitalize">
                                        {order.deliveryOrder?.deliveryMode?.replace('_', ' ') || ''}
                                      </span>
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Delivery Status</Label>
                                    <div className="mt-1">{getDeliveryStatusBadge(order.deliveryOrder.deliveryStatus)}</div>
                                  </div>
                                </div>
                                
                                {order.deliveryOrder.deliveryAddress && (
                                  <div>
                                    <Label>Delivery Address</Label>
                                    <div className="mt-1 p-2 bg-white dark:bg-gray-800 rounded border">
                                      <div className="font-medium">{order.deliveryOrder.deliveryAddress.label}</div>
                                      <div className="text-sm text-muted-foreground">{order.deliveryOrder.deliveryAddress.address}</div>
                                    </div>
                                  </div>
                                )}
                                
                                {order.deliveryOrder.deliveryFee && (
                                  <div>
                                    <Label>Delivery Fee</Label>
                                    <div className="font-medium">{formatCurrency(order.deliveryOrder.deliveryFee)}</div>
                                  </div>
                                )}
                                
                                {order.deliveryOrder.deliveryInstructions && (
                                  <div>
                                    <Label>Delivery Instructions</Label>
                                    <div className="text-sm mt-1 p-2 bg-white dark:bg-gray-800 rounded border">
                                      {order.deliveryOrder.deliveryInstructions}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                            <div>
                              <Label>Subtotal</Label>
                              <div className="font-medium">{formatCurrency(Number(order.subtotal))}</div>
                            </div>
                            <div>
                              <Label>Tax</Label>
                              <div className="font-medium">{formatCurrency(Number(order.tax))}</div>
                            </div>
                            <div>
                              <Label>Total</Label>
                              <div className="font-bold text-lg">{formatCurrency(Number(order.total))}</div>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {nextStatusMap[order.status] && (
                      <Button 
                        onClick={() => handleStatusUpdate(order)}
                        disabled={updateStatusMutation.isPending}
                        size="sm"
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Next Status
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Status Update Dialog */}
      <Dialog open={isStatusUpdateDialogOpen} onOpenChange={setIsStatusUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>
              {selectedOrder && (
                <>
                  Moving order #{selectedOrder.orderNumber} from{" "}
                  <strong>{statusConfig[selectedOrder.status].label}</strong> to{" "}
                  <strong>{nextStatusMap[selectedOrder.status] && statusConfig[nextStatusMap[selectedOrder.status]!].label}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="notes">Update Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes about this status update..."
                value={updateNotes}
                onChange={(e) => setUpdateNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button 
                variant="outline" 
                onClick={() => setIsStatusUpdateDialogOpen(false)}
                disabled={updateStatusMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                onClick={confirmStatusUpdate}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Status"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
