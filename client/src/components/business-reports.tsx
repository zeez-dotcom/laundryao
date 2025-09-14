import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Transaction, Order, Customer, Payment } from "@shared/schema";
import { DollarSign, Users, Package, CreditCard } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useCurrency } from "@/lib/currency";
import { useAuthContext } from "@/context/AuthContext";
import jsPDF from "jspdf";
import ExcelJS from "exceljs";
import { useTranslation } from "@/lib/i18n";
import LoadingScreen from "@/components/common/LoadingScreen";
import EmptyState from "@/components/common/EmptyState";
import { useToast } from "@/hooks/use-toast";

type ReportPeriod = "today" | "week" | "month" | "all";

export function BusinessReports() {
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("today");
  const { formatCurrency } = useCurrency();
  const { branch } = useAuthContext();
  const { t } = useTranslation();
  const { toast } = useToast();

  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery<{
    transactions: Transaction[];
    orders: Order[];
    customers: Customer[];
    payments: Payment[];
    laundryServices: any[];
  }>({
    queryKey: ["/api/report/summary"],
  });

  const [streamConnected, setStreamConnected] = useState(true);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      es?.close();
      es = new EventSource("/api/report/summary/stream");
      es.onmessage = (e) => {
        setStreamConnected(true);
        const data = JSON.parse(e.data);
        queryClient.setQueryData(["/api/report/summary"], data);
      };
      es.onerror = () => {
        setStreamConnected(false);
        es?.close();
        toast({ description: "Live data connection lost. Reconnecting..." });
        if (navigator.onLine) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    const handleOnline = () => {
      reconnectTimer = setTimeout(connect, 0);
    };

    const handleOffline = () => {
      setStreamConnected(false);
      toast({ description: "Network connection lost. Waiting to reconnect..." });
    };

    connect();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [queryClient, toast]);

  const {
    transactions = [],
    orders = [],
    customers = [],
    payments = [],
    laundryServices = [],
  } = summary || {};

  const getDateRange = (period: ReportPeriod) => {
    const now = new Date();
    switch (period) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "week":
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "all":
        return { start: new Date(0), end: now };
    }
  };

  const filterByPeriod = (items: any[], dateField: string = "createdAt") => {
    if (reportPeriod === "all") return items;

    const { start, end } = getDateRange(reportPeriod);
    return items.filter(item => {
      const itemDate = new Date(item[dateField]);
      return itemDate >= start && itemDate <= end;
    });
  };
  const filterByBranch = (items: any[]) => {
    if (!branch?.id) return items;
    return items.filter(item => item.branchId === branch.id);
  };

  const filteredTransactions = filterByBranch(filterByPeriod(transactions));
  const filteredOrders = filterByBranch(filterByPeriod(orders));
  // Payments are already filtered by branch in the backend, only apply period filter
  const filteredPayments = filterByPeriod(payments);

  // Calculate metrics using only payments table to avoid double counting
  // Cash orders appear in both orders and payments tables, so we use payments as single source of truth
  const totalRevenue = filteredPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
  
  const totalOrders = filteredOrders.length;
  const completedOrders = filteredOrders.filter(o => o.status === 'handed_over').length;
  const pendingOrders = filteredOrders.filter(o => ['received', 'start_processing', 'processing'].includes(o.status)).length;
  const readyOrders = filteredOrders.filter(o => o.status === 'ready').length;

  const filteredCustomers = filterByBranch(customers);
  const totalOutstanding = filteredCustomers.reduce((sum, c) => sum + parseFloat(c.balanceDue), 0);
  const activeCustomers = filteredCustomers.filter(c => c.isActive).length;

  const handleExportPDF = () => {
    const { start, end } = getDateRange(reportPeriod);
    const doc = new jsPDF();
    doc.text(t.businessReport, 14, 16);
    doc.text(`${t.branch}: ${branch?.name || t.all}`, 14, 24);
    doc.text(`${t.period}: ${format(start, "MMM dd, yyyy")} - ${format(end, "MMM dd, yyyy")}`, 14, 32);
    const metrics = [
      [t.revenue, formatCurrency(totalRevenue)],
      [t.outstanding, formatCurrency(totalOutstanding)],
      [t.activeOrders, String(pendingOrders + readyOrders)],
      [t.completedOrders, String(completedOrders)],
      [t.totalOrders, String(totalOrders)],
    ];
    let y = 40;
    metrics.forEach(([label, value]) => {
      doc.text(`${label}: ${value}`, 14, y);
      y += 8;
    });
    doc.save("business_report.pdf");
  };

  const handleExportExcel = async () => {
    const { start, end } = getDateRange(reportPeriod);
    const data = [
      { metric: t.branch, value: branch?.name || t.all },
      {
        metric: t.period,
        value: `${format(start, "yyyy-MM-dd")} - ${format(end, "yyyy-MM-dd")}`,
      },
      { metric: t.revenue, value: totalRevenue },
      { metric: t.outstanding, value: totalOutstanding },
      { metric: t.activeOrders, value: pendingOrders + readyOrders },
      { metric: t.completedOrders, value: completedOrders },
      { metric: t.totalOrders, value: totalOrders },
    ];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Summary");
    worksheet.columns = [
      { header: "metric", key: "metric" },
      { header: "value", key: "value" },
    ];
    worksheet.addRows(data);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "business_report.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Payment method breakdown - use only payments table to avoid double counting
  const paymentMethodBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    
    // Use only payments table as single source of truth for revenue
    // This includes all payments: cash orders, card orders, package payments, etc.
    filteredPayments.forEach(payment => {
      breakdown[payment.paymentMethod] = 
        (breakdown[payment.paymentMethod] || 0) + parseFloat(payment.amount);
    });
    
    return breakdown;
  }, [filteredPayments]);

  // Service popularity (from orders) - improved data extraction
  const servicePopularity = useMemo(() => {
    return filteredOrders.reduce((acc, order) => {
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item: any) => {
        // Try multiple ways to get service name
        let serviceName = 'Unknown Service';

        if (typeof item.service === 'string') {
          serviceName = item.service;
        } else if (item.service?.name) {
          serviceName = item.service.name;
        } else if (item.serviceName) {
          serviceName = item.serviceName;
        } else if (item.serviceId && laundryServices.length > 0) {
          // Look up service by ID
          const service = laundryServices.find(s => s.id === item.serviceId);
          if (service) serviceName = service.name;
        } else if (item.name && item.name.includes('(') && item.name.includes(')')) {
          // Extract service from item name like "Shirt (Wash & Fold)"
          const match = item.name.match(/\(([^)]+)\)/);
          if (match) serviceName = match[1];
        }

        // Filter out "Unknown Service" entries for cleaner display
        if (serviceName !== 'Unknown Service') {
          acc[serviceName] = (acc[serviceName] || 0) + (item.quantity || 1);
        }
      });
      return acc;
    }, {} as Record<string, number>);
  }, [filteredOrders, laundryServices]);

  const topServices = useMemo(
    () =>
      Object.entries(servicePopularity)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5),
    [servicePopularity],
  );

  // Average order value based on actual revenue received
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  if (isLoading) {
    return <LoadingScreen message={t.loadingReports} />;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 flex-shrink-0">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">{t.businessReport}</h2>
          <div className="flex items-center gap-4">
            <Badge
              variant="outline"
              className={streamConnected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}
            >
              {streamConnected ? t.liveData : "Offline"}
            </Badge>
            <Select value={reportPeriod} onValueChange={(value: ReportPeriod) => setReportPeriod(value)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t.today}</SelectItem>
                <SelectItem value="week">{t.thisWeek}</SelectItem>
                <SelectItem value="month">{t.thisMonth}</SelectItem>
                <SelectItem value="all">{t.allTime}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              {t.exportPDF}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              {t.exportExcel}
            </Button>
          </div>
        </div>

        {/* Key Metrics - Streamlined */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t.revenue}</p>
                <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
                <p className="text-xs text-gray-500">{totalOrders} {t.orders.toLowerCase()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t.outstanding}</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</p>
              <p className="text-xs text-gray-500">{t.payLater}</p>
            </div>
            <CreditCard className="h-8 w-8 text-red-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t.activeOrders}</p>
              <p className="text-xl font-bold">{pendingOrders + readyOrders}</p>
              <p className="text-xs text-gray-500">{readyOrders} {t.ready.toLowerCase()}</p>
            </div>
            <Package className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{t.customers}</p>
              <p className="text-xl font-bold">{activeCustomers}</p>
              <p className="text-xs text-gray-500">{t.average}: {formatCurrency(avgOrderValue)}</p>
            </div>
            <Users className="h-8 w-8 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Streamlined Details Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Order Status */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">{t.orderStatus}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>{t.handedOver}</span>
              <Badge className="bg-green-100 text-green-800">{completedOrders}</Badge>
            </div>
            <div className="flex justify-between">
              <span>{t.ready}</span>
              <Badge className="bg-blue-100 text-blue-800">{readyOrders}</Badge>
            </div>
            <div className="flex justify-between">
              <span>{t.inProgress}</span>
              <Badge className="bg-yellow-100 text-yellow-800">{pendingOrders}</Badge>
            </div>
          </div>
        </Card>

        {/* Payment Methods */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">{t.paymentMethods}</h3>
          <div className="space-y-2 text-sm">
            {Object.entries(paymentMethodBreakdown).slice(0, 3).map(([method, amount]) => {
              const labels: Record<string, string> = {
                cash: t.cash,
                card: t.card,
                pay_later: t.payLater,
              };
              return (
                <div key={method} className="flex justify-between">
                  <span className="capitalize">{labels[method] || method.replace('_', ' ')}</span>
                  <span className="font-medium">{formatCurrency(amount as number)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Top Services */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">{t.popularServices}</h3>
          <div className="space-y-2 text-sm">
            {topServices.length > 0 ? (
              topServices.slice(0, 3).map(([service, count]) => (
                <div key={service} className="flex justify-between items-center">
                  <span className="truncate flex-1 pr-2">{service}</span>
                  <Badge variant="secondary" className="text-xs">{count as number} {t.orders.toLowerCase()}</Badge>
                </div>
              ))
            ) : (
              <EmptyState
                icon={<Package className="w-8 h-8 text-gray-300 mb-2" />}
                title={t.noServiceData}
                description={t.completeOrdersToSee}
                className="py-4"
                titleClassName="text-xs text-gray-500"
                descriptionClassName="text-xs text-gray-400"
              />
            )}
          </div>
        </Card>
      </div>
      </div>
    </div>
  );
}
