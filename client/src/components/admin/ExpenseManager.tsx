import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuthContext } from "@/context/AuthContext";
import { Upload, PlusCircle, Filter, Trash2, Edit, Check, X } from "lucide-react";
import SavedViewsBar from "@/components/SavedViewsBar";
import { format } from "date-fns";
import { useCurrency } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Expense = {
  id: string;
  branchId: string;
  category: string;
  amount: string;
  paymentMethod?: string | null;
  notes?: string;
  incurredAt: string;
  createdAt: string;
};

export function ExpenseManager() {
  const { user, branch } = useAuthContext();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const [start, setStart] = useState<string>(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10));
  const [end, setEnd] = useState<string>(new Date().toISOString().slice(0,10));
  const fileRef = useRef<HTMLInputElement | null>(null);

  const enabled = !!branch?.id && !!user && (user.role === "admin" || user.role === "super_admin");

  const { data: customization } = useQuery<any>({
    queryKey: branch?.id ? ["/api/branches", branch.id, "customization"] : ["customization:disabled"],
    enabled: !!branch?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/branches/${branch!.id}/customization`);
      return res.json();
    }
  });

  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const { data: expensesResp, isLoading, refetch } = useQuery<{ items: Expense[]; total: number }>({
    queryKey: ["/api/expenses", start, end, search, page, pageSize],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (search) params.set("q", search);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiRequest("GET", `/api/expenses?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to fetch expenses");
      const total = parseInt(res.headers.get("X-Total-Count") || "0", 10);
      const items = await res.json();
      return { items, total };
    }
  });
  const expenses = expensesResp?.items || [];
  const total = expensesResp?.total || 0;

  const createMutation = useMutation({
    mutationFn: async (data: { category: string; amount: number; incurredAt?: string; notes?: string; paymentMethod?: string }) => {
      const res = await apiRequest("POST", "/api/expenses", data);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create expense");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Expense added" });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const [form, setForm] = useState({ category: "", amount: "", incurredAt: new Date().toISOString().slice(0,10), notes: "", paymentMethod: "cash" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ category: string; amount: string; incurredAt: string; notes: string; paymentMethod: string }>({ category: "", amount: "", incurredAt: new Date().toISOString().slice(0,10), notes: "", paymentMethod: "cash" });

  const pageTotal = useMemo(() => expenses.reduce((s, e) => s + parseFloat(e.amount), 0), [expenses]);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allSelected = expenses.length > 0 && expenses.every((e) => selectedIds.has(e.id));
  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(expenses.map((e) => e.id)));
    else setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await apiRequest("DELETE", "/api/expenses", { ids: Array.from(selectedIds) } as any);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to delete expenses");
      toast({ title: "Deleted selected expenses" });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const exportCSV = (rows: Expense[]) => {
    const header = ["category", "amount", "incurredAt", "notes"];
    const lines = [header.join(",")].concat(
      rows.map((r) => [
        JSON.stringify(r.category ?? ""),
        JSON.stringify(r.amount ?? ""),
        JSON.stringify(r.incurredAt?.slice(0, 10) ?? ""),
        JSON.stringify(r.notes ?? ""),
      ].join(",")),
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses_${start}_${end}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCSVImport = async (file: File) => {
    const text = await file.text();
    // Expect headers: category,amount,incurredAt,notes
    const rows = text.split(/\r?\n/).filter(Boolean);
    if (rows.length <= 1) return;
    const headers = rows[0].split(",").map(h => h.trim().toLowerCase());
    const idxCategory = headers.indexOf("category");
    const idxAmount = headers.indexOf("amount");
    const idxIncurredAt = headers.indexOf("incurredat");
    const idxNotes = headers.indexOf("notes");
    let success = 0, failed = 0;
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i].split(",");
      if (!cols[idxCategory] || !cols[idxAmount]) { failed++; continue; }
      const payload = {
        category: cols[idxCategory].trim(),
        amount: parseFloat(cols[idxAmount]),
        incurredAt: idxIncurredAt >= 0 && cols[idxIncurredAt] ? cols[idxIncurredAt].trim() : undefined,
        notes: idxNotes >= 0 ? cols[idxNotes] : undefined,
      } as any;
      try {
        await createMutation.mutateAsync(payload);
        success++;
      } catch {
        failed++;
      }
    }
    toast({ title: "Import complete", description: `${success} added, ${failed} failed` });
    refetch();
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PUT", `/api/expenses/${id}`, data);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update expense");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Expense updated" });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/expenses/${id}`);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to delete expense");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Expense deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (!enabled) return null;

  if (customization && customization.expensesEnabled === false) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">Expenses are disabled for this branch. Enable them in Branch Settings → Feature Flags.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5" />
            Expenses
          </CardTitle>
          <CardDescription>Record and manage branch expenses</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Expense</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Rent, Wages, Supplies" />
            </div>
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={form.incurredAt} onChange={(e) => setForm({ ...form, incurredAt: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => {
              if (!form.category || !form.amount) return toast({ title: "Category and amount required", variant: "destructive" });
              createMutation.mutate({ category: form.category, amount: parseFloat(form.amount), incurredAt: form.incurredAt, notes: form.notes, paymentMethod: form.paymentMethod });
            }}>Add</Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files && handleCSVImport(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Import CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filter</CardTitle>
          <CardDescription>Filter by date range, keyword, and page size</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label>Start</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>End</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Search</Label>
            <Input placeholder="Search category or notes" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Page Size</Label>
            <Input type="number" value={pageSize} onChange={(e) => setPageSize(parseInt(e.target.value || "10", 10))} className="w-24" />
          </div>
          <div className="self-end">
            <Button variant="outline" onClick={() => { setPage(1); refetch(); }}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expenses List</CardTitle>
          <CardDescription>Page total: {formatCurrency(pageTotal)} • All: {formatCurrency(total)}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <SavedViewsBar
              pageId="expenses"
              current={{ start, end, search, pageSize }}
              onApply={(v: any) => {
                if (v.start) setStart(String(v.start).slice(0,10));
                if (v.end) setEnd(String(v.end).slice(0,10));
                if (typeof v.search === 'string') setSearch(v.search);
                if (v.pageSize) setPageSize(Number(v.pageSize));
                setPage(1);
                refetch();
              }}
              getName={(v: any) => `${(v.start || '').slice(0,10)}-${(v.end || '').slice(0,10)}-${v.search || 'all'}-${v.pageSize || 10}`}
            />
            <Button onClick={() => setOpen(true)}>Add Expense</Button>
          </div>
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm text-muted-foreground">{total} records</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => exportCSV(expenses)}>Export CSV (page)</Button>
              <Button variant="outline" onClick={async () => {
                const params = new URLSearchParams();
                if (start) params.set("start", start);
                if (end) params.set("end", end);
                if (search) params.set("q", search);
                const res = await fetch(`/api/expenses/export?${params.toString()}`, { credentials: "include" });
                if (!res.ok) {
                  const msg = (() => { try { return res.json(); } catch { return null; } })();
                  toast({ title: "Export failed", description: (await msg)?.message || "Error", variant: "destructive" });
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `expenses_${start || 'all'}_${end || 'all'}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}>Export All CSV</Button>
              <Button variant="outline" onClick={async () => {
                const params = new URLSearchParams();
                if (start) params.set("start", start);
                if (end) params.set("end", end);
                if (search) params.set("q", search);
                const res = await fetch(`/api/expenses/export.xlsx?${params.toString()}`, { credentials: "include" });
                if (!res.ok) {
                  const msg = (() => { try { return res.json(); } catch { return null; } })();
                  toast({ title: "Export failed", description: (await msg)?.message || "Error", variant: "destructive" });
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `expenses_${start || 'all'}_${end || 'all'}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}>Export XLSX</Button>
              {selectedIds.size > 0 && (
                <Button variant="destructive" onClick={handleBulkDelete}>Delete Selected ({selectedIds.size})</Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input type="checkbox" aria-label="select all" onChange={(e) => toggleAll(e.target.checked)} checked={allSelected} />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <input type="checkbox" checked={selectedIds.has(e.id)} onChange={(ev) => toggleOne(e.id, ev.target.checked)} />
                    </TableCell>
                    <TableCell>
                      {editingId === e.id ? (
                        <Input type="date" value={editForm.incurredAt} onChange={(ev) => setEditForm({ ...editForm, incurredAt: ev.target.value })} />
                      ) : (
                        format(new Date(e.incurredAt), "yyyy-MM-dd")
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === e.id ? (
                        <Input value={editForm.category} onChange={(ev) => setEditForm({ ...editForm, category: ev.target.value })} />
                      ) : (
                        e.category
                      )}
                    </TableCell>
                    <TableCell className="truncate max-w-[320px]">
                      {editingId === e.id ? (
                        <Input value={editForm.notes} onChange={(ev) => setEditForm({ ...editForm, notes: ev.target.value })} />
                      ) : (
                        e.notes || ""
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === e.id ? (
                        <Select value={editForm.paymentMethod} onValueChange={(v) => setEditForm({ ...editForm, paymentMethod: v })}>
                          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Method" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="card">Card</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        (e.paymentMethod || 'cash').replace('_', ' ')
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === e.id ? (
                        <Input value={editForm.amount} onChange={(ev) => setEditForm({ ...editForm, amount: ev.target.value })} />
                      ) : (
                        formatCurrency(parseFloat(e.amount))
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === e.id ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            updateMutation.mutate({ id: e.id, data: { category: editForm.category, notes: editForm.notes, incurredAt: editForm.incurredAt, amount: parseFloat(editForm.amount), paymentMethod: editForm.paymentMethod } });
                          }}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(e.id); setEditForm({ category: e.category, amount: e.amount, incurredAt: e.incurredAt.slice(0,10), notes: e.notes || "", paymentMethod: e.paymentMethod || 'cash' }); }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(e.id)} disabled={deleteMutation.isPending}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">No expenses for selected period</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-between items-center mt-3">
            <div className="text-sm">Page {page}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * pageSize >= total}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ExpenseManager;
