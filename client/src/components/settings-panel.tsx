import { useState, type ChangeEvent } from "react";
import { Settings, Save, User, DollarSign, Receipt, Bell, Shield, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/context/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { SecuritySettings } from "./security-settings";
import { ProfileSettings } from "./profile-settings";
import { PackageList } from "./package-list";
import PackageChatbot from "./PackageChatbot";
// Removed branch update mutation in favor of centralized BranchSettings
import type { InsertBranch } from "@shared/schema";

export function SettingsPanel() {
  const { t } = useTranslation();
  const { branch, isAdmin, isSuperAdmin } = useAuthContext();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    email: "info@mainstore.com",
    taxRate: "8.5",
    currency: "USD",

    // Receipt Settings
    receiptHeaderEn: "Thank you for your business!",
    receiptHeaderAr: "",
    receiptFooterEn: "Visit us again soon",
    receiptFooterAr: "",
    printLogo: true,

    // System Settings
    autoLogout: "30",
    enableNotifications: true,
    soundEffects: true,

    // Pricing Settings
    roundingMethod: "nearest",
    minimumOrder: "0",

    // Appearance
    theme: "light",
    primaryColor: "#3b82f6",
    compactMode: false,

    // Business
    tagline: localStorage.getItem("companyTagline") || branch?.tagline || "",
    logoUrl: branch?.logoUrl || "",
  });
  const [logoPreview, setLogoPreview] = useState(
    branch?.logoUrl || ""
  );
  const [showChatbot, setShowChatbot] = useState(false);

  const { toast } = useToast();

  const hasAdminAccess = isAdmin || isSuperAdmin;

  const handleSettingChange = (key: string, value: string | boolean | number) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!branch) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
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
      setSettings(prev => ({ ...prev, logoUrl: data.logoUrl }));
      setLogoPreview(data.logoUrl);
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

  const saveSettings = async () => {
    const receiptSettings = {
      receiptHeaderEn: settings.receiptHeaderEn,
      receiptHeaderAr: settings.receiptHeaderAr,
      receiptFooterEn: settings.receiptFooterEn,
      receiptFooterAr: settings.receiptFooterAr,
      printLogo: settings.printLogo,
    };
    localStorage.setItem("laundrySettings", JSON.stringify(receiptSettings));
    if (settings.tagline) {
      localStorage.setItem("companyTagline", settings.tagline);
    } else {
      localStorage.removeItem("companyTagline");
    }
    try {
      if (branch) {
        const updates: Partial<InsertBranch> = {};
        if (settings.tagline !== (branch.tagline || "")) {
          updates.tagline = settings.tagline;
        }
        if (settings.logoUrl && settings.logoUrl !== branch.logoUrl) {
          updates.logoUrl = settings.logoUrl;
        }
        if (Object.keys(updates).length > 0) {
          const res = await apiRequest("PUT", `/api/branches/${branch.id}`, updates);
          await res.json();
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }
      }
      toast({
        title: t.settingsSaved,
        description: t.preferencesUpdated,
      });
    } catch (error: any) {
      toast({
        title: "Error updating branch",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetSettings = () => {
    localStorage.removeItem("laundrySettings");
    localStorage.removeItem("companyTagline");
    setSettings({
      email: "info@mainstore.com",
      taxRate: "8.5",
      currency: "USD",
      receiptHeaderEn: "Thank you for your business!",
      receiptHeaderAr: "",
      receiptFooterEn: "Visit us again soon",
      receiptFooterAr: "",
      printLogo: true,
      autoLogout: "30",
      enableNotifications: true,
      soundEffects: true,
      roundingMethod: "nearest",
      minimumOrder: "0",
      theme: "light",
      primaryColor: "#3b82f6",
      compactMode: false,
      tagline: "",
      logoUrl: "",
    });
    setLogoPreview("");
    toast({
      title: t.settingsReset,
      description: t.settingsRestored
    });
  };

  return (
    <div className="flex-1 p-6 bg-pos-background">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Settings className="h-8 w-8 text-pos-primary" />
            <h1 className="text-3xl font-bold text-gray-900">{t.systemSettings}</h1>
          </div>

          <div className="flex space-x-3">
            <Button variant="outline" onClick={resetSettings}>
              {t.resetToDefaults}
            </Button>
            <Button onClick={saveSettings} className="bg-pos-secondary hover:bg-green-600">
              <Save className="h-4 w-4 mr-2" />
              {t.saveChanges}
            </Button>
          </div>
        </div>

        <Tabs
          defaultValue={hasAdminAccess ? "business" : "profile"}
          className="space-y-6"
        >
          <TabsList
            className={cn(
              "grid w-full",
              hasAdminAccess ? "grid-cols-8" : "grid-cols-4"
            )}
          >
            <TabsTrigger value="profile">{t.profile}</TabsTrigger>
            {hasAdminAccess && <TabsTrigger value="business">{t.business}</TabsTrigger>}
            {hasAdminAccess && <TabsTrigger value="receipts">{t.receipts}</TabsTrigger>}
            <TabsTrigger value="system">{t.system}</TabsTrigger>
            {hasAdminAccess && <TabsTrigger value="pricing">{t.pricing}</TabsTrigger>}
            <TabsTrigger value="appearance">{t.appearance}</TabsTrigger>
            {hasAdminAccess && <TabsTrigger value="security">{t.security}</TabsTrigger>}
            <TabsTrigger value="packages">{t.packages}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <ProfileSettings />
          </TabsContent>

          {hasAdminAccess && (
            <TabsContent value="business" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <User className="h-5 w-5" />
                    <span>{t.businessInformation}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{t.emailAddress}</Label>
                      <Input
                        id="email"
                        type="email"
                        value={settings.email}
                        onChange={(e) =>
                          handleSettingChange("email", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">{t.currency}</Label>
                      <Select
                        value={settings.currency}
                        onValueChange={(value) =>
                          handleSettingChange("currency", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">{t.usDollar}</SelectItem>
                          <SelectItem value="EUR">{t.euro}</SelectItem>
                          <SelectItem value="GBP">{t.britishPound}</SelectItem>
                          <SelectItem value="CAD">{t.canadianDollar}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="tagline">{t.tagline}</Label>
                      <Input
                        id="tagline"
                        value={settings.tagline}
                        onChange={(e) =>
                          handleSettingChange("tagline", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="logo">{t.logo}</Label>
                      <Input
                        id="logo"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                      />
                      {logoPreview && (
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="h-20 object-contain"
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {hasAdminAccess && (
            <TabsContent value="receipts" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Receipt className="h-5 w-5" />
                    <span>{t.receiptConfiguration}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="receiptHeaderEn">
                      {t.receiptHeaderMessage} ({t.english})
                    </Label>
                    <Input
                      id="receiptHeaderEn"
                      value={settings.receiptHeaderEn}
                      onChange={(e) =>
                        handleSettingChange('receiptHeaderEn', e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="receiptHeaderAr">
                      {t.receiptHeaderMessage} ({t.arabic})
                    </Label>
                    <Input
                      id="receiptHeaderAr"
                      value={settings.receiptHeaderAr}
                      onChange={(e) =>
                        handleSettingChange('receiptHeaderAr', e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="receiptFooterEn">
                      {t.receiptFooterMessage} ({t.english})
                    </Label>
                    <Input
                      id="receiptFooterEn"
                      value={settings.receiptFooterEn}
                      onChange={(e) =>
                        handleSettingChange('receiptFooterEn', e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="receiptFooterAr">
                      {t.receiptFooterMessage} ({t.arabic})
                    </Label>
                    <Input
                      id="receiptFooterAr"
                      value={settings.receiptFooterAr}
                      onChange={(e) =>
                        handleSettingChange('receiptFooterAr', e.target.value)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t.printBusinessLogo}</Label>
                      <div className="text-sm text-gray-600">
                        {t.includeLogoPrintedReceipts}
                      </div>
                    </div>
                    <Switch
                      checked={settings.printLogo}
                      onCheckedChange={(checked) =>
                        handleSettingChange('printLogo', checked)
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <span>{t.systemPreferences}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="autoLogout">{t.autoLogoutMinutes}</Label>
                    <Select 
                      value={settings.autoLogout} 
                      onValueChange={(value) => handleSettingChange('autoLogout', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">{t.minutes15}</SelectItem>
                        <SelectItem value="30">{t.minutes30}</SelectItem>
                        <SelectItem value="60">{t.oneHour}</SelectItem>
                        <SelectItem value="120">{t.twoHours}</SelectItem>
                        <SelectItem value="never">{t.never}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t.enableNotifications}</Label>
                      <div className="text-sm text-gray-600">{t.showSystemNotificationsAlerts}</div>
                    </div>
                    <Switch
                      checked={settings.enableNotifications}
                      onCheckedChange={(checked) => handleSettingChange('enableNotifications', checked)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>{t.soundEffects}</Label>
                      <div className="text-sm text-gray-600">{t.playSoundsForClicks}</div>
                    </div>
                    <Switch
                      checked={settings.soundEffects}
                      onCheckedChange={(checked) => handleSettingChange('soundEffects', checked)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {hasAdminAccess && (
            <TabsContent value="pricing" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <DollarSign className="h-5 w-5" />
                    <span>{t.pricingTaxSettings}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="taxRate">{t.taxRate}</Label>
                      <Input
                        id="taxRate"
                        type="number"
                        step="0.1"
                        value={settings.taxRate}
                        onChange={(e) =>
                          handleSettingChange('taxRate', e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="minimumOrder">{t.minimumOrderAmount}</Label>
                      <Input
                        id="minimumOrder"
                        type="number"
                        step="0.01"
                        value={settings.minimumOrder}
                        onChange={(e) =>
                          handleSettingChange('minimumOrder', e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t.priceRoundingMethod}</Label>
                    <Select
                      value={settings.roundingMethod}
                      onValueChange={(value) =>
                        handleSettingChange('roundingMethod', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nearest">{t.roundToNearestCent}</SelectItem>
                        <SelectItem value="up">{t.alwaysRoundUp}</SelectItem>
                        <SelectItem value="down">{t.alwaysRoundDown}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Palette className="h-5 w-5" />
                  <span>{t.appearanceSettings}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t.theme}</Label>
                    <Select 
                      value={settings.theme} 
                      onValueChange={(value) => handleSettingChange('theme', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">{t.lightTheme}</SelectItem>
                        <SelectItem value="dark">{t.darkTheme}</SelectItem>
                        <SelectItem value="auto">{t.autoSystem}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">{t.primaryColor}</Label>
                    <div className="flex space-x-2">
                      <Input
                        id="primaryColor"
                        type="color"
                        value={settings.primaryColor}
                        onChange={(e) => handleSettingChange('primaryColor', e.target.value)}
                        className="w-16 h-10"
                      />
                      <Input
                        value={settings.primaryColor}
                        onChange={(e) => handleSettingChange('primaryColor', e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t.compactMode}</Label>
                    <div className="text-sm text-gray-600">{t.useSmallerSpacingFonts}</div>
                  </div>
                  <Switch
                    checked={settings.compactMode}
                    onCheckedChange={(checked) => handleSettingChange('compactMode', checked)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {hasAdminAccess && (
            <TabsContent value="security" className="space-y-6">
              <SecuritySettings />
            </TabsContent>
          )}
          <TabsContent value="packages" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => setShowChatbot(prev => !prev)}>
                Package Assistant
              </Button>
            </div>
            <PackageList />
            <PackageChatbot
              open={showChatbot}
              onClose={() => setShowChatbot(false)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
