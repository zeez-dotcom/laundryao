import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuthContext } from "@/context/AuthContext";
import { 
  Palette, 
  Type, 
  Contact, 
  Settings, 
  Upload,
  Eye,
  Save,
  RefreshCw
} from "lucide-react";

type BranchCustomization = {
  id: string;
  branchId: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  headerText: string;
  subHeaderText?: string;
  footerText: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  deliveryPolicy?: string;
  returnPolicy?: string;
  socialMediaLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    whatsapp?: string;
  };
  customCss?: string;
  enableGuestCheckout: boolean;
  requireAddressForGuests: boolean;
  createdAt: string;
  updatedAt: string;
};

export function BranchCustomizationManager() {
  const { user, branch } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const branchId = branch?.id || "";

  const [formData, setFormData] = useState<Partial<BranchCustomization>>({
    logoUrl: "",
    primaryColor: "#1976d2",
    secondaryColor: "#dc004e",
    headerText: "Welcome to Our Laundry Service",
    subHeaderText: "",
    footerText: "Thank you for choosing our service",
    contactPhone: "",
    contactEmail: "",
    address: "",
    deliveryPolicy: "",
    returnPolicy: "",
    socialMediaLinks: {
      facebook: "",
      instagram: "",
      twitter: "",
      whatsapp: "",
    },
    customCss: "",
    enableGuestCheckout: true,
    requireAddressForGuests: true,
  });

  const { data: customization, isLoading } = useQuery<BranchCustomization>({
    queryKey: [`/api/branches/${branchId}/customization`],
    enabled: !!branchId,
  });

  useEffect(() => {
    if (customization) {
      setFormData(customization);
    }
  }, [customization]);

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<BranchCustomization>) => {
      const response = await apiRequest("PUT", `/api/branches/${branchId}/customization`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings saved successfully",
        description: "Your branch customization has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/branches/${branchId}/customization`] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSocialMediaChange = (platform: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      socialMediaLinks: {
        ...prev.socialMediaLinks,
        [platform]: value,
      },
    }));
  };

  if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">
            Access denied. Only administrators can manage branch customization.
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
            <Settings className="h-5 w-5" />
            Branch Customization
          </CardTitle>
          <CardDescription>
            Customize your branch's customer-facing interface including branding, contact information, and policies.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="branding" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-2">
            <Type className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="contact" className="flex items-center gap-2">
            <Contact className="h-4 w-4" />
            Contact
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visual Branding</CardTitle>
              <CardDescription>
                Customize colors, logo, and visual elements for your branch
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input
                    id="logoUrl"
                    placeholder="https://example.com/logo.png"
                    value={formData.logoUrl || ""}
                    onChange={(e) => handleInputChange("logoUrl", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={formData.primaryColor || "#1976d2"}
                      onChange={(e) => handleInputChange("primaryColor", e.target.value)}
                      className="w-16 h-10"
                    />
                    <Input
                      value={formData.primaryColor || "#1976d2"}
                      onChange={(e) => handleInputChange("primaryColor", e.target.value)}
                      placeholder="#1976d2"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondaryColor">Secondary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="secondaryColor"
                    type="color"
                    value={formData.secondaryColor || "#dc004e"}
                    onChange={(e) => handleInputChange("secondaryColor", e.target.value)}
                    className="w-16 h-10"
                  />
                  <Input
                    value={formData.secondaryColor || "#dc004e"}
                    onChange={(e) => handleInputChange("secondaryColor", e.target.value)}
                    placeholder="#dc004e"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customCss">Custom CSS</Label>
                <Textarea
                  id="customCss"
                  placeholder="/* Add custom CSS styles here */"
                  value={formData.customCss || ""}
                  onChange={(e) => handleInputChange("customCss", e.target.value)}
                  rows={6}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Page Content</CardTitle>
              <CardDescription>
                Customize text content displayed to customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="headerText">Header Text</Label>
                <Input
                  id="headerText"
                  placeholder="Welcome to Our Laundry Service"
                  value={formData.headerText || ""}
                  onChange={(e) => handleInputChange("headerText", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subHeaderText">Sub Header Text</Label>
                <Input
                  id="subHeaderText"
                  placeholder="Professional laundry services you can trust"
                  value={formData.subHeaderText || ""}
                  onChange={(e) => handleInputChange("subHeaderText", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="footerText">Footer Text</Label>
                <Input
                  id="footerText"
                  placeholder="Thank you for choosing our service"
                  value={formData.footerText || ""}
                  onChange={(e) => handleInputChange("footerText", e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="deliveryPolicy">Delivery Policy</Label>
                  <Textarea
                    id="deliveryPolicy"
                    placeholder="Describe your delivery terms and conditions..."
                    value={formData.deliveryPolicy || ""}
                    onChange={(e) => handleInputChange("deliveryPolicy", e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returnPolicy">Return Policy</Label>
                  <Textarea
                    id="returnPolicy"
                    placeholder="Describe your return and refund policy..."
                    value={formData.returnPolicy || ""}
                    onChange={(e) => handleInputChange("returnPolicy", e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>
                Provide contact details and social media links
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    placeholder="+965 1234 5678"
                    value={formData.contactPhone || ""}
                    onChange={(e) => handleInputChange("contactPhone", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    placeholder="info@yourlaundry.com"
                    value={formData.contactEmail || ""}
                    onChange={(e) => handleInputChange("contactEmail", e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  placeholder="Your full business address..."
                  value={formData.address || ""}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-3">
                <Label>Social Media Links</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="facebook">Facebook</Label>
                    <Input
                      id="facebook"
                      placeholder="https://facebook.com/yourpage"
                      value={formData.socialMediaLinks?.facebook || ""}
                      onChange={(e) => handleSocialMediaChange("facebook", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instagram">Instagram</Label>
                    <Input
                      id="instagram"
                      placeholder="https://instagram.com/yourpage"
                      value={formData.socialMediaLinks?.instagram || ""}
                      onChange={(e) => handleSocialMediaChange("instagram", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twitter">Twitter</Label>
                    <Input
                      id="twitter"
                      placeholder="https://twitter.com/yourpage"
                      value={formData.socialMediaLinks?.twitter || ""}
                      onChange={(e) => handleSocialMediaChange("twitter", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      placeholder="+965 1234 5678"
                      value={formData.socialMediaLinks?.whatsapp || ""}
                      onChange={(e) => handleSocialMediaChange("whatsapp", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Settings</CardTitle>
              <CardDescription>
                Configure customer experience options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="enableGuestCheckout">Enable Guest Checkout</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow customers to place orders without creating an account
                  </p>
                </div>
                <Switch
                  id="enableGuestCheckout"
                  checked={formData.enableGuestCheckout || false}
                  onCheckedChange={(checked) => handleInputChange("enableGuestCheckout", checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="requireAddressForGuests">Require Address for Guests</Label>
                  <p className="text-sm text-muted-foreground">
                    Make address collection mandatory for guest checkout
                  </p>
                </div>
                <Switch
                  id="requireAddressForGuests"
                  checked={formData.requireAddressForGuests || false}
                  onCheckedChange={(checked) => handleInputChange("requireAddressForGuests", checked)}
                  disabled={!formData.enableGuestCheckout}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="p-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-muted-foreground">
                Save your changes to apply the new customization settings
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setFormData(customization || {})}
                disabled={!customization}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending || isLoading}
              >
                {updateMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}