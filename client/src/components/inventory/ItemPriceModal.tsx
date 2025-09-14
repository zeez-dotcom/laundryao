import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClothingItem, LaundryService, insertItemServicePriceSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PricePayload {
  clothingItemId: string;
  serviceId: string;
  price: string;
}

export function ItemPriceModal() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clothingItems = [] } = useQuery({
    queryKey: ["/api/clothing-items"],
    queryFn: async () => {
      const response = await fetch("/api/clothing-items", { credentials: "include" });
      return response.json();
    },
  }) as { data: ClothingItem[] };

  const { data: services = [] } = useQuery({
    queryKey: ["/api/laundry-services"],
    queryFn: async () => {
      const response = await fetch("/api/laundry-services", { credentials: "include" });
      return response.json();
    },
  }) as { data: LaundryService[] };

  const priceForm = useForm<PricePayload>({
    resolver: zodResolver(insertItemServicePriceSchema),
    defaultValues: {
      clothingItemId: "",
      serviceId: "",
      price: "",
    },
  });

  const priceMutation = useMutation({
    mutationFn: async (data: PricePayload) => {
      const response = await apiRequest("POST", "/api/item-service-prices", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-service-prices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clothing-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/laundry-services"] });
      setOpen(false);
      priceForm.reset();
      toast({ title: "Price saved successfully" });
    },
  });

  const handlePriceSubmit = (data: PricePayload) => {
    priceMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-pos-secondary hover:bg-green-600 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Item Service Price
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Item Service Price</DialogTitle>
          <DialogDescription>
            Set the price for a clothing item and service combination
          </DialogDescription>
        </DialogHeader>
        <Form {...priceForm}>
          <form onSubmit={priceForm.handleSubmit(handlePriceSubmit)} className="space-y-4">
            <FormField
              control={priceForm.control}
              name="clothingItemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Clothing Item</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clothingItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={priceForm.control}
              name="serviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={priceForm.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit" className="bg-pos-primary hover:bg-blue-700">
              Save
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

