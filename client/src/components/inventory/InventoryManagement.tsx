import { useRef, useState } from "react";
import { Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClothingItemsSection } from "./ClothingItemsSection";
import { ServicesSection } from "./ServicesSection";
import { InventoryChatbot } from "./InventoryChatbot";

export function InventoryManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [chatOpen, setChatOpen] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownload = async () => {
    const res = await fetch("/api/catalog/export");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErrors([]);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/catalog/bulk-upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const errors: string[] | undefined = data?.errors;
        if (errors && errors.length) {
          setUploadErrors(errors);
        } else if (data?.message) {
          setUploadErrors([data.message]);
        }
        toast({
          title: "Upload failed",
          description:
            (data?.errors && data.errors[0]) || data?.message || undefined,
          variant: "destructive",
        });
      } else {
        toast({ title: "Upload successful" });
        setUploadErrors([]);
      }
    } catch (err: any) {
      setUploadErrors([err.message]);
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="flex-1 p-6 bg-pos-background overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        <input
          type="file"
          accept=".xlsx"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Package className="h-8 w-8 text-pos-primary" />
            <h1 className="text-3xl font-bold text-gray-900">
              {t.inventoryManagement}
            </h1>
          </div>
          <div className="flex space-x-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleUploadClick} disabled={uploading}>
                  {t.uploadInventory}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <a
                  href="/api/catalog/bulk-template"
                  className="underline"
                  download
                >
                  {t.downloadTemplate}
                </a>
              </TooltipContent>
            </Tooltip>
            <Button onClick={handleDownload}>{t.downloadInventory}</Button>
            <Button onClick={() => setChatOpen((o) => !o)}>
              Chat Edit Assistant
            </Button>
          </div>
        </div>

        {uploadErrors.length > 0 && (
          <ul className="mb-6 list-disc list-inside text-sm text-red-600">
            {uploadErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}

        <Tabs defaultValue="clothing" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="clothing">Clothing Items</TabsTrigger>
            <TabsTrigger value="services">Laundry Services</TabsTrigger>
          </TabsList>

          <TabsContent value="clothing" className="space-y-4">
            <ClothingItemsSection />
          </TabsContent>

          <TabsContent value="services" className="space-y-4">
            <ServicesSection />
          </TabsContent>
        </Tabs>
      </div>
      <InventoryChatbot open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
