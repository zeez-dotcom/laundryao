import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";

type DashboardSettings = {
  heroTitleEn?: string;
  heroTitleAr?: string;
  heroSubtitleEn?: string;
  heroSubtitleAr?: string;
  featuredMessageEn?: string;
  featuredMessageAr?: string;
  showPackages: boolean;
  showOrders: boolean;
};

type BranchAd = {
  id: string;
  branchId: string;
  titleEn: string;
  titleAr?: string;
  imageUrl: string;
  targetUrl?: string;
  placement: string;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
};

export function CustomerDashboardManager() {
  const { branch, isAdmin } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const branchId = branch?.id || "";

  const [settings, setSettings] = useState<DashboardSettings>({
    heroTitleEn: "Welcome",
    heroTitleAr: "مرحبا",
    heroSubtitleEn: "Manage your orders and packages",
    heroSubtitleAr: "إدارة طلباتك وباقاتك",
    featuredMessageEn: "",
    featuredMessageAr: "",
    showPackages: true,
    showOrders: true,
  });

  const { data: loadedSettings } = useQuery<DashboardSettings | undefined>({
    queryKey: [`/api/branches/${branchId}/customer-dashboard-settings`],
    enabled: !!branchId,
  });

  useEffect(() => {
    if (loadedSettings) setSettings({ ...settings, ...loadedSettings });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedSettings]);

  const saveSettings = useMutation({
    mutationFn: async (payload: Partial<DashboardSettings>) => {
      const res = await apiRequest("PUT", `/api/branches/${branchId}/customer-dashboard-settings`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Customer dashboard settings saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branchId}/customer-dashboard-settings`] });
    },
    onError: (e: any) => {
      toast({ title: "Failed to save", description: e?.message, variant: "destructive" });
    }
  });

  const { data: ads = [] } = useQuery<BranchAd[]>({
    queryKey: [`/api/branches/${branchId}/ads`],
    enabled: !!branchId,
  });

  const createAd = useMutation({
    mutationFn: async (payload: Partial<BranchAd>) => {
      const res = await apiRequest("POST", `/api/branches/${branchId}/ads`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Ad created" });
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branchId}/ads`] });
    },
    onError: (e: any) => toast({ title: "Failed to create ad", description: e?.message, variant: "destructive" })
  });

  const updateAd = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BranchAd> }) => {
      const res = await apiRequest("PUT", `/api/ads/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branchId}/ads`] });
      toast({ title: "Ad updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update ad", description: e?.message, variant: "destructive" })
  });

  const deleteAd = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/ads/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branchId}/ads`] });
      toast({ title: "Ad deleted" });
    },
    onError: (e: any) => toast({ title: "Failed to delete ad", description: e?.message, variant: "destructive" })
  });

  if (!isAdmin || !branchId) return null;

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Customer Dashboard</CardTitle>
          <CardDescription>Configure branch-specific customer dashboard and manage ads</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="content" className="space-y-6">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="ads">Ads</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle>Texts</CardTitle>
              <CardDescription>
                Update dashboard texts. Non-editable hardcoded messages will include Arabic by default.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Hero Title (EN)</Label>
                  <Input value={settings.heroTitleEn || ""} onChange={(e) => setSettings(s => ({ ...s, heroTitleEn: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Hero Title (AR)</Label>
                  <Input dir="rtl" value={settings.heroTitleAr || ""} onChange={(e) => setSettings(s => ({ ...s, heroTitleAr: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Subtitle (EN)</Label>
                  <Input value={settings.heroSubtitleEn || ""} onChange={(e) => setSettings(s => ({ ...s, heroSubtitleEn: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Subtitle (AR)</Label>
                  <Input dir="rtl" value={settings.heroSubtitleAr || ""} onChange={(e) => setSettings(s => ({ ...s, heroSubtitleAr: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Featured Message (EN)</Label>
                  <Textarea value={settings.featuredMessageEn || ""} onChange={(e) => setSettings(s => ({ ...s, featuredMessageEn: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Featured Message (AR)</Label>
                  <Textarea dir="rtl" value={settings.featuredMessageAr || ""} onChange={(e) => setSettings(s => ({ ...s, featuredMessageAr: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={settings.showPackages} onCheckedChange={(checked) => setSettings(s => ({ ...s, showPackages: checked }))} />
                  <Label>Show Packages</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={settings.showOrders} onCheckedChange={(checked) => setSettings(s => ({ ...s, showOrders: checked }))} />
                  <Label>Show Orders</Label>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => saveSettings.mutate(settings)}>Save</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ads">
          <Card>
            <CardHeader>
              <CardTitle>Manage Ads</CardTitle>
              <CardDescription>Create and manage dashboard ads</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title (EN)</Label>
                  <Input id="ad-title-en" />
                </div>
                <div className="space-y-2">
                  <Label>Title (AR)</Label>
                  <Input id="ad-title-ar" dir="rtl" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Image URL</Label>
                  <Input id="ad-image-url" placeholder="https://..." />
                  <div className="flex items-center gap-2 mt-2">
                    <Input id="ad-image-file" type="file" accept="image/*" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const formData = new FormData();
                        formData.append('image', file);
                        const res = await fetch(`/api/branches/${branchId}/ads/upload-image`, {
                          method: 'POST',
                          body: formData,
                          credentials: 'include',
                        });
                        if (!res.ok) throw new Error(await res.text());
                        const data = await res.json();
                        const input = document.getElementById('ad-image-url') as HTMLInputElement | null;
                        if (input) input.value = data.imageUrl;
                        toast({ title: 'Image uploaded' });
                      } catch (err: any) {
                        toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
                      }
                    }} />
                    <Button type="button" variant="outline" onClick={() => {
                      const f = document.getElementById('ad-image-file') as HTMLInputElement | null;
                      f?.click();
                    }}>Upload</Button>
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Target URL (optional)</Label>
                  <Input id="ad-target-url" placeholder="https://..." />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="space-y-1">
                  <Label>Placement</Label>
                  <Input id="ad-placement" defaultValue="dashboard_top" />
                </div>
                <div className="space-y-1">
                  <Label>Active From</Label>
                  <Input id="ad-start" type="datetime-local" />
                </div>
                <div className="space-y-1">
                  <Label>Active Until</Label>
                  <Input id="ad-end" type="datetime-local" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ad-is-active" defaultChecked />
                <Label htmlFor="ad-is-active">Active</Label>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => {
                  const titleEn = (document.getElementById('ad-title-en') as HTMLInputElement).value;
                  const titleAr = (document.getElementById('ad-title-ar') as HTMLInputElement).value;
                  const imageUrl = (document.getElementById('ad-image-url') as HTMLInputElement).value;
                  const targetUrl = (document.getElementById('ad-target-url') as HTMLInputElement).value;
                  const placement = (document.getElementById('ad-placement') as HTMLInputElement).value || 'dashboard_top';
                  const startsAt = (document.getElementById('ad-start') as HTMLInputElement).value;
                  const endsAt = (document.getElementById('ad-end') as HTMLInputElement).value;
                  const isActive = (document.getElementById('ad-is-active') as HTMLInputElement).checked;
                  if (!titleEn || !imageUrl) {
                    toast({ title: "Title and image URL are required", variant: "destructive" });
                    return;
                  }
                  createAd.mutate({ titleEn, titleAr, imageUrl, targetUrl, placement, startsAt: startsAt || undefined, endsAt: endsAt || undefined, isActive });
                }}>Create Ad</Button>
              </div>

              <div className="space-y-3">
                {ads.map((ad) => (
                  <div key={ad.id} className="flex items-start justify-between p-3 border rounded">
                    <div className="flex items-start gap-3">
                      <img src={ad.imageUrl} alt={ad.titleEn} className="w-20 h-20 object-cover rounded" />
                      <div>
                        <div className="font-medium">{ad.titleEn}</div>
                        {ad.titleAr && <div className="text-sm text-gray-600" dir="rtl">{ad.titleAr}</div>}
                        <div className="text-xs text-gray-500">Placement: {ad.placement} • {ad.isActive ? 'Active' : 'Inactive'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => updateAd.mutate({ id: ad.id, data: { isActive: !ad.isActive } })}>
                        {ad.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button variant="destructive" onClick={() => deleteAd.mutate(ad.id)}>Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CustomerDashboardManager;
