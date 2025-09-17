import { useEffect, useState, useRef, type CSSProperties } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Customer, InsertCustomer, Payment, InsertPayment, LoyaltyHistory, insertCustomerSchema } from "@shared/schema";
import { CitySelect } from "@/components/city-select";
import { Search, Plus, Phone, DollarSign, CreditCard, User, Calendar, UserX, Truck } from "lucide-react";
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
