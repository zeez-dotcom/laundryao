import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, Send, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
}

interface Option {
  label: string;
  value: string;
  imageUrl?: string;
}

interface InventoryChatbotProps {
  open: boolean;
  onClose: () => void;
}

export function InventoryChatbot({ open, onClose }: InventoryChatbotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [step, setStep] = useState<
    | "type"
    | "entry"
    | "field"
    | "service"
    | "imageMode"
    | "input"
    | "confirm"
    | "addCategory"
  >("type");
  const [selectedType, setSelectedType] = useState<"item" | "service" | null>(
    null,
  );
  const [entries, setEntries] = useState<any[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);
  const [selectedField, setSelectedField] = useState<
    "image" | "name" | "price" | null
  >(null);
  const [services, setServices] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<any | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [imageInputMode, setImageInputMode] = useState<
    "upload" | "link" | null
  >(null);
  const [addMode, setAddMode] = useState<"item" | "service" | null>(null);
  const [addField, setAddField] = useState<
    "name" | "price" | "category" | "image" | null
  >(null);
  const [addData, setAddData] = useState<any>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [show, setShow] = useState(open);

  useEffect(() => {
    if (open) setShow(true);
  }, [open]);

  const handleAnimationEnd = () => {
    if (!open) setShow(false);
  };

  useEffect(() => {
    if (open) {
      setMessages([
        { role: "assistant", content: "What would you like to do?" },
      ]);
      setOptions([
        { label: "Clothing Item", value: "item" },
        { label: "Service", value: "service" },
        { label: "Add Clothing Item", value: "addItem" },
        { label: "Add Service", value: "addService" },
      ]);
      setStep("type");
      setSelectedType(null);
      setEntries([]);
      setSelectedEntry(null);
      setSelectedField(null);
      setSelectedService(null);
      setInputValue("");
      setFile(null);
      setImageInputMode(null);
      setAddMode(null);
      setAddField(null);
      setAddData({});
    }
  }, [open]);

  const handleOptionClick = async (value: string) => {
    if (step === "type") {
      if (value === "addItem" || value === "addService") {
        const isItem = value === "addItem";
        setAddMode(isItem ? "item" : "service");
        setAddField("name");
        setAddData({});
        setMessages((m) => [
          ...m,
          { role: "user", content: isItem ? "Add Clothing Item" : "Add Service" },
          { role: "assistant", content: "Enter name" },
        ]);
        setOptions([]);
        setStep("input");
      } else {
        setSelectedType(value as "item" | "service");
        setMessages((m) => [
          ...m,
          { role: "user", content: value === "item" ? "Clothing Item" : "Service" },
        ]);
        try {
          const url =
            value === "item" ? "/api/clothing-items" : "/api/laundry-services";
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error();
          const data = await res.json();
          setEntries(data);
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Select an entry" },
          ]);
          setOptions(
            data.map((e: any) => ({
              label: e.name,
              value: e.id,
              imageUrl: e.imageUrl,
            })),
          );
          setStep("entry");
        } catch {
          toast({ title: "Failed to load entries", variant: "destructive" });
        }
      }
    } else if (step === "entry") {
      const entry = entries.find((e) => e.id === value);
      setSelectedEntry(entry);
      setMessages((m) => [...m, { role: "user", content: entry.name }, { role: "assistant", content: "Which field would you like to edit?" }]);
      const fieldOptions: Option[] = [
        { label: "Image", value: "image" },
        { label: "Name", value: "name" },
        { label: "Price", value: "price" },
      ];
      setOptions(fieldOptions);
      setStep("field");
    } else if (step === "field") {
      setSelectedField(value as any);
      setImageInputMode(null);
      setMessages((m) => [...m, { role: "user", content: value }]);
      if (value === "price" && selectedType === "item") {
        try {
          const res = await fetch(
            `/api/clothing-items/${selectedEntry.id}/services`,
            { credentials: "include" },
          );
          if (!res.ok) throw new Error();
          const svcData = await res.json();
          setServices(svcData);
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Select service" },
          ]);
          setOptions(
            svcData.map((s: any) => ({
              label: s.name,
              value: s.id,
              imageUrl: s.imageUrl,
            })),
          );
          setStep("service");
        } catch {
          toast({ title: "Failed to load services", variant: "destructive" });
        }
      } else if (value === "image") {
        const currentMessage: Message = {
          role: "assistant",
          content: "Current image:",
          imageUrl: selectedEntry.imageUrl,
        };
        setMessages((m) => [
          ...m,
          currentMessage,
          { role: "assistant", content: "How would you like to provide the new image?" },
        ]);
        setOptions([
          { label: "Upload", value: "upload" },
          { label: "Link", value: "link" },
        ]);
        setImageInputMode(null);
        setStep("imageMode");
      } else {
        let currentMessage: Message | null = null;
        if (value === "name") {
          currentMessage = {
            role: "assistant",
            content: `Current name: ${selectedEntry.name}`,
          };
        } else if (value === "price" && selectedType === "service") {
          currentMessage = {
            role: "assistant",
            content: `Current price: ${selectedEntry.price}`,
          };
        }
        setMessages((m) => [
          ...m,
          ...(currentMessage ? [currentMessage] : []),
          { role: "assistant", content: `Enter new ${value}` },
        ]);
        setOptions([]);
        setStep("input");
      }
    } else if (step === "imageMode") {
      setImageInputMode(value as "upload" | "link");
      setMessages((m) => [
        ...m,
        { role: "user", content: value === "upload" ? "Upload" : "Link" },
        {
          role: "assistant",
          content:
            value === "upload"
              ? "Please upload an image file"
              : "Enter image URL",
        },
      ]);
      setInputValue("");
      setFile(null);
      setOptions([]);
      setStep("input");
    } else if (step === "service") {
      const svc = services.find((s) => s.id === value);
      setSelectedService(svc);
      const currentPrice = svc.itemPrice ?? svc.price;
      setMessages((m) => [
        ...m,
        { role: "user", content: svc.name },
        {
          role: "assistant",
          content: `Current price for ${svc.name}: ${currentPrice}`,
        },
        { role: "assistant", content: "Enter new price" },
      ]);
      setOptions([]);
      setStep("input");
    } else if (step === "addCategory") {
      const option = options.find((o) => o.value === value);
      setMessages((m) => [
        ...m,
        { role: "user", content: option?.label || "" },
      ]);
      if (addMode === "item") {
        setAddData((d: any) => ({ ...d, categoryId: value }));
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "How would you like to provide the image?" },
        ]);
        setOptions([
          { label: "Upload", value: "upload" },
          { label: "Link", value: "link" },
        ]);
        setImageInputMode(null);
        setAddField("image");
        setStep("imageMode");
      } else if (addMode === "service") {
        const payload = { ...addData, categoryId: value };
        try {
          const res = await fetch("/api/laundry-services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const message = data?.message || "Failed to add service";
            setMessages((m) => [...m, { role: "assistant", content: message }]);
            toast({ title: message, variant: "destructive" });
          } else {
            await queryClient.invalidateQueries({
              queryKey: ["/api/laundry-services"],
            });
            const confirmRes = await fetch("/api/laundry-services", {
              credentials: "include",
            });
            const list = await confirmRes.json();
            const exists = list.some((s: any) => s.id === data.id);
            const message = exists
              ? "Service added. Add another?"
              : "Failed to verify service. Add another?";
            setMessages((m) => [...m, { role: "assistant", content: message }]);
            toast({
              title: exists ? "Service added" : "Service addition failed",
              variant: exists ? undefined : "destructive",
            });
          }
          setOptions([
            { label: "Yes", value: "yes" },
            { label: "No", value: "no" },
          ]);
          setStep("confirm");
        } catch {
          toast({ title: "Failed to add service", variant: "destructive" });
        }
        setAddMode(null);
        setAddField(null);
        setAddData({});
        setInputValue("");
        setFile(null);
        setImageInputMode(null);
      }
    } else if (step === "confirm") {
      if (value === "yes") {
        setMessages([
          { role: "assistant", content: "What would you like to do?" },
        ]);
        setOptions([
          { label: "Clothing Item", value: "item" },
          { label: "Service", value: "service" },
          { label: "Add Clothing Item", value: "addItem" },
          { label: "Add Service", value: "addService" },
        ]);
        setStep("type");
        setSelectedType(null);
        setEntries([]);
        setSelectedEntry(null);
        setSelectedField(null);
        setSelectedService(null);
        setInputValue("");
        setFile(null);
        setImageInputMode(null);
        setAddMode(null);
        setAddField(null);
        setAddData({});
      } else {
        onClose();
      }
    }
  };

const fileToDataUrl = (f: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
};

const handleAddSubmit = async () => {
    if (!addMode || !addField) return;
    if (addField === "name") {
      setMessages((m) => [...m, { role: "user", content: inputValue }]);
      setAddData((d: any) => ({ ...d, name: inputValue }));
      if (addMode === "service") {
        setMessages((m) => [...m, { role: "assistant", content: "Enter price" }]);
        setAddField("price");
        setInputValue("");
      } else {
        try {
          const res = await fetch("/api/categories?type=clothing", {
            credentials: "include",
          });
          if (!res.ok) throw new Error();
          const cats = await res.json();
          setMessages((m) => [
            ...m,
            { role: "assistant", content: "Select category" },
          ]);
          setOptions(cats.map((c: any) => ({ label: c.name, value: c.id })));
          setStep("addCategory");
          setAddField("category");
        } catch {
          toast({ title: "Failed to load categories", variant: "destructive" });
        }
        setInputValue("");
      }
    } else if (addField === "price") {
      setMessages((m) => [...m, { role: "user", content: inputValue }]);
      setAddData((d: any) => ({ ...d, price: inputValue }));
      try {
        const res = await fetch("/api/categories?type=service", {
          credentials: "include",
        });
        if (!res.ok) throw new Error();
        const cats = await res.json();
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "Select category" },
        ]);
        setOptions(cats.map((c: any) => ({ label: c.name, value: c.id })));
        setStep("addCategory");
        setAddField("category");
      } catch {
        toast({ title: "Failed to load categories", variant: "destructive" });
      }
      setInputValue("");
    } else if (addField === "image") {
      let payload: any = { ...addData };
      if (imageInputMode === "link") payload.imageUrl = inputValue;
      else if (imageInputMode === "upload" && file)
        payload.imageUrl = await fileToDataUrl(file);
      try {
        const res = await fetch("/api/clothing-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message = data?.message || "Failed to add item";
          setMessages((m) => [...m, { role: "assistant", content: message }]);
          toast({ title: message, variant: "destructive" });
        } else {
          await queryClient.invalidateQueries({
            queryKey: ["/api/clothing-items"],
          });
          const confirmRes = await fetch("/api/clothing-items", {
            credentials: "include",
          });
          const list = await confirmRes.json();
          const exists = list.some((i: any) => i.id === data.id);
          const message = exists
            ? "Item added. Add another?"
            : "Failed to verify item. Add another?";
          setMessages((m) => [...m, { role: "assistant", content: message }]);
          toast({
            title: exists ? "Item added" : "Item addition failed",
            variant: exists ? undefined : "destructive",
          });
        }
        setOptions([
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ]);
        setStep("confirm");
      } catch {
        toast({ title: "Failed to add item", variant: "destructive" });
      }
      setAddMode(null);
      setAddField(null);
      setAddData({});
      setInputValue("");
      setFile(null);
      setImageInputMode(null);
    }
  };

  const handleSubmit = async () => {
    if (addMode) {
      await handleAddSubmit();
      return;
    }
    if (!selectedEntry || !selectedField || !selectedType) return;
    try {
      let res: Response | null = null;
      let data: any = null;
      if (selectedType === "item") {
        if (selectedField === "name" || selectedField === "image") {
          const body: any = {};
          if (selectedField === "name") body.name = inputValue;
          if (selectedField === "image") {
            if (imageInputMode === "link") {
              body.imageUrl = inputValue;
            } else if (imageInputMode === "upload" && file) {
              body.imageUrl = await fileToDataUrl(file);
            }
          }
          res = await fetch(`/api/clothing-items/${selectedEntry.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
          });
          data = await res.json().catch(() => ({}));
        } else if (selectedField === "price" && selectedService) {
          const method = selectedService.itemPrice ? "PUT" : "POST";
          res = await fetch("/api/item-service-prices", {
            method,
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              clothingItemId: selectedEntry.id,
              serviceId: selectedService.id,
              price: inputValue.toString(),
            }),
          });
          data = await res.json().catch(() => ({}));
          if (res.status === 409) {
            const message =
              data?.message ||
              "A price for this service already exists.";
            setMessages((m) => [
              ...m,
              { role: "assistant", content: message },
            ]);
            toast({ title: message, variant: "destructive" });
            return;
          }
          if (res.ok) {
            const refreshRes = await fetch(
              `/api/clothing-items/${selectedEntry.id}/services`,
              { credentials: "include" },
            );
            if (refreshRes.ok) {
              const updatedServices = await refreshRes.json();
              setServices(updatedServices);
              const updated = updatedServices.find(
                (s: any) => s.id === selectedService.id,
              );
              if (updated) setSelectedService(updated);
            }
          }
        }
      } else if (selectedType === "service") {
        if (selectedField === "image") {
          setMessages((m) => [
            ...m,
            {
              role: "assistant",
              content: "Services do not have an image field.",
            },
          ]);
          setOptions([
            { label: "Name", value: "name" },
            { label: "Price", value: "price" },
          ]);
          setStep("field");
          return;
        }
        const body: any = {};
        body[selectedField] =
          selectedField === "price" ? parseFloat(inputValue) : inputValue;
        res = await fetch(`/api/laundry-services/${selectedEntry.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        data = await res.json().catch(() => ({}));
      }
      if (!res) return;
      if (!res.ok) {
        const message = data?.message || "Update failed";
        setMessages((m) => [...m, { role: "assistant", content: message }]);
        toast({ title: message, variant: "destructive" });
        return;
      }
      toast({ title: "Updated" });
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Update saved. Edit something else?" },
      ]);
      setOptions([
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ]);
      setStep("confirm");
      setInputValue("");
      setFile(null);
      setImageInputMode(null);
    } catch (err: any) {
      toast({
        title: err?.message || "Update failed",
        variant: "destructive",
      });
    }
  };

  if (!show) return null;

  return (
    <div
      onAnimationEnd={handleAnimationEnd}
      className={`fixed bottom-4 right-4 z-50 flex w-full max-w-md flex-col rounded-lg border bg-background shadow-lg transition-all sm:max-w-lg ${
        open
          ? "animate-in fade-in slide-in-from-bottom-2 zoom-in-95"
          : "animate-out fade-out slide-out-to-bottom-2 zoom-out-95"
      }`}
    >
      <div className="flex items-center justify-between p-3 border-b">
        <h4 className="font-semibold">Chat Edit Assistant</h4>
        <button type="button" onClick={onClose} className="text-sm">
          ×
        </button>
      </div>
      <div className="flex-1 p-4">
        <div className="min-h-[200px] max-h-[60vh] overflow-y-auto space-y-4 custom-scrollbar">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <Avatar className="h-6 w-6">
                  <AvatarFallback>
                    <Bot className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-muted" : "bg-primary/10"
                }`}
              >
                <div>{m.content}</div>
                {m.imageUrl && (
                  <img
                    src={m.imageUrl}
                    alt="current"
                    className="mt-2 max-h-40 rounded"
                  />
                )}
              </div>
              {m.role === "user" && (
                <Avatar className="h-6 w-6">
                  <AvatarFallback>
                    <User className="h-3 w-3" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
        </div>
      </div>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 border-t">
          {options.map((o) => (
            <Button
              key={o.value}
              size="sm"
              onClick={() => void handleOptionClick(o.value)}
              className="flex items-center gap-2"
            >
              {o.imageUrl && (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={o.imageUrl} />
                  <AvatarFallback>{o.label.charAt(0)}</AvatarFallback>
                </Avatar>
              )}
              {o.label}
            </Button>
          ))}
        </div>
      )}
      {step === "input" && (
        <div className="flex items-end gap-2 p-3 border-t">
          {(selectedField === "image" || (addMode && addField === "image")) &&
          imageInputMode === "upload" ? (
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          ) : (
            <Textarea
              className="flex-1 min-h-[40px] resize-none text-sm"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          )}
          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={
              selectedField === "image" || (addMode && addField === "image")
                ? imageInputMode === "upload"
                  ? !file
                  : imageInputMode === "link"
                    ? !inputValue
                    : true
                : !inputValue
            }
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Submit</span>
          </Button>
        </div>
      )}
    </div>
  );
}

