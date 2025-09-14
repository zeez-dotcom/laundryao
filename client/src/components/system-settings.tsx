import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCurrency, Currency } from "@/lib/currency";
import { useTranslation, Language } from "@/lib/i18n";
import { Settings, DollarSign, Globe, Store, Percent } from "lucide-react";

export function SystemSettings() {
  const { toast } = useToast();
  const { t, language, setLanguage } = useTranslation();
  const { currency, setCurrency, getAllCurrencies, formatCurrency } = useCurrency();
  
  const [taxRate, setTaxRate] = useState(() => {
    return localStorage.getItem('taxRate') || '8.5';
  });
  
  const [companyName, setCompanyName] = useState(() => {
    return localStorage.getItem('companyName') || 'Laundry Services';
  });
  
  const [companyPhone, setCompanyPhone] = useState(() => {
    return localStorage.getItem('companyPhone') || '+965-2XXX-XXXX';
  });

  const handleSaveSettings = () => {
    localStorage.setItem('taxRate', taxRate);
    localStorage.setItem('companyName', companyName);
    localStorage.setItem('companyPhone', companyPhone);
    
    toast({
      title: t.settingsSaved,
      description: t.settingsUpdated,
    });
  };

  const currencies = getAllCurrencies();

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Settings className="h-6 w-6" />
        <h2 className="text-2xl font-bold">{t.systemSettings}</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Currency Settings */}
        <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                {t.currencySettings}
              </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">{t.defaultCurrency}</Label>
              <Select value={currency} onValueChange={(value: Currency) => setCurrency(value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t.selectCurrency} />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((curr) => (
                    <SelectItem key={curr.code} value={curr.code}>
                      <div className="flex items-center justify-between w-full">
                        <span>{curr.name}</span>
                        <span className="ml-2 text-gray-500">{curr.symbol}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500">
                {t.preview}: {formatCurrency(100)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxRate" className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                {t.taxRate}
              </Label>
              <Input
                id="taxRate"
                type="number"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="8.5"
              />
            </div>
          </CardContent>
        </Card>

        {/* Language Settings */}
        <Card>
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {t.languageLocalization}
              </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="language">{t.systemLanguage}</Label>
              <Select value={language} onValueChange={(value: Language) => setLanguage(value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t.selectLanguage} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">
                    <div className="flex items-center gap-2">
                      <span>{t.english}</span>
                      <span className="text-gray-500">🇺🇸</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ar">
                    <div className="flex items-center gap-2">
                      <span>{t.arabic}</span>
                      <span className="text-gray-500">🇰🇼</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ur">
                    <div className="flex items-center gap-2">
                      <span>{t.urdu}</span>
                      <span className="text-gray-500">🇵🇰</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Company Information */}
        <Card className="md:col-span-2">
          <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                {t.companyInformation}
              </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="companyName">{t.companyNameLabel}</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={t.laundryServices}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyPhone">{t.phoneNumber}</Label>
                <Input
                  id="companyPhone"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  placeholder="+965-2XXX-XXXX"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} className="px-8">
          {t.saveSettings}
        </Button>
      </div>
    </div>
  );
}