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
import type { InsertBranch } from "@shared/schema";

export function BranchSettings() {
  const { branch } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(branch?.name || "");
  const [logoUrl, setLogoUrl] = useState(branch?.logoUrl || "");
  const [tagline, setTagline] = useState(branch?.tagline || "");
  const [address, setAddress] = useState(branch?.address || "");
  const [phone, setPhone] = useState(branch?.phone || "");
  const [preview, setPreview] = useState(branch?.logoUrl || "");

  useEffect(() => {
    if (branch) {
      setName(branch.name || "");
      setTagline(branch.tagline || "");
      setAddress(branch.address || "");
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
    }
  }, [branch]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!branch) throw new Error("No branch available");
      const updates: Partial<InsertBranch> = {};
      if (name !== branch.name) updates.name = name;
      if (tagline !== (branch.tagline || "")) updates.tagline = tagline;
      if (address !== (branch.address || "")) updates.address = address;
      if (phone !== (branch.phone || "")) updates.phone = phone;
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
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <Input id="logo" type="file" accept="image/*" onChange={handleLogoChange} />
            {preview && (
              <img src={preview} alt="Logo preview" className="h-20 object-contain" />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={mutation.isPending}>
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default BranchSettings;
