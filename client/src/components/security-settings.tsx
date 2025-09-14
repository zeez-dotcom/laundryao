import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import type { SecuritySettings as SecuritySettingsType, InsertSecuritySettings } from "@shared/schema";
import { Shield } from "lucide-react";

export function SecuritySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: settings } = useQuery<SecuritySettingsType>({
    queryKey: ["/api/security-settings"],
  });

  const [sessionTimeout, setSessionTimeout] = useState("15");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [passwordPolicy, setPasswordPolicy] = useState("");

  useEffect(() => {
    if (settings) {
      setSessionTimeout(settings.sessionTimeout.toString());
      setTwoFactorRequired(settings.twoFactorRequired);
      setPasswordPolicy(settings.passwordPolicy || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: InsertSecuritySettings) => {
      const res = await apiRequest("PUT", "/api/security-settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/security-settings"] });
      toast({ title: t.settingsSaved });
    },
    onError: () => {
      toast({
        title: t.error,
        description: t.failedSaveSecuritySettings,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      sessionTimeout: parseInt(sessionTimeout, 10),
      twoFactorRequired,
      passwordPolicy,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Shield className="h-5 w-5" />
          <span>{t.securitySettings}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="sessionTimeout">{t.sessionTimeoutMinutes}</Label>
          <Input
            id="sessionTimeout"
            type="number"
            value={sessionTimeout}
            onChange={(e) => setSessionTimeout(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="twoFactorRequired">{t.requireTwoFactorAuthentication}</Label>
          </div>
          <Switch
            id="twoFactorRequired"
            checked={twoFactorRequired}
            onCheckedChange={setTwoFactorRequired}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="passwordPolicy">{t.passwordPolicy}</Label>
          <Input
            id="passwordPolicy"
            value={passwordPolicy}
            onChange={(e) => setPasswordPolicy(e.target.value)}
            placeholder={t.passwordPolicyPlaceholder}
          />
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {t.saveChanges}
        </Button>
      </CardContent>
    </Card>
  );
}

export default SecuritySettings;

