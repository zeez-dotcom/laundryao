import { useState, useEffect, type ChangeEvent } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { useQuery, useMutation as useRQMutation } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import type { InsertBranch } from "@shared/schema";

export function BranchSettings() {
  const { branch } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(branch?.name || "");
  const [logoUrl, setLogoUrl] = useState(branch?.logoUrl || "");
  const [whatsappQrUrl, setWhatsappQrUrl] = useState((branch as any)?.whatsappQrUrl || "");
  const [tagline, setTagline] = useState(branch?.tagline || "");
  const [taglineAr, setTaglineAr] = useState((branch as any)?.taglineAr || "");
  const [address, setAddress] = useState(branch?.address || "");
  const [addressAr, setAddressAr] = useState((branch as any)?.addressAr || "");
  const [phone, setPhone] = useState(branch?.phone || "");
  const [nameAr, setNameAr] = useState((branch as any)?.nameAr || "");
  const [preview, setPreview] = useState(branch?.logoUrl || "");
  const [whatsappPreview, setWhatsappPreview] = useState((branch as any)?.whatsappQrUrl || "");

  useEffect(() => {
    if (branch) {
      setName(branch.name || "");
      setTagline(branch.tagline || "");
      setTaglineAr((branch as any).taglineAr || "");
      setAddress(branch.address || "");
      setAddressAr((branch as any).addressAr || "");
      setNameAr((branch as any).nameAr || "");
      setPhone(branch.phone || "");
      if (branch.name) localStorage.setItem("companyName", branch.name);
      if (branch.phone) {
        localStorage.setItem("companyPhone", branch.phone);
      } else {
        localStorage.removeItem("companyPhone");
      }
      if (branch.tagline) {
        localStorage.setItem("companyTagline", branch.tagline);
      } else {
        localStorage.removeItem("companyTagline");
      }
      setWhatsappQrUrl((branch as any).whatsappQrUrl || "");
      setWhatsappPreview((branch as any).whatsappQrUrl || "");
    }
  }, [branch]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!branch) throw new Error("No branch available");
      const updates: Partial<InsertBranch> = {};
      if (name !== branch.name) updates.name = name;
      if (tagline !== (branch.tagline || "")) updates.tagline = tagline;
      if (taglineAr !== ((branch as any).taglineAr || "")) (updates as any).taglineAr = taglineAr;
      if (address !== (branch.address || "")) updates.address = address;
      if (addressAr !== ((branch as any).addressAr || "")) (updates as any).addressAr = addressAr;
      if (phone !== (branch.phone || "")) updates.phone = phone;
      if (nameAr !== ((branch as any).nameAr || "")) (updates as any).nameAr = nameAr;
      if (logoUrl && logoUrl !== branch.logoUrl) updates.logoUrl = logoUrl;
      const res = await apiRequest("PUT", `/api/branches/${branch.id}`, updates);
      return await res.json();
    },
    onSuccess: (data) => {
      localStorage.setItem("companyName", data.name);
      if (data.phone) {
        localStorage.setItem("companyPhone", data.phone);
      } else {
        localStorage.removeItem("companyPhone");
      }
      if (data.tagline) {
        localStorage.setItem("companyTagline", data.tagline);
      } else {
        localStorage.removeItem("companyTagline");
      }
      // Optional: keep Arabic tagline in local storage for client fallback
      if ((data as any).taglineAr) {
        localStorage.setItem("companyTaglineAr", (data as any).taglineAr);
      } else {
        localStorage.removeItem("companyTaglineAr");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Branch updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating branch",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!branch) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    const formData = new FormData();
    formData.append("logo", file);
    try {
      const res = await fetch(`/api/branches/${branch.id}/logo`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setLogoUrl(data.logoUrl);
      setPreview(data.logoUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Logo updated" });
    } catch (error: any) {
      toast({
        title: "Error uploading logo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleWhatsappQrChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!branch) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setWhatsappPreview(objectUrl);
    const formData = new FormData();
    formData.append("whatsappQr", file);
    try {
      const res = await fetch(`/api/branches/${branch.id}/whatsapp-qr`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      setWhatsappQrUrl(data.whatsappQrUrl);
      setWhatsappPreview(data.whatsappQrUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "WhatsApp QR updated" });
    } catch (error: any) {
      toast({
        title: "Error uploading WhatsApp QR",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (!branch) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Store className="h-5 w-5" />
          <span>Branch Settings</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name (EN)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nameAr">Name (AR)</Label>
            <Input id="nameAr" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address (EN)</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressAr">Address (AR)</Label>
            <Input id="addressAr" dir="rtl" value={addressAr} onChange={(e) => setAddressAr(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <Input id="logo" type="file" accept="image/*" onChange={handleLogoChange} />
            {preview && (
              <img src={preview} alt="Logo preview" className="h-20 object-contain" />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsappQr">WhatsApp QR Code</Label>
            <Input id="whatsappQr" type="file" accept="image/*" onChange={handleWhatsappQrChange} />
            {whatsappPreview && (
              <img src={whatsappPreview} alt="WhatsApp QR preview" className="h-24 w-24 object-contain border rounded" />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline (EN)</Label>
            <Input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taglineAr">Tagline (AR)</Label>
            <Input id="taglineAr" dir="rtl" value={taglineAr} onChange={(e) => setTaglineAr(e.target.value)} />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Save Changes
          </Button>
        </form>

        {/* Feature Flags */}
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold">Feature Flags</h3>
          <FeatureFlags branchId={branch.id} />
        </div>
      </CardContent>
    </Card>
  );
}

export default BranchSettings;

function FeatureFlags({ branchId }: { branchId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: customization } = useQuery<any>({
    queryKey: ["/api/branches", branchId, "customization"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/branches/${branchId}/customization`);
      return res.json();
    }
  });
  const saveFlag = useRQMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/branches/${branchId}/customization`, data);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update flags");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feature flags updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/branches", branchId, "customization"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" })
  });

  if (!customization) return null;

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="space-y-0.5">
        <Label htmlFor="expensesEnabled">Enable Expenses</Label>
        <p className="text-sm text-muted-foreground">Track and report business expenses for this branch</p>
      </div>
      <Switch id="expensesEnabled" checked={!!customization.expensesEnabled} onCheckedChange={(checked) => saveFlag.mutate({ expensesEnabled: checked })} />
    </div>
  );
}
