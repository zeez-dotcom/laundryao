import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, TrendingUp, DollarSign, Calendar, Download, Package as PackageIcon, FileDown, Info } from "lucide-react";
import SavedViewsBar from "@/components/SavedViewsBar";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Transaction } from "@shared/schema";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { OrderLogsTable } from "./order-logs-table";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import OrderDetailModal from "@/components/OrderDetailModal";
import { useCurrency } from "@/lib/currency";
import { useAuthContext } from "@/context/AuthContext";
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from "@/components/ui/select";
import { RecordPaymentDialog } from "@/components/record-payment-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import CashDrawerManager from "@/components/admin/CashDrawerManager";
import GlMappingsManager from "@/components/admin/GlMappingsManager";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type RevenueSummary = {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  daily: { date: string; orders: number; revenue: number }[];
};

type ServiceAggregate = {
  service: string;
  count: number;
  revenue: number;
};

type ClothingAggregate = {
  item: string;
  count: number;
  revenue: number;
};

type PaymentAggregate = {
  method: string;
  count: number;
  revenue: number;
};

type PayLaterReceipts = {
  totalReceipts: number;
  totalAmount: number;
  daily: { date: string; receipts: number; amount: number }[];
  details: {
    orderId: string | null;
    orderNumber: string | null;
    customerName: string | null;
    orderDate: string | null;
    paymentDate: string;
    paymentAmount: number;
    orderTotal: number | null;
    totalPaid: number | null;
    remaining: number | null;
    status: 'unpaid' | 'partial' | 'paid';
    orderStatus?: string | null;
    inShop?: boolean;
    previousBalance?: number | null;
    newBalance?: number | null;
  }[];
};

const EMPTY_RECEIPTS: PayLaterReceipts = {
  totalReceipts: 0,
  totalAmount: 0,
  daily: [],
  details: [],
};

const EMPTY_SUMMARY: RevenueSummary = {
  totalOrders: 0,
  totalRevenue: 0,
  averageOrderValue: 0,
  daily: [],
};

export function ReportsDashboard() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const { formatCurrency } = useCurrency();
  const { branch, isSuperAdmin } = useAuthContext();
  const [reportsBranchId, setReportsBranchId] = useState<string | undefined>(undefined);

  const [range, setRange] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');

  const startIso = dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined;
  const endIso = dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined;

  const buildRangeParams = () => {
    const params = new URLSearchParams();
    if (startIso) params.set("start", startIso);
    if (endIso) params.set("end", endIso);
    const effectiveBranchId = reportsBranchId || branch?.id;
    if (effectiveBranchId) params.set("branchId", effectiveBranchId);
    return params;
  };
  const rangeParamsStr = useMemo(() => buildRangeParams().toString(), [startIso, endIso, reportsBranchId, branch?.id]);

  const { data: cashflow } = useQuery<{ totals: { immediateOrders: number; payLaterReceipts: number; packagePurchases: number; all: number } } | undefined>({
    queryKey: ["/api/reports/cashflow-summary", rangeParamsStr],
    queryFn: async () => {
      const params = buildRangeParams();
      const url = params.size ? `/api/reports/cashflow-summary?${params.toString()}` : `/api/reports/cashflow-summary`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch cashflow summary");
      return res.json();
    },
  });

  const { data: summaryData } = useQuery<RevenueSummary>({
    queryKey: ["/api/reports/summary", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      const query = params.toString();
      const url = query ? `/api/reports/summary?${query}` : `/api/reports/summary`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return EMPTY_SUMMARY;
      }
      const json = await res.json();
      return {
        totalOrders: Number(json.totalOrders ?? 0),
        totalRevenue: Number(json.totalRevenue ?? 0),
        averageOrderValue: Number(json.averageOrderValue ?? 0),
        daily: Array.isArray(json.daily)
          ? json.daily.map((row: any) => ({
              date: String(row.date ?? ''),
              orders: Number(row.orders ?? 0),
              revenue: Number(row.revenue ?? 0),
            }))
          : [],
      } satisfies RevenueSummary;
    },
    keepPreviousData: true,
  });

  const summary = summaryData ?? EMPTY_SUMMARY;

  const { data: serviceResponse } = useQuery<{ services: ServiceAggregate[] }>({
    queryKey: ["/api/reports/service-breakdown", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      const query = params.toString();
      const url = query ? `/api/reports/service-breakdown?${query}` : `/api/reports/service-breakdown`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return { services: [] };
      }
      const json = await res.json();
      const services = Array.isArray(json.services)
        ? json.services.map((item: any) => ({
            service: String(item.service ?? 'Unknown Service'),
            count: Number(item.count ?? 0),
            revenue: Number(item.revenue ?? 0),
          }))
        : [];
      return { services };
    },
    keepPreviousData: true,
  });

  const { data: clothingResponse } = useQuery<{ items: ClothingAggregate[] }>({
    queryKey: ["/api/reports/clothing-breakdown", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      const query = params.toString();
      const url = query ? `/api/reports/clothing-breakdown?${query}` : `/api/reports/clothing-breakdown`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return { items: [] };
      }
      const json = await res.json();
      const items = Array.isArray(json.items)
        ? json.items.map((item: any) => ({
            item: String(item.item ?? 'Unknown Item'),
            count: Number(item.count ?? 0),
            revenue: Number(item.revenue ?? 0),
          }))
        : [];
      return { items };
    },
    keepPreviousData: true,
  });

  const { data: paymentResponse } = useQuery<{ methods: PaymentAggregate[] }>({
    queryKey: ["/api/reports/payment-methods", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      const query = params.toString();
      const url = query ? `/api/reports/payment-methods?${query}` : `/api/reports/payment-methods`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return { methods: [] };
      }
      const json = await res.json();
      const methods = Array.isArray(json.methods)
        ? json.methods.map((item: any) => ({
            method: String(item.method ?? 'unknown'),
            count: Number(item.count ?? 0),
            revenue: Number(item.revenue ?? 0),
          }))
        : [];
      return { methods };
    },
    keepPreviousData: true,
  });

  const { data: topPackages = [] } = useQuery<{ pkg: string; count: number; revenue: number }[]>({
    queryKey: ["/api/reports/top-packages", range],
    queryFn: async () => {
      const res = await fetch(`/api/reports/top-packages?range=${range}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return json.packages || [];
    },
  });

  const { data: recentTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions", "recent", startIso, endIso],
    queryFn: async () => {
      const params = buildRangeParams();
      params.set("limit", "50");
      const query = params.toString();
      const url = `/api/transactions?${query}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        return [];
      }
      return res.json();
    },
    keepPreviousData: true,
  });

  // Exceptions banner
  const { data: exceptions } = useQuery<any>({
    queryKey: ["/api/reports/exceptions", startIso, endIso, reportsBranchId || branch?.id],
    queryFn: async () => {
      const params = buildRangeParams();
      const res = await fetch(`/api/reports/exceptions?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    keepPreviousData: true,
  });

  // Pay-later receipts attributed to payment (receipt) date
  const { data: receiptsData } = useQuery<PayLaterReceipts>({
    queryKey: ["/api/reports/pay-later-receipts", startIso, endIso, reportsBranchId || branch?.id],
    queryFn: async () => {
      const params = buildRangeParams();
      const url = `/api/reports/pay-later-receipts?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return EMPTY_RECEIPTS;
      const json = await res.json();
      return {
        totalReceipts: Number(json.totalReceipts ?? 0),
        totalAmount: Number(json.totalAmount ?? 0),
        daily: Array.isArray(json.daily)
          ? json.daily.map((row: any) => ({
              date: String(row.date ?? ''),
              receipts: Number(row.receipts ?? 0),
              amount: Number(row.amount ?? 0),
            }))
          : [],
        details: Array.isArray(json.details)
          ? json.details.map((d: any) => ({
            orderId: d.orderId ?? null,
            orderNumber: d.orderNumber ?? null,
            customerName: d.customerName ?? null,
            customerId: d.customerId ?? null,
            orderDate: d.orderDate ?? null,
            paymentDate: d.paymentDate ?? '',
            paymentAmount: Number(d.paymentAmount ?? 0),
            orderTotal: d.orderTotal != null ? Number(d.orderTotal) : null,
            totalPaid: d.totalPaid != null ? Number(d.totalPaid) : null,
            remaining: d.remaining != null ? Number(d.remaining) : null,
            status: (d.status as any) ?? 'unpaid',
            orderStatus: d.orderStatus ?? null,
            inShop: Boolean(d.inShop),
            previousBalance: d.previousBalance != null ? Number(d.previousBalance) : null,
            newBalance: d.newBalance != null ? Number(d.newBalance) : null,
          }))
          : [],
      } as PayLaterReceipts;
    },
    keepPreviousData: true,
  });

  // Pay-later orders summarized by order-date (for comparison) 
  const { data: payLaterOrderDate } = useQuery<{ daily: { date: string; orders: number; revenue: number }[] }>({
    queryKey: ["/api/reports/pay-later-orders-by-date", startIso, endIso, reportsBranchId || branch?.id],
    queryFn: async () => {
      const params = buildRangeParams();
      const res = await fetch(`/api/reports/pay-later-orders-by-date?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return { daily: [] };
      const json = await res.json();
      return { daily: Array.isArray(json.daily) ? json.daily : [] };
    },
    keepPreviousData: true,
  });

  // Pay-later aging by customer
  type AgingResponse = {
    buckets: { b0_30: number; b31_60: number; b61_90: number; b90p: number };
    customers: {
      customerId: string;
      customerName: string | null;
      balance: number;
      b0_30: number;
      b31_60: number;
      b61_90: number;
      b90p: number;
      lastOrderDate: string | null;
      lastPaymentDate: string | null;
    }[];
  };
  const { data: aging } = useQuery<AgingResponse>({
    queryKey: ["/api/reports/pay-later-aging", startIso, endIso, reportsBranchId || branch?.id],
    queryFn: async () => {
      const params = buildRangeParams();
      const url = `/api/reports/pay-later-aging?${params.toString()}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return { buckets: { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 }, customers: [] };
      return res.json();
    },
    keepPreviousData: true,
  });

  // Financial report (cash sales, outstanding, receipts)
  type FinancialsResponse = {
    totals: { cashSales: number; cashOutstanding: number; cashReceived: number; cardReceived: number; expensesTotal?: number; netCash?: number };
    cashSales: { orderId: string; orderNumber: string; customerName: string | null; date: string; total: number }[];
    cashReceipts: { paymentId: string; amount: number; date: string; source: 'regular_order' | 'pay_later_receipt' | 'package_or_other'; orderId: string | null; orderNumber: string | null; customerName: string | null; customerId?: string | null }[];
    cardReceipts: { paymentId: string; amount: number; date: string; source: 'regular_order' | 'pay_later_receipt' | 'package_or_other'; orderId: string | null; orderNumber: string | null; customerName: string | null; customerId?: string | null }[];
  };
  const { data: financials } = useQuery<FinancialsResponse>({
    queryKey: ["/api/reports/financials", startIso, endIso, reportsBranchId || branch?.id],
    queryFn: async () => {
      const params = buildRangeParams();
      const res = await fetch(`/api/reports/financials?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return { totals: { cashSales: 0, cashOutstanding: 0, cashReceived: 0, cardReceived: 0 }, cashSales: [], cashReceipts: [], cardReceipts: [] };
      return res.json();
    },
    keepPreviousData: true,
  });

  // Financials filters + CSV helpers
  const [filterMethod, setFilterMethod] = useState<'all' | 'cash' | 'card'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'regular_order' | 'pay_later_receipt' | 'package_or_other'>('all');
  const cashAll = financials?.cashReceipts ?? [];
  const cardAll = financials?.cardReceipts ?? [];
  const matchSource = (s: string) => filterSource === 'all' || s === filterSource;
  const filteredCash = cashAll.filter((p) => (filterMethod === 'all' || filterMethod === 'cash') && matchSource(p.source));
  const filteredCard = cardAll.filter((p) => (filterMethod === 'all' || filterMethod === 'card') && matchSource(p.source));

  function exportReceiptsCsv(kind: 'cash' | 'card', rows: any[]) {
  const header = ["Date","Amount","Source","Channel","Order","Customer"];
  const data = rows.map((p) => [
    format(new Date(p.date), 'yyyy-MM-dd HH:mm'),
    String(p.amount),
    p.source,
    (p as any).channel || '',
    p.orderNumber ?? (p.orderId ? p.orderId.slice(-6) : ''),
    p.customerName ?? ''
  ]);
    const all = [header, ...data];
    const csv = all.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}-receipts-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCashSalesCsv(rows: any[]) {
    const header = ["Order #","Customer","Date","Total"];
    const data = rows.map((r) => [r.orderNumber ?? r.orderId?.slice(-6) ?? '', r.customerName ?? '', format(new Date(r.date), 'yyyy-MM-dd HH:mm'), String(r.total)]);
    const all = [header, ...data];
    const csv = all.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-sales-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportCashierCsv(rows: any[]) {
    const header = ["Cashier","Cash","Card","Total","Transactions"];
    const data = rows.map((r) => [r.name, String(r.cash), String(r.card), String(r.total), String(r.count)]);
    const all = [header, ...data];
    const csv = all.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashier-breakdown-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Cashier breakdown
  const cashierRows = (() => {
    const byCashier = new Map<string, { cash: number; card: number; count: number }>();
    for (const p of cashAll) {
      const name = (p as any).cashier || 'Unknown';
      const cur = byCashier.get(name) || { cash: 0, card: 0, count: 0 };
      cur.cash += Number(p.amount || 0);
      cur.count += 1;
      byCashier.set(name, cur);
    }
    for (const p of cardAll) {
      const name = (p as any).cashier || 'Unknown';
      const cur = byCashier.get(name) || { cash: 0, card: 0, count: 0 };
      cur.card += Number(p.amount || 0);
      cur.count += 1;
      byCashier.set(name, cur);
    }
    return Array.from(byCashier.entries()).map(([name, v]) => ({ name, cash: v.cash, card: v.card, total: v.cash + v.card, count: v.count }));
  })();

  const [receiptsView, setReceiptsView] = useState<'payment' | 'order'>('payment');
  const [showOutstandingOnly, setShowOutstandingOnly] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addCustomerId, setAddCustomerId] = useState<string | null>(null);
  const [addOrderId, setAddOrderId] = useState<string | null>(null);
  const [addDefaultAmount, setAddDefaultAmount] = useState<number | null>(null);

  // Super admin branch selector
  type Branch = { id: string; name: string };
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ["/api/branches", "reports"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/branches");
      return res.json();
    },
  });

  // Build combined overlay chart data for money values
  const overlay = (() => {
    const pay = receiptsData?.daily ?? [];
    const ord = payLaterOrderDate?.daily ?? [];
    const mapPay = new Map(pay.map((r) => [r.date, r.amount]));
    const mapOrd = new Map(ord.map((r) => [r.date, r.revenue]));
    const allDates = Array.from(new Set<string>([...mapPay.keys(), ...mapOrd.keys()])).sort();
    const pointsPay = allDates.map((d) => ({ date: d, value: mapPay.get(d) ?? 0 }));
    const pointsOrd = allDates.map((d) => ({ date: d, value: mapOrd.get(d) ?? 0 }));
    const maxVal = Math.max(1, ...pointsPay.map(p => p.value), ...pointsOrd.map(p => p.value));
    return { dates: allDates, pointsPay, pointsOrd, maxVal };
  })();

  const services = serviceResponse?.services ?? [];
  const clothing = clothingResponse?.items ?? [];
  const paymentMethods = paymentResponse?.methods ?? [];
  const totalRevenue = summary.totalRevenue;
  const totalOrders = summary.totalOrders;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const dailyRows = [...summary.daily].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  ).slice(0, 10);
  const recentTransactionsToShow = recentTransactions.slice(0, 20);

  const exportReport = async () => {
    try {
      const limit = 100;
      let offset = 0;
      const all: Transaction[] = [];

      while (true) {
        const params = buildRangeParams();
        params.set("limit", String(limit));
        params.set("offset", String(offset));
        const res = await fetch(`/api/transactions?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Failed to export transactions");
        }
        const batch: Transaction[] = await res.json();
        all.push(...batch);
        if (batch.length < limit) break;
        offset += limit;
      }

      const rows = [
        ["Date", "Order ID", "Items", "Subtotal", "Tax", "Total", "Payment Method"],
        ...all.map((t) => [
          format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm'),
          t.id.slice(-6),
          JSON.stringify(t.items),
          t.subtotal,
          t.tax,
          t.total,
          t.paymentMethod,
        ]),
        [],
        ["Item", "Quantity", "Revenue"],
        ...clothing.map((item) => [
          item.item,
          String(item.count),
          item.revenue.toFixed(2),
        ]),
      ];

      const csvContent = rows.map((row) => row.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `laundry-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export report", error);
    }
  };

  const exportReceipts = () => {
    try {
      const rows: string[][] = [
        ["Date", "Receipts", "Amount"],
        ...((receiptsData?.daily ?? []).map((r) => [
          r.date,
          String(r.receipts),
          String(r.amount),
        ])),
        [],
        ["Order #", "Customer", "Order Date", "Payment Date", "Paid Amount", "Order Total", "Total Paid", "Remaining", "Status"],
        ...((receiptsData?.details ?? []).map((d) => [
          d.orderNumber ?? (d.orderId ? d.orderId.slice(-6) : ''),
          d.customerName ?? '',
          d.orderDate ? format(new Date(d.orderDate), 'yyyy-MM-dd HH:mm') : '',
          d.paymentDate ? format(new Date(d.paymentDate), 'yyyy-MM-dd HH:mm') : '',
          String(d.paymentAmount),
          d.orderTotal != null ? String(d.orderTotal) : '',
          d.totalPaid != null ? String(d.totalPaid) : '',
          d.remaining != null ? String(d.remaining) : '',
          d.status,
        ])),
      ];
      const csvContent = rows.map((row) => row.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pay-later-receipts-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export receipts", error);
    }
  };

  return (
    <>
    <div className="full-bleed flex-1 p-6 bg-pos-background">
      <div className="w-full max-w-none">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <BarChart3 className="h-8 w-8 text-pos-primary" />
            <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          </div>

        <div className="flex items-center space-x-4">
            <SavedViewsBar
              pageId="reports-dashboard"
              current={{
                range,
                start: dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined,
                end: dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined,
                branchId: reportsBranchId || branch?.id,
              }}
              onApply={(v: any) => {
                if (v.range) setRange(v.range);
                const from = v.start ? new Date(v.start) : dateRange?.from;
                const to = v.end ? new Date(v.end) : dateRange?.to;
                setDateRange({ from, to } as any);
                if (v.branchId) setReportsBranchId(v.branchId);
              }}
              getName={(v: any) => {
                const s = (v.start || '').slice(0,10);
                const e = (v.end || '').slice(0,10);
                return `${v.range || 'daily'}-${s}-${e}`;
              }}
            />
            <DatePickerWithRange
              date={dateRange}
              onDateChange={setDateRange}
            />
            {isSuperAdmin && (
              <UiSelect value={reportsBranchId || branch?.id || undefined} onValueChange={(v) => setReportsBranchId(v)}>
                <UiSelectTrigger className="w-[200px]">
                  <UiSelectValue placeholder="All branches" />
                </UiSelectTrigger>
                <UiSelectContent>
                  {(branches as Branch[]).map((b) => (
                    <UiSelectItem key={b.id} value={b.id}>{b.name}</UiSelectItem>
                  ))}
                </UiSelectContent>
              </UiSelect>
            )}
            <Button onClick={() => { void exportReport(); }} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Cash Drawer Manager */}
        <div className="mb-6">
          <CashDrawerManager />
        </div>

        {/* GL Mappings */}
        <div className="mb-6">
          <GlMappingsManager />
        </div>

        {exceptions && (
          <div className="mb-6 p-4 border rounded bg-amber-50">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Exceptions</div>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-3 text-sm">
              <div>
                <div className="text-muted-foreground">Overpay Overrides</div>
                <div className="font-medium">{exceptions.overpayOverrides?.count ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Stale Pay-Later (&gt;{exceptions.stalePayLater?.thresholdDays} days)</div>
                <div className="font-medium">{exceptions.stalePayLater?.count ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Cancellation Spike</div>
                <div className="font-medium">{exceptions.cancellationSpike?.isSpike ? `Yes (${Math.round((exceptions.cancellationSpike.recentRate||0)*100)}% vs ${Math.round((exceptions.cancellationSpike.baselineRate||0)*100)}%)` : 'No'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div id="cash-sales" />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">
                From {totalOrders} orders
              </p>
            </CardContent>
          </Card>

          <div id="cash-receipts" />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalOrders}</div>
              <p className="text-xs text-muted-foreground">
                In selected period
              </p>
            </CardContent>
          </Card>

          <div id="card-receipts" />
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Order Value</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(averageOrderValue)}</div>
              <p className="text-xs text-muted-foreground">
                Per transaction
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Friendly guide to reduce overwhelm */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Report Guide</CardTitle>
            </div>
            <CardDescription className="mt-2">
              - Filters apply to all tabs: Branch and Date Range.
              <br />- Cashflow sums real money in: Immediate Orders (order date), Pay-Later Receipts (payment date), Package Purchases (payment date).
              <br />- Expand sections to view details without clutter.
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs defaultValue="services" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-10 gap-1">
            <TabsTrigger value="financials" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Financials</span>
              <span className="sm:hidden">Fin</span>
            </TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Expenses</span>
              <span className="sm:hidden">Exp</span>
            </TabsTrigger>
            <TabsTrigger value="services" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Services</span>
              <span className="sm:hidden">Svc</span>
            </TabsTrigger>
            <TabsTrigger value="items" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Clothing Items</span>
              <span className="sm:hidden">Items</span>
            </TabsTrigger>
            <TabsTrigger value="daily" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Daily Revenue</span>
              <span className="sm:hidden">Daily</span>
            </TabsTrigger>
            <TabsTrigger value="packages" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Packages</span>
              <span className="sm:hidden">Pkgs</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Payment Methods</span>
              <span className="sm:hidden">Pay</span>
            </TabsTrigger>
            <TabsTrigger value="transactions" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Recent Orders</span>
              <span className="sm:hidden">Orders</span>
            </TabsTrigger>
            <TabsTrigger value="orderLogs" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Order Logs</span>
              <span className="sm:hidden">Logs</span>
            </TabsTrigger>
            <TabsTrigger value="receipts" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Pay-Later Receipts</span>
              <span className="sm:hidden">Receipts</span>
            </TabsTrigger>
            <TabsTrigger value="aging" className="text-xs sm:text-sm">
              <span className="hidden sm:inline">Outstanding (Aging)</span>
              <span className="sm:hidden">Aging</span>
            </TabsTrigger>
        </TabsList>

        <TabsContent value="financials" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card className="cursor-pointer" onClick={() => { const el = document.getElementById('cash-sales'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Cash Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(financials?.totals.cashSales ?? 0)}</div>
                <p className="text-xs text-muted-foreground">Orders paid by cash</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer" onClick={() => { const el = document.getElementById('aging'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Cash Outstanding</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(financials?.totals.cashOutstanding ?? 0)}</div>
                <p className="text-xs text-muted-foreground">Pay-later remaining balance</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer" onClick={() => { const el = document.getElementById('cash-receipts'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Cash Received</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(financials?.totals.cashReceived ?? 0)}</div>
                <p className="text-xs text-muted-foreground">Payments table (cash)</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer" onClick={() => { const el = document.getElementById('card-receipts'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Card Received</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(financials?.totals.cardReceived ?? 0)}</div>
                <p className="text-xs text-muted-foreground">Payments table (card)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(financials?.totals.expensesTotal ?? 0)}</div>
                <p className="text-xs text-muted-foreground">In selected period</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Net (Cash − Expenses)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency((financials?.totals.cashReceived ?? 0) - (financials?.totals.expensesTotal ?? 0))}</div>
                <p className="text-xs text-muted-foreground">Cash received minus expenses</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Net (Cash+Card − Expenses)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(((financials?.totals.cashReceived ?? 0) + (financials?.totals.cardReceived ?? 0)) - (financials?.totals.expensesTotal ?? 0))}</div>
                <p className="text-xs text-muted-foreground">All receipts minus expenses</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium">Cashflow (In Range)</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      const rows = [["Date","Immediate Orders","Pay-Later Receipts","Package Purchases","Total"], ...(((cashflow as any)?.daily ?? []).map((r: any) => [r.date, String(r.immediateOrders), String(r.payLaterReceipts), String(r.packagePurchases), String(r.total)]))];
                      const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `cashflow-${Date.now()}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch {}
                  }}
                >
                  <FileDown className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(cashflow?.totals?.all ?? 0)}</div>
              <div className="text-xs text-muted-foreground mt-2">
                <div className="flex justify-between">
                  <span>Immediate Orders</span>
                  <span>{formatCurrency(cashflow?.totals?.immediateOrders ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pay-Later Receipts</span>
                  <span>{formatCurrency(cashflow?.totals?.payLaterReceipts ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Package Purchases</span>
                  <span>{formatCurrency(cashflow?.totals?.packagePurchases ?? 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters + CSV exports */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Filter receipts:</span>
              <UiSelect value={String(filterMethod)} onValueChange={(v) => setFilterMethod(v as any)}>
                <UiSelectTrigger className="w-[140px]"><UiSelectValue placeholder="Method" /></UiSelectTrigger>
                <UiSelectContent>
                  <UiSelectItem value="all">All methods</UiSelectItem>
                  <UiSelectItem value="cash">Cash</UiSelectItem>
                  <UiSelectItem value="card">Card</UiSelectItem>
                </UiSelectContent>
              </UiSelect>
              <UiSelect value={String(filterSource)} onValueChange={(v) => setFilterSource(v as any)}>
                <UiSelectTrigger className="w-[200px]"><UiSelectValue placeholder="Source" /></UiSelectTrigger>
                <UiSelectContent>
                  <UiSelectItem value="all">All sources</UiSelectItem>
                  <UiSelectItem value="regular_order">Regular orders</UiSelectItem>
                  <UiSelectItem value="pay_later_receipt">Pay-later receipts</UiSelectItem>
                  <UiSelectItem value="package_or_other">Packages/Other</UiSelectItem>
                </UiSelectContent>
              </UiSelect>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportReceiptsCsv('cash', filteredCash)}><FileDown className="h-4 w-4 mr-1" /> Cash CSV</Button>
              <Button variant="outline" size="sm" onClick={() => exportReceiptsCsv('card', filteredCard)}><FileDown className="h-4 w-4 mr-1" /> Card CSV</Button>
              <Button variant="outline" size="sm" onClick={() => exportCashSalesCsv(financials?.cashSales ?? [])}><FileDown className="h-4 w-4 mr-1" /> Sales CSV</Button>
              <Button variant="outline" size="sm" onClick={() => exportCashierCsv(cashierRows)}><FileDown className="h-4 w-4 mr-1" /> Cashier CSV</Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Cash Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr>
                      <th className="text-left p-2">Order #</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Date</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(financials?.cashSales ?? []).map((r) => (
                      <tr key={r.orderId} className="border-t">
                        <td className="p-2"><button className="text-blue-600 hover:underline" onClick={() => setLocation(`/orders/${r.orderId}`)}>{r.orderNumber}</button></td>
                        <td className="p-2">{r.customerName ?? ''}</td>
                        <td className="p-2">{format(new Date(r.date), 'MMM dd, yyyy HH:mm')}</td>
                        <td className="p-2 text-right">{formatCurrency(r.total)}</td>
                      </tr>
                    ))}
                    {((financials?.cashSales ?? []).length === 0) && (
                      <tr><td className="p-2" colSpan={4}>No cash sales in range</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cash Payments Received</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Channel</th>
                      <th className="text-left p-2">Cashier</th>
                      <th className="text-left p-2">Order</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCash.map((p) => (
                      <tr key={p.paymentId} className="border-t">
                        <td className="p-2">{format(new Date(p.date), 'MMM dd, yyyy HH:mm')}</td>
                        <td className="p-2 text-right">{formatCurrency(p.amount)}</td>
                        <td className="p-2 capitalize">{p.source.replaceAll('_',' ')}</td>
                        <td className="p-2 uppercase">{(p as any).channel || 'POS'}</td>
                        <td className="p-2">{p['cashier'] ?? '-'}</td>
                        <td className="p-2">{p.orderId ? <button className="text-blue-600 hover:underline" onClick={() => setLocation(`/orders/${p.orderId}`)}>{p.orderNumber ?? p.orderId.slice(-6)}</button> : '-'}</td>
                        <td className="p-2">{p.customerName ?? ''}</td>
                        <td className="p-2">
                          {p.customerId && (
                            <Button size="sm" variant="outline" onClick={() => { setAddCustomerId(p.customerId!); setAddOrderId(p.orderId ?? null); setAddDefaultAmount(undefined as any); setAddOpen(true); }}>Record Payment</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredCash.length === 0 && (
                      <tr><td className="p-2" colSpan={5}>No cash receipts in range</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Card Payments Received</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr>
                      <th className="text-left p-2">Date</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Channel</th>
                      <th className="text-left p-2">Cashier</th>
                      <th className="text-left p-2">Order</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCard.map((p) => (
                      <tr key={p.paymentId} className="border-t">
                        <td className="p-2">{format(new Date(p.date), 'MMM dd, yyyy HH:mm')}</td>
                        <td className="p-2 text-right">{formatCurrency(p.amount)}</td>
                        <td className="p-2 capitalize">{p.source.replaceAll('_',' ')}</td>
                        <td className="p-2 uppercase">{(p as any).channel || 'POS'}</td>
                        <td className="p-2">{p['cashier'] ?? '-'}</td>
                        <td className="p-2">{p.orderId ? <button className="text-blue-600 hover:underline" onClick={() => setLocation(`/orders/${p.orderId}`)}>{p.orderNumber ?? p.orderId.slice(-6)}</button> : '-'}</td>
                        <td className="p-2">{p.customerName ?? ''}</td>
                        <td className="p-2">
                          {p.customerId && (
                            <Button size="sm" variant="outline" onClick={() => { setAddCustomerId(p.customerId!); setAddOrderId(p.orderId ?? null); setAddDefaultAmount(undefined as any); setAddOpen(true); }}>Record Payment</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredCard.length === 0 && (
                      <tr><td className="p-2" colSpan={5}>No card receipts in range</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Cashier breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Cashier Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr>
                      <th className="text-left p-2">Cashier</th>
                      <th className="text-right p-2">Cash</th>
                      <th className="text-right p-2">Card</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-right p-2">Transactions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashierRows.map((r) => (
                      <tr key={r.name} className="border-t">
                        <td className="p-2">{r.name}</td>
                        <td className="p-2 text-right">{formatCurrency(r.cash)}</td>
                        <td className="p-2 text-right">{formatCurrency(r.card)}</td>
                        <td className="p-2 text-right">{formatCurrency(r.total)}</td>
                        <td className="p-2 text-right">{r.count}</td>
                      </tr>
                    ))}
                    {cashierRows.length === 0 && (
                      <tr><td className="p-2" colSpan={5}>No receipts in range</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <ExpensesTab startIso={startIso} endIso={endIso} branchId={reportsBranchId || branch?.id} />
        </TabsContent>

          <TabsContent value="services" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Service Performance</CardTitle>
                <CardDescription>Revenue and volume, resolved for pay-later receipts.</CardDescription>
              </CardHeader>
              <CardContent>
                {services.length === 0 ? (
                  <div className="text-sm text-gray-500">No service data found for the selected period.</div>
                ) : (
                  <div className="space-y-4">
                    {services.map((service) => (
                      <div key={service.service} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{service.service}</h3>
                          <p className="text-sm text-gray-600">{service.count} items processed</p>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">{formatCurrency(service.revenue)}</div>
                          <div className="text-sm text-gray-600">
                            {formatCurrency(service.count ? service.revenue / service.count : 0)} avg
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="packages" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle>Top Packages</CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>Based on package purchase payments within range.</TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <PackageIcon className="h-4 w-4 text-muted-foreground" />
                  <Select value={range} onValueChange={(v) => setRange(v as any)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {topPackages.length === 0 ? (
                  <div className="text-sm text-gray-500">No package sales found for the selected period.</div>
                ) : (
                  <div className="space-y-3">
                    {topPackages.map((p) => (
                      <div key={p.pkg} className="flex items-center justify-between p-3 border rounded">
                        <div>
                          <div className="font-medium">{p.pkg}</div>
                          <div className="text-xs text-gray-600">{p.count} sold</div>
                        </div>
                        <div className="font-bold">{formatCurrency(p.revenue)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle>Assigned Packages</CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>Packages assigned to customers, with used and remaining credits.</TooltipContent>
                  </Tooltip>
                </div>
                <AssignedPackagesExportButton branchId={reportsBranchId || branch?.id} />
              </CardHeader>
              <CardContent>
                <AssignedPackagesTable branchId={reportsBranchId || branch?.id} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="items" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Clothing Item Performance</CardTitle>
                <CardDescription>Combined from orders and receipts according to attribution rules.</CardDescription>
              </CardHeader>
              <CardContent>
                {clothing.length === 0 ? (
                  <div className="text-sm text-gray-500">No clothing item data found for the selected period.</div>
                ) : (
                  <div className="space-y-4">
                    {clothing.map((item) => (
                      <div key={item.item} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{item.item}</h3>
                          <p className="text-sm text-gray-600">{item.count} items processed</p>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-lg">{formatCurrency(item.revenue)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="daily" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Daily Revenue Breakdown</CardTitle>
                <CardDescription>Orders by order date; pay-later revenue resolved by receipts.</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyRows.length === 0 ? (
                  <div className="text-sm text-gray-500">No revenue recorded for the selected period.</div>
                ) : (
                  <div className="space-y-2">
                    {dailyRows.map((row) => (
                      <div key={row.date} className="flex items-center justify-between p-3 border rounded">
                        <span className="font-medium">
                          {format(new Date(row.date), 'MMM dd, yyyy')}
                        </span>
                        <span className="font-bold">{formatCurrency(row.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Analytics</CardTitle>
                <CardDescription>Breakdown of revenue by payment method in range.</CardDescription>
              </CardHeader>
              <CardContent>
                {paymentMethods.length === 0 ? (
                  <div className="text-sm text-gray-500">No payments recorded for the selected period.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {paymentMethods.map((method) => (
                      <div key={method.method} className="p-4 border rounded-lg">
                        <h3 className="font-medium capitalize mb-2">{method.method} Payments</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Orders:</span>
                            <span className="font-medium">{method.count}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Total:</span>
                            <span className="font-bold">{formatCurrency(method.revenue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Average:</span>
                            <span className="font-medium">{formatCurrency(method.count ? method.revenue / method.count : 0)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Latest 20 in range. Expand to view.</CardDescription>
              </CardHeader>
              <CardContent>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm">Show recent transactions</Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    {recentTransactionsToShow.length === 0 ? (
                      <div className="text-sm text-gray-500">No transactions found for the selected period.</div>
                    ) : (
                      <div className="space-y-3">
                        {recentTransactionsToShow.map((transaction) => (
                          <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                              <div className="font-medium">Order #{transaction.id.slice(-6)}</div>
                              <div className="text-sm text-gray-600">
                                {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                              </div>
                              <div className="text-sm text-gray-600 capitalize">
                                {transaction.paymentMethod} • {transaction.sellerName}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-lg">{formatCurrency(transaction.total)}</div>
                              <div className="text-sm text-gray-600">
                                {((transaction.items as any[]) || []).length} items
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orderLogs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Order Logs</CardTitle>
                <CardDescription>Full activity history. Expand to view.</CardDescription>
              </CardHeader>
              <CardContent>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm">Show logs</Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <OrderLogsTable />
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          </TabsContent>

        {/* Pay-Later Receipts tab content */}
        <TabsContent value="receipts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Pay-Later Receipts by Payment Date{branch?.name ? ` — ${branch.name}` : ''}</CardTitle>
              <Button onClick={() => { exportReceipts(); }} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </CardHeader>
            <CardContent>
              {(!receiptsData || receiptsData.daily.length === 0) ? (
                <div className="text-sm text-gray-500">No receipts recorded for the selected period.</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 border rounded p-1">
                      <Button size="sm" variant={receiptsView === 'payment' ? 'default' : 'ghost'} onClick={() => setReceiptsView('payment')}>By Payment Date</Button>
                      <Button size="sm" variant={receiptsView === 'order' ? 'default' : 'ghost'} onClick={() => setReceiptsView('order')}>By Order Date</Button>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <label className="text-xs text-muted-foreground">Show outstanding only</label>
                      <input type="checkbox" checked={showOutstandingOnly} onChange={(e) => setShowOutstandingOnly(e.target.checked)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 border rounded">
                      <div className="text-xs text-muted-foreground">Total Receipts</div>
                      <div className="text-xl font-semibold">{receiptsData.totalReceipts}</div>
                    </div>
                    <div className="p-3 border rounded">
                      <div className="text-xs text-muted-foreground">Total Amount</div>
                      <div className="text-xl font-semibold">{formatCurrency(receiptsData.totalAmount)}</div>
                    </div>
                  </div>
                  {/* Overlay chart */}
                  <div className="p-3 border rounded">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-muted-foreground">Overlay: Receipts (Payment Date) vs Pay-Later (Order Date)</div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-4 bg-blue-600" /> Receipts</span>
                        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-4 bg-emerald-600" /> Orders</span>
                      </div>
                    </div>
                    <svg viewBox="0 0 600 160" className="w-full h-40">
                      <rect x="0" y="0" width="600" height="160" fill="transparent" />
                      {overlay.dates.length > 1 && (
                        <>
                          {/* Receipts line */}
                          <polyline
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="2"
                            points={overlay.pointsPay.map((p, i) => {
                              const x = (i / (overlay.pointsPay.length - 1)) * 580 + 10;
                              const y = 150 - (p.value / overlay.maxVal) * 140;
                              return `${x},${y}`;
                            }).join(' ')}
                          />
                          {/* Orders line */}
                          <polyline
                            fill="none"
                            stroke="#059669"
                            strokeWidth="2"
                            points={overlay.pointsOrd.map((p, i) => {
                              const x = (i / (overlay.pointsOrd.length - 1)) * 580 + 10;
                              const y = 150 - (p.value / overlay.maxVal) * 140;
                              return `${x},${y}`;
                            }).join(' ')}
                          />
                        </>
                      )}
                    </svg>
                  </div>

                  <div className="space-y-2">
                    {(receiptsView === 'payment' ? receiptsData.daily : (payLaterOrderDate?.daily ?? [])).map((row: any) => (
                      <div key={row.date} className="flex items-center justify-between p-3 border rounded">
                        <span className="font-medium">{format(new Date(row.date), 'MMM dd, yyyy')}</span>
                        {receiptsView === 'payment' ? (
                          <>
                            <span className="text-sm text-muted-foreground mr-3">{row.receipts} receipts</span>
                            <span className="font-bold">{formatCurrency(row.amount)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-sm text-muted-foreground mr-3">{row.orders} orders</span>
                            <span className="font-bold">{formatCurrency(row.revenue)}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">Receipt Details</div>
                      <Button variant="outline" size="sm" onClick={() => {
                        try {
                          const rows = [
                            [
                              "Order #","Customer","Order Date","Payment Date","Items Status","Paid Amount","Order Total","Total Paid","Remaining","Prev Balance","New Balance","Status"
                            ],
                            ...((receiptsData?.details ?? [])).map((d) => [
                              d.orderNumber ?? (d.orderId ? d.orderId.slice(-6) : ""),
                              d.customerName ?? "",
                              d.orderDate ? format(new Date(d.orderDate), 'yyyy-MM-dd HH:mm') : "",
                              format(new Date(d.paymentDate), 'yyyy-MM-dd HH:mm'),
                              d.inShop ? 'In shop' : 'Handed over',
                              String(d.paymentAmount),
                              d.orderTotal != null ? String(d.orderTotal) : "",
                              d.totalPaid != null ? String(d.totalPaid) : "",
                              d.remaining != null ? String(d.remaining) : "",
                              d.previousBalance != null ? String(d.previousBalance) : "",
                              d.newBalance != null ? String(d.newBalance) : "",
                              d.status,
                            ])
                          ];
                          const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
                          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `pay-later-receipts-${Date.now()}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        } catch {}
                      }}>
                        <FileDown className="h-4 w-4 mr-1" /> Export CSV
                      </Button>
                    </div>
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="mb-2">Show table</Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="overflow-x-auto border rounded">
                          <table className="min-w-full text-sm">
                        <thead className="bg-[var(--surface-muted)]">
                          <tr>
                            <th className="text-left p-2">Order #</th>
                            <th className="text-left p-2">Customer</th>
                            <th className="text-left p-2">Order Date</th>
                            <th className="text-left p-2">Payment Date</th>
                            <th className="text-left p-2">Items Status</th>
                            <th className="text-right p-2">Paid Amount</th>
                            <th className="text-right p-2">Order Total</th>
                            <th className="text-right p-2">Total Paid</th>
                            <th className="text-right p-2">Remaining</th>
                            <th className="text-right p-2">Prev Balance</th>
                            <th className="text-right p-2">New Balance</th>
                            <th className="text-left p-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {((receiptsData.details ?? []).filter((d) => showOutstandingOnly ? (d.status !== 'paid') : true)).map((d, idx) => (
                            <tr key={d.orderId ?? `${d.paymentDate}-${idx}`} className="border-t">
                              <td className="p-2">
                                {d.orderId ? (
                                  <button className="text-blue-600 hover:underline" onClick={() => setLocation(`/orders/${d.orderId}`)}>
                                    {d.orderNumber ?? d.orderId.slice(-6)}
                                  </button>
                                ) : (d.orderNumber ?? '')}
                              </td>
                              <td className="p-2">{d.customerName ?? ''}</td>
                              <td className="p-2">{d.orderDate ? format(new Date(d.orderDate), 'MMM dd, yyyy HH:mm') : ''}</td>
                              <td className="p-2">{format(new Date(d.paymentDate), 'MMM dd, yyyy HH:mm')}</td>
                              <td className="p-2">{d.inShop ? 'In shop' : 'Handed over'}</td>
                              <td className="p-2 text-right">{formatCurrency(d.paymentAmount)}</td>
                              <td className="p-2 text-right">{d.orderTotal != null ? formatCurrency(d.orderTotal) : '-'}</td>
                              <td className="p-2 text-right">{d.totalPaid != null ? formatCurrency(d.totalPaid) : '-'}</td>
                              <td className="p-2 text-right">{d.remaining != null ? formatCurrency(d.remaining) : '-'}</td>
                              <td className="p-2 text-right">{d.previousBalance != null ? formatCurrency(d.previousBalance) : '-'}</td>
                              <td className="p-2 text-right">{d.newBalance != null ? formatCurrency(d.newBalance) : '-'}</td>
                              <td className="p-2 capitalize">
                                {d.status}
                                {d.orderId && d.inShop && (d.remaining ?? 0) <= 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="ml-2"
                                    onClick={async () => {
                                      try {
                                        await apiRequest('PATCH', `/api/orders/${d.orderId}/status`, { status: 'handed_over' });
                                        // Invalidate relevant queries to refresh UI
                                        queryClient.invalidateQueries({ queryKey: ["/api/reports/pay-later-receipts"] });
                                        queryClient.invalidateQueries({ queryKey: ["/api/reports/pay-later-aging"] });
                                        queryClient.invalidateQueries({ queryKey: ["/api/reports/pay-later-outstanding-orders"] });
                                      } catch {}
                                    }}
                                  >
                                    Mark as collected
                                  </Button>
                                )}
                                {d.orderId && !d.inShop && (d.remaining ?? 0) <= 0 && d.orderStatus !== 'completed' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="ml-2"
                                    onClick={async () => {
                                      try {
                                        await apiRequest('PATCH', `/api/orders/${d.orderId}/status`, { status: 'completed' });
                                        queryClient.invalidateQueries({ queryKey: ["/api/reports/pay-later-receipts"] });
                                      } catch {}
                                    }}
                                  >
                                    Mark as completed
                                  </Button>
                                )}
                                {d.customerId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="ml-2"
                                    onClick={() => { setAddCustomerId(d.customerId!); setAddOrderId(d.orderId ?? null); setAddDefaultAmount(d.remaining ?? null); setAddOpen(true); }}
                                  >
                                    Add payment
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                          </table>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aging" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Outstanding by Customer (Aging)</CardTitle>
              <div className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground">
                  Totals — 0–30: {formatCurrency(aging?.buckets.b0_30 ?? 0)} · 31–60: {formatCurrency(aging?.buckets.b31_60 ?? 0)} · 61–90: {formatCurrency(aging?.buckets.b61_90 ?? 0)} · 90+: {formatCurrency(aging?.buckets.b90p ?? 0)}
                </div>
                <Button variant="outline" size="sm" onClick={() => {
                  try {
                    const rows = [
                      ["Customer","Balance","0-30","31-60","61-90","90+","Last Order","Last Payment"],
                      ...((aging?.customers ?? [])).map((c) => [
                        c.customerName ?? c.customerId,
                        String(c.balance),
                        String(c.b0_30),
                        String(c.b31_60),
                        String(c.b61_90),
                        String(c.b90p),
                        c.lastOrderDate ? format(new Date(c.lastOrderDate), 'yyyy-MM-dd') : "",
                        c.lastPaymentDate ? format(new Date(c.lastPaymentDate), 'yyyy-MM-dd') : "",
                      ])
                    ];
                    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `pay-later-aging-${Date.now()}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch {}
                }}>
                  <FileDown className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--surface-muted)]">
                    <tr>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-right p-2">Balance</th>
                      <th className="text-right p-2">0–30</th>
                      <th className="text-right p-2">31–60</th>
                      <th className="text-right p-2">61–90</th>
                      <th className="text-right p-2">90+</th>
                      <th className="text-left p-2">Last Order</th>
                      <th className="text-left p-2">Last Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(aging?.customers ?? []).map((c) => (
                      <tr key={c.customerId} className="border-t">
                        <td className="p-2">{c.customerName ?? c.customerId.slice(-6)}</td>
                        <td className="p-2 text-right">{formatCurrency(c.balance)}</td>
                        <td className="p-2 text-right">{formatCurrency(c.b0_30)}</td>
                        <td className="p-2 text-right">{formatCurrency(c.b31_60)}</td>
                        <td className="p-2 text-right">{formatCurrency(c.b61_90)}</td>
                        <td className="p-2 text-right">{formatCurrency(c.b90p)}</td>
                        <td className="p-2">{c.lastOrderDate ? format(new Date(c.lastOrderDate), 'MMM dd, yyyy') : '-'}</td>
                        <td className="p-2">{c.lastPaymentDate ? format(new Date(c.lastPaymentDate), 'MMM dd, yyyy') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Outstanding by Order</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const params = buildRangeParams();
                    const res = await fetch(`/api/reports/pay-later-outstanding-orders?${params.toString()}`, { credentials: 'include' });
                    if (!res.ok) return;
                    const json = await res.json();
                    const rows = [["Order #","Customer","Created","Remaining","Order Total","Total Paid","Age (days)","Status","Items Status"], ...json.orders.map((o: any) => [
                      o.orderNumber,
                      o.customerName ?? '',
                      o.createdAt ? format(new Date(o.createdAt), 'yyyy-MM-dd HH:mm') : '',
                      String(o.remaining),
                      String(o.orderTotal),
                      String(o.totalPaid),
                      String(o.ageDays),
                      o.status,
                      o.inShop ? 'In shop' : 'Handed over',
                    ])];
                    const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `pay-later-outstanding-orders-${Date.now()}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch {}
                }}>
                  <FileDown className="h-4 w-4 mr-1" /> Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <OutstandingOrdersTable
                rangeParams={rangeParamsStr}
                onOpenDetail={(id: string) => { setDetailOrderId(id); setDetailOpen(true); }}
                onRecordPayment={(customerId: string, orderId: string, defaultAmount?: number) => {
                  setAddCustomerId(customerId);
                  setAddOrderId(orderId);
                  setAddDefaultAmount(defaultAmount ?? null);
                  setAddOpen(true);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
      </div>
    </div>
    <RecordPaymentDialog
      open={addOpen}
      onOpenChange={(v) => setAddOpen(v)}
      customerId={addCustomerId || ''}
      defaultAmount={addDefaultAmount ?? undefined}
      orderId={addOrderId ?? undefined}
      onSuccess={() => {
        queryClient.invalidateQueries({ queryKey: ["/api/reports/pay-later-receipts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reports/pay-later-aging"] });
        queryClient.invalidateQueries({ queryKey: ["/api/reports/pay-later-outstanding-orders"] });
      }}
    />
    <OrderDetailModal orderId={detailOrderId} isOpen={detailOpen} onClose={() => setDetailOpen(false)} />
    </>
  );
}

function AssignedPackagesTable({ branchId }: { branchId?: string }) {
  const { data, isLoading } = useQuery<{ assignments: Array<{ id: string; packageName: string; customerName: string; customerPhone: string | null; startsAt: string; expiresAt: string | null; balance: number; totalCredits: number; }> }>({
    queryKey: ["/api/reports/package-assignments", branchId],
    queryFn: async () => {
      const url = `/api/reports/package-assignments`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load package assignments");
      return await res.json();
    },
  });

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading assignments…</div>;
  }
  const rows = data?.assignments || [];
  if (rows.length === 0) {
    return <div className="text-sm text-gray-500">No assigned packages found.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--surface-muted)]">
          <tr>
            <th className="text-left p-2">Package</th>
            <th className="text-left p-2">Customer</th>
            <th className="text-left p-2">Phone</th>
            <th className="text-left p-2">Purchased</th>
            <th className="text-left p-2">Expires</th>
            <th className="text-right p-2">Used</th>
            <th className="text-right p-2">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const used = Math.max((r.totalCredits || 0) - (r.balance || 0), 0);
            return (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.packageName}</td>
                <td className="p-2">{r.customerName}</td>
                <td className="p-2">{r.customerPhone || "—"}</td>
                <td className="p-2">{r.startsAt ? format(new Date(r.startsAt), "MMM dd, yyyy") : "—"}</td>
                <td className="p-2">{r.expiresAt ? format(new Date(r.expiresAt), "MMM dd, yyyy") : "—"}</td>
                <td className="p-2 text-right">{used}</td>
                <td className="p-2 text-right">{r.balance}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssignedPackagesExportButton({ branchId }: { branchId?: string }) {
  const { data } = useQuery<{ assignments: Array<{ id: string; packageName: string; customerName: string; customerPhone: string | null; startsAt: string; expiresAt: string | null; balance: number; totalCredits: number; }> }>({
    queryKey: ["/api/reports/package-assignments", branchId, "export"],
    queryFn: async () => {
      const res = await fetch(`/api/reports/package-assignments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load package assignments");
      return await res.json();
    },
  });

  const rows = data?.assignments || [];
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        try {
          const csvRows = [["Package","Customer","Phone","Purchased","Expires","Used","Remaining"], ...rows.map((r) => [
            r.packageName,
            r.customerName,
            r.customerPhone || "",
            r.startsAt ? format(new Date(r.startsAt), 'yyyy-MM-dd') : '',
            r.expiresAt ? format(new Date(r.expiresAt), 'yyyy-MM-dd') : '',
            String(Math.max((r.totalCredits || 0) - (r.balance || 0), 0)),
            String(r.balance || 0),
          ])];
          const csv = csvRows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `assigned-packages-${Date.now()}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch {}
      }}
    >
      <FileDown className="h-4 w-4 mr-1" /> Export CSV
    </Button>
  );
}

function OutstandingOrdersTable({ rangeParams, onOpenDetail, onRecordPayment }: { rangeParams: string; onOpenDetail: (id: string) => void; onRecordPayment: (customerId: string, orderId: string, defaultAmount?: number) => void }) {
  const { formatCurrency } = useCurrency();
  const { data, isLoading } = useQuery<{ orders: any[] }>({
    queryKey: ["/api/reports/pay-later-outstanding-orders", rangeParams],
    queryFn: async () => {
      const res = await fetch(`/api/reports/pay-later-outstanding-orders?${rangeParams}`, { credentials: 'include' });
      if (!res.ok) return { orders: [] };
      return res.json();
    },
    keepPreviousData: true,
  });
  const rows = data?.orders ?? [];

  return (
    <div className="overflow-x-auto border rounded">
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--surface-muted)]">
          <tr>
            <th className="text-left p-2">Order #</th>
            <th className="text-left p-2">Customer</th>
            <th className="text-left p-2">Created</th>
            <th className="text-right p-2">Remaining</th>
            <th className="text-right p-2">Order Total</th>
            <th className="text-right p-2">Total Paid</th>
            <th className="text-right p-2">Age (days)</th>
            <th className="text-left p-2">Status</th>
            <th className="text-left p-2">Items Status</th>
            <th className="text-left p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td className="p-2" colSpan={9}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td className="p-2" colSpan={9}>No outstanding orders</td></tr>
          ) : rows.map((o: any) => (
            <tr key={o.orderId} className="border-top">
              <td className="p-2">
                <button className="text-blue-600 hover:underline" onClick={() => onOpenDetail(o.orderId)}>
                  {o.orderNumber ?? o.orderId.slice(-6)}
                </button>
              </td>
              <td className="p-2">{o.customerName ?? ''}</td>
              <td className="p-2">{o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</td>
              <td className="p-2 text-right">{formatCurrency(o.remaining)}</td>
              <td className="p-2 text-right">{formatCurrency(o.orderTotal)}</td>
              <td className="p-2 text-right">{formatCurrency(o.totalPaid)}</td>
              <td className="p-2 text-right">{o.ageDays}</td>
              <td className="p-2 capitalize">{o.status}</td>
              <td className="p-2">{o.inShop ? 'In shop' : 'Handed over'}</td>
              <td className="p-2">
                {o.customerId && (
                  <Button size="sm" variant="outline" onClick={() => onRecordPayment(o.customerId, o.orderId, o.remaining)}>Record Payment</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpensesTab({ startIso, endIso, branchId }: { startIso?: string; endIso?: string; branchId?: string }) {
  const { formatCurrency } = useCurrency();
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [incurredAt, setIncurredAt] = useState<string>("");
  const queryClient = useQueryClient();

  const params = new URLSearchParams();
  if (startIso) params.set("start", startIso);
  if (endIso) params.set("end", endIso);
  if (branchId) params.set("branchId", branchId);
  if (search) params.set("q", search);

  type Expense = { id: string; category: string; amount: string; notes?: string | null; incurredAt: string; createdBy: string };
  const { data, error } = useQuery<{ data: Expense[]; total: number } | Expense[]>({
    queryKey: ["/api/expenses", startIso, endIso, branchId, search],
    queryFn: async () => {
      const res = await fetch(`/api/expenses?${params.toString()}`, { credentials: 'include' });
      if (res.status === 403) return { data: [], total: 0 } as any; // feature disabled
      if (!res.ok) return { data: [], total: 0 } as any;
      return res.json();
    },
    keepPreviousData: true,
  });
  const list: Expense[] = Array.isArray(data) ? data : (data?.data ?? []);
  const total = list.reduce((acc, e) => acc + Number(e.amount || 0), 0);

  async function createExpense() {
    const amt = parseFloat(amount);
    if (!(amt > 0) || !category.trim()) return;
    await apiRequest('POST', '/api/expenses', {
      category: category.trim(),
      amount: amt.toFixed(2),
      notes: notes || undefined,
      incurredAt: incurredAt ? new Date(incurredAt).toISOString() : undefined,
      ...(branchId ? { branchId } : {}),
    });
    setOpen(false); setCategory(""); setAmount(""); setNotes(""); setIncurredAt("");
    queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/financials"] });
  }

  async function updateExpense() {
    if (!editing) return;
    const amt = parseFloat(amount);
    if (!(amt > 0) || !category.trim()) return;
    await apiRequest('PUT', `/api/expenses/${editing.id}`, {
      category: category.trim(),
      amount: amt.toFixed(2),
      notes: notes || undefined,
      incurredAt: incurredAt ? new Date(incurredAt).toISOString() : undefined,
    });
    setEditing(null); setOpen(false); setCategory(""); setAmount(""); setNotes(""); setIncurredAt("");
    queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/financials"] });
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  async function deleteExpense(id: string) {
    await apiRequest('DELETE', `/api/expenses/${id}`);
    queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports/financials"] });
  }

  function exportExpensesCsv(rows: any[]) {
    const header = ["Date","Category","Notes","Amount"];
    const data = rows.map((e) => [
      new Date(e.incurredAt).toISOString().replace('T',' ').slice(0,16),
      e.category,
      e.notes ?? '',
      String(e.amount)
    ]);
    const all = [header, ...data];
    const csv = all.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportExpensesByCategoryCsv(rows: Array<[string, number]>) {
    const header = ["Category","Total"];
    const data = rows.map(([cat, sum]) => [cat, String(sum)]);
    const all = [header, ...data];
    const csv = all.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expenses-by-category-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Input placeholder="Search expenses" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <div className="text-sm text-muted-foreground">Total in range: <span className="font-semibold">{formatCurrency(total)}</span></div>
        </div>
        <Button onClick={() => setOpen(true)}>Add Expense</Button>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--surface-muted)]">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Category</th>
              <th className="text-left p-2">Notes</th>
              <th className="text-right p-2">Amount</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{new Date(e.incurredAt).toLocaleString()}</td>
                <td className="p-2">{e.category}</td>
                <td className="p-2">{e.notes ?? ''}</td>
                <td className="p-2 text-right">{formatCurrency(Number(e.amount))}</td>
                <td className="p-2">
                  <Button size="sm" variant="outline" className="mr-2" onClick={() => { setEditing(e); setCategory(e.category); setAmount(String(e.amount)); setNotes(e.notes ?? ''); setIncurredAt(new Date(e.incurredAt).toISOString().slice(0,16)); setOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(e.id)}>Delete</Button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td className="p-2" colSpan={5}>No expenses found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="font-semibold">Expenses by Category</div>
            <Button variant="outline" size="sm" onClick={() => exportExpensesByCategoryCsv((() => {
              const m = new Map<string, number>();
              for (const e of list) {
                const key = e.category || 'Other';
                m.set(key, (m.get(key) || 0) + Number(e.amount || 0));
              }
              return Array.from(m.entries()).sort((a,b) => b[1] - a[1]);
            })())}>Export CSV</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
                <tr>
                  <th className="text-left p-2">Category</th>
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const m = new Map<string, number>();
                  for (const e of list) {
                    const key = e.category || 'Other';
                    m.set(key, (m.get(key) || 0) + Number(e.amount || 0));
                  }
                  const rows = Array.from(m.entries()).sort((a,b) => b[1] - a[1]);
                  if (rows.length === 0) {
                    return (<tr><td className="p-2" colSpan={2}>No data</td></tr>);
                  }
                  return rows.map(([cat, sum]) => (
                    <tr key={cat} className="border-t">
                      <td className="p-2">{cat}</td>
                      <td className="p-2 text-right">{formatCurrency(sum)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded shadow-lg w-[90%] max-w-md p-4">
            <div className="font-semibold text-lg mb-2">{editing ? 'Edit Expense' : 'Add Expense'}</div>
            <div className="grid gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Category</label>
                {categories.length > 0 ? (
                  <UiSelect value={category} onValueChange={(v) => setCategory(v)}>
                    <UiSelectTrigger className="w-full"><UiSelectValue placeholder="Select category or type" /></UiSelectTrigger>
                    <UiSelectContent>
                      {categories.map((name) => (
                        <UiSelectItem key={name} value={name}>{name}</UiSelectItem>
                      ))}
                    </UiSelectContent>
                  </UiSelect>
                ) : null}
                <Input className="mt-2" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., Rent, Utilities, Supplies" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Amount</label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Notes</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Date & time</label>
                <Input type="datetime-local" value={incurredAt} onChange={(e) => setIncurredAt(e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
                {editing ? (
                  <Button onClick={updateExpense}>Update</Button>
                ) : (
                  <Button onClick={createExpense}>Save</Button>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => exportExpensesCsv(list)}>Export CSV</Button>
            </div>
          </div>
        </div>
      )}
    </div>
    {/* Confirm delete */}
    <ConfirmDialog
      open={!!confirmDeleteId}
      onOpenChange={(v) => { if (!v) setConfirmDeleteId(null); }}
      title="Delete expense?"
      description="This action cannot be undone."
      confirmText="Delete"
      cancelText="Cancel"
      onConfirm={async () => { if (confirmDeleteId) { await deleteExpense(confirmDeleteId); setConfirmDeleteId(null); } }}
    />
    </>
  );
}
