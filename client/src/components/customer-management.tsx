import { useEffect, useState, useRef, useMemo, type CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Customer, InsertCustomer, Payment, InsertPayment, LoyaltyHistory, insertCustomerSchema } from "@shared/schema";
import { CitySelect } from "@/components/city-select";
import {
  Search,
  Plus,
  Phone,
  DollarSign,
  CreditCard,
  User,
  Calendar,
  UserX,
  Truck,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  BarChart3,
  AlertTriangle,
  Sparkles,
  Clock,
  MessageCircle,
  Mail,
  Send,
  Filter,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { useCurrency } from "@/lib/currency";
import { useAuthContext } from "@/context/AuthContext";
import { useTranslation } from "@/lib/i18n";
import LoadingScreen from "@/components/common/LoadingScreen";
import jsPDF from "jspdf";
import ExcelJS from "exceljs";
import { VariableSizeList as List } from "react-window";
import type { VariableSizeList as VariableSizeListType } from "react-window";

interface CustomerManagementProps {
  onCustomerSelect?: (customer: Customer) => void;
}

type CustomerWithCity = InsertCustomer & { city?: string };

interface CustomerFormFieldsProps {
  customer: CustomerWithCity;
  onChange: (value: CustomerWithCity) => void;
}

function CustomerFormFields({ customer, onChange }: CustomerFormFieldsProps) {
  const { t } = useTranslation();
  const { branch } = useAuthContext();

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="phone">{t.phoneNumber} *</Label>
        <Input
          id="phone"
          value={customer.phoneNumber}
          onChange={(e) => onChange({ ...customer, phoneNumber: e.target.value })}
          placeholder={t.phoneNumber}
        />
      </div>
      <div>
        <Label htmlFor="name">{t.name} *</Label>
        <Input
          id="name"
          value={customer.name}
          onChange={(e) => onChange({ ...customer, name: e.target.value })}
          placeholder={t.name}
        />
      </div>
      <div>
        <Label htmlFor="nickname">{t.nickname}</Label>
        <Input
          id="nickname"
          value={customer.nickname || ""}
          onChange={(e) => onChange({ ...customer, nickname: e.target.value })}
          placeholder={t.nickname}
        />
      </div>
      <div>
        <Label htmlFor="email">{t.emailAddress}</Label>
        <Input
          id="email"
          type="email"
          value={customer.email || ""}
          onChange={(e) => onChange({ ...customer, email: e.target.value })}
          placeholder={t.emailAddress}
        />
      </div>
      <div>
        <Label htmlFor="city">{t.city}</Label>
        <CitySelect
          value={customer.city || ""}
          onChange={(value) => onChange({ ...customer, city: value })}
          cityIds={(branch as any)?.serviceCityIds}
        />
      </div>
      <div>
        <Label htmlFor="address">{t.address}</Label>
        <Input
          id="address"
          value={customer.address || ""}
          onChange={(e) => onChange({ ...customer, address: e.target.value })}
          placeholder={t.address}
        />
      </div>
    </div>
  );
}

export function CustomerManagement({ onCustomerSelect }: CustomerManagementProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState<CustomerWithCity>({
    phoneNumber: "",
    name: "",
    email: "",
    address: "",
    nickname: "",
    city: "",
  });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editCustomerData, setEditCustomerData] = useState<CustomerWithCity>({
    phoneNumber: "",
    name: "",
    email: "",
    address: "",
    nickname: "",
    city: "",
  });
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportCustomer, setReportCustomer] = useState<Customer | null>(null);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const customerPageSize = 10;
  const [customerPage, setCustomerPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [loyaltyPage, setLoyaltyPage] = useState(1);
  const listRef = useRef<VariableSizeListType>(null);
  const rowHeights = useRef<Record<number, number>>({});
  const getRowHeight = (index: number) => rowHeights.current[index] || 260;
  const setRowHeight = (index: number, size: number) => {
    if (rowHeights.current[index] !== size) {
      rowHeights.current[index] = size;
      listRef.current?.resetAfterIndex(index);
    }
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatCurrency } = useCurrency();
  const { user, branch } = useAuthContext();
  const { t } = useTranslation();

  useEffect(() => {
    setCustomerPage(1);
  }, [searchTerm]);

  const { data: customerData = { data: [], total: 0 }, isLoading } = useQuery<Paginated<Customer>>({
    queryKey: ["/api/customers", searchTerm, branch?.id, customerPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.set("q", searchTerm);
      params.set("page", customerPage.toString());
      params.set("pageSize", customerPageSize.toString());
      const response = await fetch(`/api/customers?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch customers");
      return response.json();
    },
    placeholderData: keepPreviousData,
  });
  const customers = customerData.data;
  const totalCustomers = customerData.total;
  const totalPages = Math.max(1, Math.ceil(totalCustomers / customerPageSize));

  useEffect(() => {
    rowHeights.current = {};
    listRef.current?.resetAfterIndex(0);
  }, [customers]);

  const { data: selectedCustomerPayments = [] } = useQuery<Payment[]>({
    queryKey: ["/api/customers", selectedCustomer?.id, "payments"],
    enabled: !!selectedCustomer?.id,
  });

  interface Paginated<T> {
    data: T[];
    total: number;
  }

  interface CustomerOrder {
    id: string;
    orderNumber: string;
    createdAt: string;
    subtotal: string;
    paid: string;
    remaining: string;
  }

interface CustomerPackage {
  id: string;
  nameEn: string;
  nameAr: string | null;
  balance: number;
  totalCredits: number;
  startsAt: string;
  expiresAt: string | null;
}

interface CustomerInsightMonthly {
  month: string;
  total: number;
  orderCount: number;
}

interface CustomerInsightService {
  service: string;
  quantity: number;
  revenue: number;
}

interface CustomerInsightClothing {
  item: string;
  quantity: number;
  revenue: number;
}

type EngagementChannel = "sms" | "email";
type CustomerChurnTier = "no_orders" | "new" | "steady" | "loyal" | "at_risk" | "dormant";

interface CustomerInsightRecord {
  customerId: string;
  branchId: string;
  name: string;
  phoneNumber: string;
  loyaltyPoints: number;
  balanceDue: number;
  totalSpend: number;
  lastOrderDate: string | null;
  orderCount: number;
  averageOrderValue: number;
  churnTier: CustomerChurnTier;
  preferredServices: string[];
  recommendedAction: string | null;
  recommendedChannel: EngagementChannel | null;
  nextContactAt: string | null;
  lastActionAt: string | null;
  lastActionChannel: EngagementChannel | null;
  lastOutcome: string | null;
  planSource: "auto" | "manual";
  rateLimitedUntil: string | null;
  suggestedAction: string;
  suggestedChannel: EngagementChannel;
  suggestedNextContactAt: string | null;
  monthlySpend: CustomerInsightMonthly[];
  topServices: CustomerInsightService[];
  topClothing: CustomerInsightClothing[];
}

interface CustomerInsightResponse {
  items: CustomerInsightRecord[];
  total: number;
}

const DEFAULT_RATE_LIMIT_HOURS = 24;

const OUTREACH_TEMPLATES: Array<{
  id: string;
  label: string;
  channel: EngagementChannel;
  message: string;
  subject?: string;
}> = [
  {
    id: "winback",
    label: "Win-back SMS (7-day reminder)",
    channel: "sms",
    message: "Hi {name}, we miss you at LaundryAO! Enjoy 20% off your next order this week. Reply STOP to opt out.",
  },
  {
    id: "loyalty",
    label: "Loyalty appreciation email",
    channel: "email",
    subject: "Thank you for being part of LaundryAO Rewards",
    message:
      "Hi {name},<br />Thanks for trusting LaundryAO. Enjoy a complimentary stain treatment on your next pickup this month.",
  },
  {
    id: "seasonal",
    label: "Seasonal bundle email",
    channel: "email",
    subject: "Freshen up for the season with 15% off bundles",
    message:
      "Hi {name},<br />Keep your wardrobe ready for the season. Schedule a pickup this week and save 15% on bundle services.",
  },
];

type BulkSendPayload = {
  customerIds: string[];
  channel: EngagementChannel;
  message: string;
  subject?: string;
  templateKey?: string;
  rateLimitHours?: number;
  nextContactAt?: string | null;
};

  const { data: customerOrders = [] } = useQuery<CustomerOrder[]>({
    queryKey: ["/api/customers", reportCustomer?.id, "orders"],
    enabled: !!reportCustomer && isReportDialogOpen,
  });

  const { data: paymentHistory = [] } = useQuery<Payment[]>({
    queryKey: ["/api/customers", historyCustomer?.id, "payments"],
    enabled: !!historyCustomer?.id && isHistoryDialogOpen,
    queryFn: async () => {
      if (!historyCustomer) return [];
      const res = await fetch(`/api/customers/${historyCustomer.id}/payments`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch payment history");
      return res.json();
    },
  });

  const { data: orderHistory = [] } = useQuery<CustomerOrder[]>({
    queryKey: ["/api/customers", historyCustomer?.id, "orders-history"],
    enabled: !!historyCustomer?.id && isHistoryDialogOpen,
    queryFn: async () => {
      if (!historyCustomer) return [];
      const res = await fetch(`/api/customers/${historyCustomer.id}/orders`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch order history");
      return res.json();
    },
  });

  const { data: packageHistory = [], isLoading: packagesLoading } =
    useQuery<CustomerPackage[]>({
      queryKey: ["/api/customers", historyCustomer?.id, "packages"],
      enabled: !!historyCustomer?.id && isHistoryDialogOpen,
      queryFn: async () => {
        if (!historyCustomer) return [];
        const res = await fetch(
          `/api/customers/${historyCustomer.id}/packages`,
          {
            credentials: "include",
          },
        );
        if (!res.ok) throw new Error("Failed to fetch package history");
        return res.json();
      },
    });

  const { data: loyaltyHistory = [] } = useQuery<LoyaltyHistory[]>({
    queryKey: ["/api/customers", historyCustomer?.id, "loyalty"],
    enabled: !!historyCustomer?.id && isHistoryDialogOpen,
    queryFn: async () => {
      if (!historyCustomer) return [];
      const res = await fetch(`/api/customers/${historyCustomer.id}/loyalty-history`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch loyalty history");
      return res.json();
    },
  });

  const {
    data: insightsData,
    isFetching: insightsLoading,
  } = useQuery<CustomerInsightResponse>({
    queryKey: ["/api/reports/customer-insights", branch?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "25");
      if (branch?.id) {
        params.set("branchId", branch.id);
      }
      const response = await fetch(`/api/reports/customer-insights?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch customer insights");
      return response.json();
    },
  });

  const [churnFilter, setChurnFilter] = useState<"all" | CustomerChurnTier>("all");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkTemplate, setBulkTemplate] = useState<string>(OUTREACH_TEMPLATES[0]?.id ?? "winback");
  const [bulkChannel, setBulkChannel] = useState<EngagementChannel>(OUTREACH_TEMPLATES[0]?.channel ?? "sms");
  const [bulkMessage, setBulkMessage] = useState<string>(OUTREACH_TEMPLATES[0]?.message ?? "");
  const [bulkSubject, setBulkSubject] = useState<string>(OUTREACH_TEMPLATES[0]?.subject ?? "");
  const [bulkNextContact, setBulkNextContact] = useState<string>("");
  const [bulkRateLimitHours, setBulkRateLimitHours] = useState<number>(DEFAULT_RATE_LIMIT_HOURS);

  const templatesById = useMemo(
    () => new Map(OUTREACH_TEMPLATES.map((template) => [template.id, template])),
    [],
  );

  useEffect(() => {
    const template = templatesById.get(bulkTemplate);
    if (template) {
      setBulkChannel(template.channel);
      setBulkMessage(template.message);
      setBulkSubject(template.subject ?? "");
    }
  }, [bulkTemplate, templatesById]);

  useEffect(() => {
    setSelectedCustomerIds((prev) => {
      const available = new Set((insightsData?.items ?? []).map((insight) => insight.customerId));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (available.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [insightsData]);

  useEffect(() => {
    if (!isBulkDialogOpen) {
      setBulkNextContact("");
    }
  }, [isBulkDialogOpen]);

  const insights = insightsData?.items ?? [];
  const filteredInsights = useMemo(
    () => (churnFilter === "all" ? insights : insights.filter((item) => item.churnTier === churnFilter)),
    [insights, churnFilter],
  );
  const selectedCount = selectedCustomerIds.size;

  const addCustomerMutation = useMutation({
    mutationFn: async (customer: CustomerWithCity) => {
      const response = await apiRequest("POST", "/api/customers", customer as any);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t.success,
        description: t.customerAdded,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setIsAddDialogOpen(false);
      setNewCustomer({ phoneNumber: "", name: "", email: "", address: "", nickname: "", city: "" });
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.failedToAddCustomer,
        variant: "destructive",
      });
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (payment: InsertPayment) => {
      const { customerId, ...data } = payment;
      const response = await apiRequest(
        "POST",
        `/api/customers/${customerId}/payments`,
        data
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t.success,
        description: t.paymentRecorded,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", selectedCustomer?.id, "payments"] });
      setIsPaymentDialogOpen(false);
      setPaymentAmount("");
      setPaymentNotes("");
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.failedToRecordPayment,
        variant: "destructive",
      });
    },
  });

  const editCustomerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CustomerWithCity }) => {
      const response = await apiRequest("PATCH", `/api/customers/${id}`, data as any);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t.success,
        description: t.customerUpdated,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      if (editingCustomer) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", editingCustomer.id, "payments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/customers", editingCustomer.id, "orders"] });
      }
      setIsEditDialogOpen(false);
      setEditingCustomer(null);
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.failedToUpdateCustomer,
        variant: "destructive",
      });
    },
  });

  const deactivateCustomerMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/customers/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t.success,
        description: t.customerDeactivated,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.failedToDeactivateCustomer,
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const response = await apiRequest("PUT", `/api/customers/${id}/password`, {
        password,
        notify: true,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t.success,
        description: t.passwordReset,
      });
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.failedToResetPassword,
        variant: "destructive",
      });
    },
  });

  const bulkSendMutation = useMutation({
    mutationFn: async (payload: BulkSendPayload) => {
      const response = await apiRequest("POST", "/api/customer-insights/actions/bulk-send", payload);
      return response.json() as Promise<{
        results: { customerId: string; status: "sent" | "skipped" | "failed"; reason?: string }[];
      }>;
    },
    onSuccess: (data) => {
      const sent = data.results.filter((result) => result.status === "sent").length;
      const skipped = data.results.filter((result) => result.status === "skipped").length;
      const failed = data.results.filter((result) => result.status === "failed").length;
      toast({
        title: "Outreach processed",
        description: `Sent: ${sent}, Skipped: ${skipped}, Failed: ${failed}`,
      });
      setIsBulkDialogOpen(false);
      clearInsightSelection();
      queryClient.invalidateQueries({ queryKey: ["/api/reports/customer-insights", branch?.id] });
    },
    onError: (error: any) => {
      toast({
        title: t.error,
        description: error?.message || "Failed to queue outreach",
        variant: "destructive",
      });
    },
  });

  const handleResetPassword = (customer: Customer) => {
    const password = prompt(t.newPassword);
    if (!password) return;
    resetPasswordMutation.mutate({ id: customer.id, password });
  };

  const handleDeactivateCustomer = (id: string) => {
    if (confirm("Are you sure you want to deactivate this customer?")) {
      deactivateCustomerMutation.mutate(id);
    }
  };


  const handleAddCustomer = () => {
    if (!newCustomer.phoneNumber || !newCustomer.name) {
      toast({
        title: t.error,
        description: t.phoneAndNameRequired,
        variant: "destructive",
      });
      return;
    }
    const data = { ...newCustomer, nickname: newCustomer.nickname || undefined };
    addCustomerMutation.mutate(data);
  };

  const handleRecordPayment = () => {
    if (!selectedCustomer || !paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast({
        title: t.error,
        description: t.invalidPaymentAmount,
        variant: "destructive",
      });
      return;
    }

      recordPaymentMutation.mutate({
        customerId: selectedCustomer.id,
        amount: paymentAmount,
        paymentMethod,
        notes: paymentNotes,
        receivedBy: user?.username || "Unknown",
      });
    };

  const handleEditCustomer = () => {
    if (!editingCustomer) return;
    try {
      const { city, ...rest } = editCustomerData;
      const data = insertCustomerSchema.parse(rest);
      editCustomerMutation.mutate({ id: editingCustomer.id, data: { ...data, city } });
    } catch (error) {
      toast({
        title: t.error,
        description: t.invalidCustomerData,
        variant: "destructive",
      });
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text("Customer Due Amount Report", 14, 16);
    let y = 30;
    customerOrders.forEach((order) => {
      const row = [
        order.orderNumber,
        format(new Date(order.createdAt), "MMM dd, yyyy"),
        formatCurrency(Number(order.subtotal)),
        formatCurrency(Number(order.paid)),
        formatCurrency(Number(order.remaining)),
      ].join(" | ");
      doc.text(row, 14, y);
      y += 10;
    });
    doc.save("customer_due_report.pdf");
  };

  const handleExportExcel = async () => {
    const data = customerOrders.map((order) => ({
      orderNumber: order.orderNumber,
      date: format(new Date(order.createdAt), "yyyy-MM-dd"),
      subtotal: Number(order.subtotal),
      paid: Number(order.paid),
      remaining: Number(order.remaining),
    }));
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Report");
    worksheet.columns = [
      { header: "orderNumber", key: "orderNumber" },
      { header: "date", key: "date" },
      { header: "subtotal", key: "subtotal" },
      { header: "paid", key: "paid" },
      { header: "remaining", key: "remaining" },
    ];
    worksheet.addRows(data);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "customer_due_report.xlsx");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadCSV = (rows: any[], filename: string) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv =
      headers.join(",") +
      "\n" +
      rows
        .map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatMonthLabel = (month: string) => {
    try {
      const [year, mon] = month.split("-");
      if (!year || !mon) return month;
      const date = new Date(Number(year), Number(mon) - 1, 1);
      return format(date, "MMM yy");
    } catch (error) {
      return month;
    }
  };

  const toggleInsightSelection = (customerId: string, nextValue: boolean) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (nextValue) {
        next.add(customerId);
      } else {
        next.delete(customerId);
      }
      return next;
    });
  };

  const clearInsightSelection = () => {
    setSelectedCustomerIds(new Set());
  };

  const selectFilteredCustomers = () => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      filteredInsights.forEach((insight) => next.add(insight.customerId));
      return next;
    });
  };

  const formatOutcome = (outcome?: string | null) => {
    if (!outcome) return "";
    const [status, ...rest] = outcome.split(":");
    const detail = rest.join(":");
    const label =
      status === "sent" ? "Sent" : status === "skipped" ? "Skipped" : status === "failed" ? "Failed" : status;
    return detail ? `${label} (${detail})` : label;
  };

  const getChurnBadge = (tier: CustomerChurnTier) => {
    switch (tier) {
      case "loyal":
        return {
          label: "Loyalist",
          className: "border-emerald-200 bg-emerald-100 text-emerald-700",
          icon: <CheckCircle2 className="h-3 w-3" />,
        };
      case "steady":
        return {
          label: "Steady",
          className: "border-sky-200 bg-sky-100 text-sky-700",
          icon: <TrendingUp className="h-3 w-3" />,
        };
      case "at_risk":
        return {
          label: "At risk",
          className: "border-amber-200 bg-amber-100 text-amber-700",
          icon: <AlertTriangle className="h-3 w-3" />,
        };
      case "dormant":
        return {
          label: "Dormant",
          className: "border-rose-200 bg-rose-100 text-rose-700",
          icon: <TrendingDown className="h-3 w-3" />,
        };
      case "new":
        return {
          label: "New",
          className: "border-blue-200 bg-blue-100 text-blue-700",
          icon: <Sparkles className="h-3 w-3" />,
        };
      case "no_orders":
      default:
        return {
          label: "No orders yet",
          className: "border-slate-200 bg-slate-100 text-slate-700",
          icon: <Minus className="h-3 w-3" />,
        };
    }
  };

  const handleInsightsExportCSV = () => {
    if (!filteredInsights.length) return;
    const rows = filteredInsights.map((insight) => {
      const topServices = insight.topServices
        .slice(0, 3)
        .map((svc) => `${svc.service} (${svc.quantity})`)
        .join("; ");
      const topClothing = insight.topClothing
        .slice(0, 3)
        .map((item) => `${item.item} (${item.quantity})`)
        .join("; ");
      const nextContact = insight.nextContactAt
        ? format(new Date(insight.nextContactAt), "yyyy-MM-dd HH:mm")
        : insight.suggestedNextContactAt
        ? format(new Date(insight.suggestedNextContactAt), "yyyy-MM-dd HH:mm")
        : "";
      return {
        customer: insight.name,
        phone: insight.phoneNumber,
        churnTier: insight.churnTier,
        preferredServices: insight.preferredServices.join("; "),
        suggestedAction: insight.suggestedAction,
        planAction: insight.recommendedAction ?? "",
        planSource: insight.planSource,
        channel: (insight.recommendedChannel ?? insight.suggestedChannel).toUpperCase(),
        nextContact,
        lastOutcome: insight.lastOutcome ?? "",
        totalSpend: insight.totalSpend.toFixed(2),
        orderCount: insight.orderCount,
        averageOrderValue: insight.averageOrderValue.toFixed(2),
        lastOrder: insight.lastOrderDate ? format(new Date(insight.lastOrderDate), "yyyy-MM-dd") : "",
        loyaltyPoints: insight.loyaltyPoints,
        topServices,
        topClothing,
      };
    });
    downloadCSV(rows, "customer_insights.csv");
  };

  const handleBulkSend = () => {
    const ids = Array.from(selectedCustomerIds);
    if (!ids.length) {
      toast({
        title: t.error,
        description: "Select at least one customer",
        variant: "destructive",
      });
      return;
    }
    if (!bulkMessage.trim()) {
      toast({
        title: t.error,
        description: "Message cannot be empty",
        variant: "destructive",
      });
      return;
    }
    if (bulkChannel === "email" && !bulkSubject.trim()) {
      toast({
        title: t.error,
        description: "Email subject is required",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(bulkRateLimitHours) || bulkRateLimitHours < 1) {
      toast({
        title: t.error,
        description: "Rate limit hours must be at least 1",
        variant: "destructive",
      });
      return;
    }

    let nextContactValue: string | null | undefined;
    if (bulkNextContact) {
      const parsed = new Date(bulkNextContact);
      if (Number.isNaN(parsed.getTime())) {
        toast({
          title: t.error,
          description: "Invalid next contact date",
          variant: "destructive",
        });
        return;
      }
      nextContactValue = parsed.toISOString();
    } else if (bulkNextContact === "") {
      nextContactValue = undefined;
    }

    const payload: BulkSendPayload = {
      customerIds: ids,
      channel: bulkChannel,
      message: bulkMessage,
      templateKey: bulkTemplate,
      rateLimitHours: Math.max(1, Math.min(168, Math.round(bulkRateLimitHours))),
      nextContactAt: typeof nextContactValue === "undefined" ? undefined : nextContactValue,
    };

    if (bulkChannel === "email") {
      payload.subject = bulkSubject;
    }

    bulkSendMutation.mutate(payload);
  };

  const handlePaymentsExportPDF = async () => {
    if (!historyCustomer) return;
    const res = await fetch(`/api/customers/${historyCustomer.id}/payments`, {
      credentials: "include",
    });
    const payments: Payment[] = await res.json();
    const doc = new jsPDF();
    doc.text(`Payment History - ${historyCustomer.name}`, 14, 16);
    let y = 30;
    payments.forEach((p) => {
      const row = [
        format(new Date(p.createdAt), "MMM dd, yyyy"),
        formatCurrency(Number(p.amount ?? 0)),
        p.paymentMethod,
        p.notes || "",
      ].join(" | ");
      doc.text(row, 14, y);
      y += 10;
    });
    doc.save("payment_history.pdf");
  };

  const handlePaymentsExportCSV = async () => {
    if (!historyCustomer) return;
    const res = await fetch(`/api/customers/${historyCustomer.id}/payments`, {
      credentials: "include",
    });
    const payments: Payment[] = await res.json();
    const rows = payments.map((p) => ({
      date: format(new Date(p.createdAt), "yyyy-MM-dd"),
      amount: Number(p.amount),
      method: p.paymentMethod,
      notes: p.notes || "",
    }));
    downloadCSV(rows, "payment_history.csv");
  };

  const handleOrdersExportPDF = async () => {
    if (!historyCustomer) return;
    const res = await fetch(`/api/customers/${historyCustomer.id}/orders`, {
      credentials: "include",
    });
    const orders: CustomerOrder[] = await res.json();
    const doc = new jsPDF();
    doc.text(`Order History - ${historyCustomer.name}`, 14, 16);
    let y = 30;
    orders.forEach((o) => {
      const row = [
        o.orderNumber,
        format(new Date(o.createdAt), "MMM dd, yyyy"),
        formatCurrency(Number(o.subtotal)),
        formatCurrency(Number(o.paid)),
        formatCurrency(Number(o.remaining)),
      ].join(" | ");
      doc.text(row, 14, y);
      y += 10;
    });
    doc.save("order_history.pdf");
  };

  const handleOrdersExportCSV = async () => {
    if (!historyCustomer) return;
    const res = await fetch(`/api/customers/${historyCustomer.id}/orders`, {
      credentials: "include",
    });
    const orders: CustomerOrder[] = await res.json();
    const rows = orders.map((o) => ({
      orderNumber: o.orderNumber,
      date: format(new Date(o.createdAt), "yyyy-MM-dd"),
      subtotal: Number(o.subtotal),
      paid: Number(o.paid),
      remaining: Number(o.remaining),
    }));
    downloadCSV(rows, "order_history.csv");
  };

  const handleLoyaltyExportPDF = async () => {
    if (!historyCustomer) return;
    const res = await fetch(
      `/api/customers/${historyCustomer.id}/loyalty-history`,
      { credentials: "include" }
    );
    const history: LoyaltyHistory[] = await res.json();
    const doc = new jsPDF();
    doc.text(`Loyalty History - ${historyCustomer.name}`, 14, 16);
    let y = 30;
    history.forEach((h) => {
      const row = [
        format(new Date(h.createdAt), "MMM dd, yyyy"),
        h.change.toString(),
        h.description || "",
      ].join(" | ");
      doc.text(row, 14, y);
      y += 10;
    });
    doc.save("loyalty_history.pdf");
  };

  const handleLoyaltyExportCSV = async () => {
    if (!historyCustomer) return;
    const res = await fetch(
      `/api/customers/${historyCustomer.id}/loyalty-history`,
      { credentials: "include" }
    );
    const history: LoyaltyHistory[] = await res.json();
    const rows = history.map((h) => ({
      date: format(new Date(h.createdAt), "yyyy-MM-dd"),
      change: h.change,
      description: h.description || "",
    }));
    downloadCSV(rows, "loyalty_history.csv");
  };

  const renderCustomerCard = (customer: Customer) => (
    <Card key={customer.id} className="cursor-pointer hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">
              {customer.name}
              {customer.nickname && (
                <span className="text-sm text-gray-500 ml-2">
                  ({customer.nickname})
                </span>
              )}
            </CardTitle>
            {typeof (customer as any).publicId === 'number' && (
              <div className="text-xs text-gray-500 mt-1">ID #{(customer as any).publicId}</div>
            )}
            <CardDescription className="flex items-center mt-1">
              <Phone className="w-3 h-3 mr-1" />
              {customer.phoneNumber}
            </CardDescription>
          </div>
          {parseFloat(customer.balanceDue) > 0 && (
            <Badge
              variant="destructive"
              className="cursor-pointer"
              onClick={() => {
                setReportCustomer(customer);
                setIsReportDialogOpen(true);
              }}
            >
              {t.balanceDue}: {formatCurrency(Number(customer.balanceDue ?? 0))}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {customer.email && (
          <p className="text-sm text-gray-600">{customer.email}</p>
        )}
        <div className="flex justify-between text-sm">
          <span>{t.totalSpent}:</span>
          <span className="font-medium">
            {formatCurrency(Number(customer.totalSpent ?? 0))}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span>{t.loyaltyPoints}:</span>
          <span className="font-medium">{customer.loyaltyPoints}</span>
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <div className="grid grid-cols-2 gap-x-2 gap-y-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onCustomerSelect?.(customer)}
          >
            <User className="w-3 h-3 mr-1" />
            {t.select}
          </Button>
          {parseFloat(customer.balanceDue) > 0 && (
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                setSelectedCustomer(customer);
                setIsPaymentDialogOpen(true);
              }}
            >
              <DollarSign className="w-3 h-3 mr-1" />
              {t.pay}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              setEditingCustomer(customer);
              setEditCustomerData({
                phoneNumber: customer.phoneNumber,
                name: customer.name,
                email: customer.email || "",
                address: customer.address || "",
                nickname: customer.nickname || "",
                city: (customer as any).city || "",
              });
              setIsEditDialogOpen(true);
            }}
          >
            {t.edit}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              setHistoryCustomer(customer);
              setPaymentPage(1);
              setOrderPage(1);
              setLoyaltyPage(1);
              setIsHistoryDialogOpen(true);
            }}
          >
            {t.history}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => handleResetPassword(customer)}
          >
            {t.resetPassword}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => handleDeactivateCustomer(customer.id)}
            disabled={deactivateCustomerMutation.isPending}
          >
            <UserX className="w-3 h-3 mr-1" />
            {t.deactivate}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );

  if (isLoading) {
    return <LoadingScreen message={t.loading} />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t.customerManagement}</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              {t.addCustomer}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.addNewCustomer}</DialogTitle>
              <DialogDescription>
                Enter customer details to create a new account
              </DialogDescription>
            </DialogHeader>
            <CustomerFormFields customer={newCustomer} onChange={setNewCustomer} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                {t.cancel}
              </Button>
              <Button onClick={handleAddCustomer} disabled={addCustomerMutation.isPending}>
                {t.addCustomer}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              Customer Insights
            </CardTitle>
            <CardDescription>
              Understand loyalty momentum and service preferences at a glance.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={churnFilter}
              onValueChange={(value) => setChurnFilter(value as "all" | CustomerChurnTier)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by churn" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All churn tiers</SelectItem>
                <SelectItem value="no_orders">No orders yet</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="steady">Steady</SelectItem>
                <SelectItem value="loyal">Loyalist</SelectItem>
                <SelectItem value="at_risk">At risk</SelectItem>
                <SelectItem value="dormant">Dormant</SelectItem>
              </SelectContent>
            </Select>
            {selectedCount > 0 ? (
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                {selectedCount} selected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                {filteredInsights.length} shown
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={selectFilteredCustomers}
              disabled={!filteredInsights.length}
            >
              Select visible
            </Button>
            {selectedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearInsightSelection}>
                Clear selection
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setIsBulkDialogOpen(true)}
              disabled={!selectedCount || bulkSendMutation.isPending}
            >
              <Send className="mr-2 h-4 w-4" />
              Queue outreach
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleInsightsExportCSV}
              disabled={insightsLoading || filteredInsights.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              {t.exportCSV}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {insightsLoading ? (
            <p className="text-sm text-muted-foreground">{t.loading}</p>
          ) : filteredInsights.length === 0 ? (
            <p className="text-sm text-muted-foreground">No insight data available yet.</p>
          ) : (
            <div className="space-y-4">
              {filteredInsights.map((insight) => {
                const monthlySorted = [...insight.monthlySpend].sort((a, b) =>
                  a.month.localeCompare(b.month),
                );
                const lastThree = monthlySorted.slice(-3);
                const last = lastThree[lastThree.length - 1];
                const previous = lastThree[lastThree.length - 2];
                const trendValue = last && previous ? last.total - previous.total : 0;
                const trendIcon = trendValue > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : trendValue < 0 ? (
                  <TrendingDown className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                );
                const trendText =
                  trendValue > 0
                    ? `+${formatCurrency(trendValue)} vs last month`
                    : trendValue < 0
                    ? `-${formatCurrency(Math.abs(trendValue))} vs last month`
                    : "Steady vs last month";
                const trendClass =
                  trendValue > 0
                    ? "text-emerald-600"
                    : trendValue < 0
                    ? "text-amber-600"
                    : "text-slate-600";
                const churn = getChurnBadge(insight.churnTier);
                const lastOrderLabel = insight.lastOrderDate
                  ? format(new Date(insight.lastOrderDate), "MMM dd, yyyy")
                  : "No orders yet";
                const isSelected = selectedCustomerIds.has(insight.customerId);
                const formattedOutcome = formatOutcome(insight.lastOutcome);

                return (
                  <div
                    key={insight.customerId}
                    className="rounded-lg border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-3 md:flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-lg font-semibold">{insight.name}</h3>
                              <Badge variant="outline" className={`flex items-center gap-1 ${churn.className}`}>
                                {churn.icon}
                                {churn.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{insight.phoneNumber}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                toggleInsightSelection(insight.customerId, Boolean(checked))
                              }
                              aria-label={`Select ${insight.name}`}
                            />
                            <span className="text-xs text-muted-foreground">
                              {isSelected ? "Selected" : "Select"}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <span>
                            {t.totalSpent}: <strong>{formatCurrency(insight.totalSpend)}</strong>
                          </span>
                          <span>
                            {t.orders}: <strong>{insight.orderCount}</strong>
                          </span>
                          <span>
                            {t.loyaltyPoints}: <strong>{insight.loyaltyPoints}</strong>
                          </span>
                          <span>
                            Avg. order: <strong>{formatCurrency(insight.averageOrderValue)}</strong>
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 text-sm md:min-w-[200px]">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">Last order</div>
                          <div className="font-medium">{lastOrderLabel}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground">Loyalty trend</div>
                          <div className={`flex items-center gap-2 font-medium ${trendClass}`}>
                            {trendIcon}
                            <span>{trendText}</span>
                          </div>
                        </div>
                        {insight.rateLimitedUntil && (
                          <div className="text-xs text-amber-600 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Rate limited until {format(new Date(insight.rateLimitedUntil), "MMM dd, HH:mm")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div className="space-y-2 rounded-lg border border-dashed bg-muted/40 p-3">
                        <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                          <span>Engagement plan</span>
                          <Badge
                            variant="outline"
                            className={
                              insight.planSource === "manual"
                                ? "border-blue-200 bg-blue-50 text-blue-700"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }
                          >
                            {insight.planSource === "manual" ? "Manual" : "Auto"}
                          </Badge>
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                          {(insight.recommendedChannel ?? insight.suggestedChannel) === "sms" ? (
                            <MessageCircle className="h-4 w-4 text-primary mt-0.5" />
                          ) : (
                            <Mail className="h-4 w-4 text-primary mt-0.5" />
                          )}
                          <div>
                            <p className="font-medium">
                              {insight.recommendedAction ?? insight.suggestedAction}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Channel: {(insight.recommendedChannel ?? insight.suggestedChannel).toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            Next contact:{" "}
                            {insight.nextContactAt
                              ? format(new Date(insight.nextContactAt), "MMM dd, yyyy HH:mm")
                              : insight.suggestedNextContactAt
                              ? format(new Date(insight.suggestedNextContactAt), "MMM dd, yyyy HH:mm")
                              : "Not scheduled"}
                          </span>
                        </div>
                        {insight.lastActionAt && (
                          <div className="text-xs text-muted-foreground">
                            Last touch: {format(new Date(insight.lastActionAt), "MMM dd, yyyy HH:mm")}
                          </div>
                        )}
                        {formattedOutcome && (
                          <div className="text-xs text-muted-foreground">Last outcome: {formattedOutcome}</div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground mb-2">Preferred services</div>
                          {insight.preferredServices.length ? (
                            <div className="flex flex-wrap gap-2">
                              {insight.preferredServices.map((service) => (
                                <Badge
                                  key={`${insight.customerId}-${service}-preferred`}
                                  variant="outline"
                                  className="border-indigo-200 bg-indigo-50 text-indigo-700"
                                >
                                  {service}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No preference data</p>
                          )}
                        </div>
                        <div>
                          <div className="text-xs uppercase text-muted-foreground mb-2">Top services</div>
                          {insight.topServices.length ? (
                            <div className="flex flex-wrap gap-2">
                              {insight.topServices.slice(0, 4).map((svc) => (
                                <Badge
                                  key={`${insight.customerId}-${svc.service}`}
                                  variant="outline"
                                  className="border-blue-200 bg-blue-50 text-blue-700"
                                >
                                  {svc.service} • {svc.quantity}x
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No service data</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-muted-foreground mb-2">Top clothing</div>
                        {insight.topClothing.length ? (
                          <div className="flex flex-wrap gap-2">
                            {insight.topClothing.slice(0, 4).map((item) => (
                              <Badge
                                key={`${insight.customerId}-${item.item}`}
                                variant="outline"
                                className="border-violet-200 bg-violet-50 text-violet-700"
                              >
                                {item.item} • {item.quantity}x
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No clothing data</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-xs uppercase text-muted-foreground mb-2">Recent months</div>
                      {lastThree.length ? (
                        <div className="flex flex-wrap gap-2">
                          {lastThree.map((entry) => (
                            <span
                              key={`${insight.customerId}-${entry.month}`}
                              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {formatMonthLabel(entry.month)} • {formatCurrency(entry.total)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not enough data yet.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Queue outreach</DialogTitle>
            <DialogDescription>
              Send a templated message to {selectedCount} selected customer
              {selectedCount === 1 ? "" : "s"}. Notifications respect rate limits and communication opt-outs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Template</Label>
              <Select value={bulkTemplate} onValueChange={setBulkTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {OUTREACH_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Templates support the <code className="rounded bg-muted px-1">{`{name}`}</code> placeholder for personalization.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Channel</Label>
                <Select value={bulkChannel} onValueChange={(value) => setBulkChannel(value as EngagementChannel)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Rate limit (hours)</Label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={bulkRateLimitHours}
                  onChange={(event) => setBulkRateLimitHours(Number(event.target.value) || 0)}
                />
              </div>
            </div>
            {bulkChannel === "email" && (
              <div className="grid gap-2">
                <Label>Email subject</Label>
                <Input
                  value={bulkSubject}
                  onChange={(event) => setBulkSubject(event.target.value)}
                  placeholder="Thank you for choosing LaundryAO"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label>Message</Label>
              <Textarea
                value={bulkMessage}
                onChange={(event) => setBulkMessage(event.target.value)}
                rows={5}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Next contact (optional)</Label>
                <Input
                  type="datetime-local"
                  value={bulkNextContact}
                  onChange={(event) => setBulkNextContact(event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label>Selected customers</Label>
                <p className="text-sm text-muted-foreground">{selectedCount}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="justify-end gap-2">
            <Button variant="outline" onClick={() => setIsBulkDialogOpen(false)} disabled={bulkSendMutation.isPending}>
              {t.cancel}
            </Button>
            <Button onClick={handleBulkSend} disabled={bulkSendMutation.isPending}>
              {bulkSendMutation.isPending ? "Queuing..." : "Send now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search customers by name, nickname, phone, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="h-[600px]">
        <List
          ref={listRef}
          height={600}
          itemCount={customers.length}
          itemSize={getRowHeight}
          width="100%"
        >
          {({ index, style }: { index: number; style: CSSProperties }) => (
            <div
              style={style}
              className="p-2"
              ref={(el) => {
                if (el) {
                  const height =
                    el.firstElementChild?.getBoundingClientRect().height || 0;
                  setRowHeight(index, height + 16);
                }
              }}
            >
              {renderCustomerCard(customers[index])}
            </div>
          )}
        </List>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
            disabled={customerPage === 1}
          >
            {t.previous}
          </Button>
          <span className="text-sm">
            {customerPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomerPage((p) => Math.min(totalPages, p + 1))}
            disabled={customerPage === totalPages}
          >
            {t.next}
          </Button>
        </div>
      )}

      {/* Report Dialog */}
      <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t.customerDueAmountReport}</DialogTitle>
            <DialogDescription>
              {reportCustomer ? `Outstanding orders for ${reportCustomer.name}` : ""}
            </DialogDescription>
          </DialogHeader>
          {customerOrders.length === 0 ? (
            <p className="text-sm text-gray-500">No outstanding orders.</p>
          ) : (
            <>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">Order #</th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Subtotal</th>
                      <th className="p-2">Paid</th>
                      <th className="p-2">Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.map((order) => (
                      <tr key={order.id} className="border-t">
                        <td className="p-2">{order.orderNumber}</td>
                        <td className="p-2">{format(new Date(order.createdAt), "MMM dd, yyyy")}</td>
                        <td className="p-2">{formatCurrency(Number(order.subtotal))}</td>
                        <td className="p-2">{formatCurrency(Number(order.paid))}</td>
                        <td className="p-2">{formatCurrency(Number(order.remaining))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter className="justify-end gap-2">
                <Button variant="outline" onClick={handleExportPDF}>{t.exportPDF}</Button>
                <Button variant="outline" onClick={handleExportExcel}>{t.exportExcel}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t.history} - {historyCustomer?.name}</DialogTitle>
            <DialogDescription>
              Review the customer's payment, order, and loyalty history
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="payments">
            <TabsList>
              <TabsTrigger value="payments">{t.payments}</TabsTrigger>
              <TabsTrigger value="orders">{t.orders}</TabsTrigger>
              <TabsTrigger value="packages">{t.packages}</TabsTrigger>
              <TabsTrigger value="loyalty">{t.loyalty}</TabsTrigger>
            </TabsList>
            <TabsContent value="payments">
              {paymentHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No payments found.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <div className="min-w-full text-sm">
                      <div className="grid grid-cols-4 text-left font-medium">
                        <div className="p-2">Date</div>
                        <div className="p-2">Amount</div>
                        <div className="p-2">Method</div>
                        <div className="p-2">Notes</div>
                      </div>
                      <List
                        height={256}
                        itemCount={paymentHistory.length}
                        itemSize={() => 40}
                        width="100%"
                      >
                        {({ index, style }: { index: number; style: CSSProperties }) => {
                          const p = paymentHistory[index];
                          return (
                            <div style={style} className="grid grid-cols-4 border-t">
                              <div className="p-2">{format(new Date(p.createdAt), "MMM dd, yyyy")}</div>
                              <div className="p-2">{formatCurrency(Number(p.amount ?? 0))}</div>
                              <div className="p-2">{p.paymentMethod}</div>
                              <div className="p-2">{p.notes || ""}</div>
                            </div>
                          );
                        }}
                      </List>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={handlePaymentsExportPDF}>
                      {t.exportPDF}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePaymentsExportCSV}>
                      {t.exportCSV}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
            <TabsContent value="orders">
              {orderHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No orders found.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <div className="min-w-full text-sm">
                      <div className="grid grid-cols-6 text-left font-medium">
                        <div className="p-2">Order #</div>
                        <div className="p-2">Type</div>
                        <div className="p-2">Date</div>
                        <div className="p-2">Subtotal</div>
                        <div className="p-2">Paid</div>
                        <div className="p-2">Remaining</div>
                      </div>
                      <List
                        height={256}
                        itemCount={orderHistory.length}
                        itemSize={() => 40}
                        width="100%"
                      >
                        {({ index, style }: { index: number; style: CSSProperties }) => {
                          const o = orderHistory[index];
                          return (
                            <div style={style} className="grid grid-cols-6 border-t">
                              <div className="p-2">{o.orderNumber}</div>
                              <div className="p-2">
                                {(o as any).deliveryOrder ? (
                                  <div className="flex items-center gap-1 text-blue-600">
                                    <Truck className="h-3 w-3" />
                                    <span className="text-xs">Delivery</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-500">Regular</span>
                                )}
                              </div>
                              <div className="p-2">{format(new Date(o.createdAt), "MMM dd, yyyy")}</div>
                              <div className="p-2">{formatCurrency(Number(o.subtotal))}</div>
                              <div className="p-2">{formatCurrency(Number(o.paid))}</div>
                              <div className="p-2">{formatCurrency(Number(o.remaining))}</div>
                            </div>
                          );
                        }}
                      </List>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={handleOrdersExportPDF}>
                      {t.exportPDF}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleOrdersExportCSV}>
                      {t.exportCSV}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
            <TabsContent value="packages">
              {packagesLoading ? (
                <p className="text-sm text-gray-500">{t.loading}</p>
              ) : packageHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No packages found.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <div className="min-w-full text-sm">
                      <div className="grid grid-cols-5 text-left font-medium">
                        <div className="p-2">Name</div>
                        <div className="p-2">Used</div>
                        <div className="p-2">Remaining</div>
                        <div className="p-2">Purchased</div>
                        <div className="p-2">Expires</div>
                      </div>
                      <List
                        height={256}
                        itemCount={packageHistory.length}
                        itemSize={() => 40}
                        width="100%"
                      >
                        {({ index, style }: { index: number; style: CSSProperties }) => {
                          const p = packageHistory[index];
                          return (
                            <div style={style} className="grid grid-cols-5 border-t">
                              <div className="p-2">
                                <div>{p.nameEn}</div>
                                <div
                                  className="text-sm text-right text-gray-500"
                                  dir="rtl"
                                >
                                  {p.nameAr || ""}
                                </div>
                              </div>
                              <div className="p-2">
                                {p.totalCredits - p.balance}
                              </div>
                              <div className="p-2">{p.balance}</div>
                              <div className="p-2">
                                {format(new Date(p.startsAt), "MMM dd, yyyy")}
                              </div>
                              <div className="p-2">
                                {p.expiresAt
                                  ? format(new Date(p.expiresAt), "MMM dd, yyyy")
                                  : ""}
                              </div>
                            </div>
                          );
                        }}
                      </List>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
            <TabsContent value="loyalty">
              {loyaltyHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No loyalty changes found.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <div className="min-w-full text-sm">
                      <div className="grid grid-cols-3 text-left font-medium">
                        <div className="p-2">Date</div>
                        <div className="p-2">Change</div>
                        <div className="p-2">Description</div>
                      </div>
                      <List
                        height={256}
                        itemCount={loyaltyHistory.length}
                        itemSize={() => 40}
                        width="100%"
                      >
                        {({ index, style }: { index: number; style: CSSProperties }) => {
                          const l = loyaltyHistory[index];
                          return (
                            <div style={style} className="grid grid-cols-3 border-t">
                              <div className="p-2">{format(new Date(l.createdAt), "MMM dd, yyyy")}</div>
                              <div className="p-2">{l.change}</div>
                              <div className="p-2">{l.description || ""}</div>
                            </div>
                          );
                        }}
                      </List>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={handleLoyaltyExportPDF}>
                      {t.exportPDF}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleLoyaltyExportCSV}>
                      {t.exportCSV}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.editCustomer}</DialogTitle>
            <DialogDescription>Update customer details</DialogDescription>
          </DialogHeader>
          <CustomerFormFields customer={editCustomerData} onChange={setEditCustomerData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t.cancel}
            </Button>
            <Button onClick={handleEditCustomer} disabled={editCustomerMutation.isPending}>
              {t.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.recordPayment} - {selectedCustomer?.name}</DialogTitle>
            <DialogDescription>
              Current balance due: {formatCurrency(Number(selectedCustomer?.balanceDue ?? 0))}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">{t.paymentAmount} *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="method">{t.paymentMethod}</Label>
                <select
                  id="method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="cash">{t.cash}</option>
                  <option value="card">{t.card}</option>
                  <option value="bank_transfer">{t.bankTransfer}</option>
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">{t.notesOptional}</Label>
              <Input
                id="notes"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Payment notes..."
              />
            </div>

            {selectedCustomerPayments.length > 0 && (
              <div>
                <Separator className="my-4" />
                <h4 className="font-medium mb-2">{t.recentPayments}</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedCustomerPayments.slice(0, 5).map((payment) => (
                    <div key={payment.id} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-3 h-3" />
                        <span>{formatCurrency(Number(payment.amount ?? 0))}</span>
                        <Badge variant="outline" className="text-xs">
                          {payment.paymentMethod === "bank_transfer"
                            ? t.bankTransfer
                            : (payment.paymentMethod === "cash" ? t.cash : t.card)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <Calendar className="w-3 h-3" />
                        <span>{format(new Date(payment.createdAt), "MMM dd")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
              {t.cancel}
            </Button>
            <Button onClick={handleRecordPayment} disabled={recordPaymentMutation.isPending}>
              {t.recordPayment}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
