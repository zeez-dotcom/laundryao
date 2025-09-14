import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Customer } from "@shared/schema";
import { customerFormSchema, type CustomerFormInput } from "@shared/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

interface CustomerDialogProps {
  onSelectCustomer: (customer: Customer) => void;
}

export function CustomerDialog({ onSelectCustomer }: CustomerDialogProps) {
  const [open, setOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customerRes = { data: [] } } =
    useQuery<{ data: Customer[] }>({ queryKey: ["/api/customers"] });
  const customers = customerRes.data;

  const form = useForm<CustomerFormInput>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: { phoneNumber: "", name: "", nickname: "" },
  });

  const addCustomerMutation = useMutation({
    mutationFn: async (customer: CustomerFormInput) => {
      const response = await apiRequest("POST", "/api/customers", customer);
      return response.json();
    },
    onSuccess: (customer: Customer) => {
      toast({
        title: "Customer added",
        description: `${customer.name} has been added to customers`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      onSelectCustomer(customer);
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add customer",
        variant: "destructive",
      });
    },
  });

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.nickname?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    customer.phoneNumber.includes(customerSearch)
  );

  const onSubmit = (data: CustomerFormInput) => {
    addCustomerMutation.mutate({ ...data, nickname: data.nickname || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <User className="w-4 h-4 mr-2" />
          Select Customer
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar sm:w-full">
        <DialogHeader>
          <DialogTitle>Select or Add Customer</DialogTitle>
          <DialogDescription>
            Choose an existing customer or create a new one
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            placeholder="Search customers by name, nickname, or phone..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
          />

          <div className="max-h-40 overflow-y-auto space-y-2">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                onClick={() => {
                  onSelectCustomer(customer);
                  setOpen(false);
                }}
              >
                <div>
                  <p className="font-medium">
                    {customer.name}
                    {customer.nickname && (
                      <span className="text-sm text-gray-500 ml-1">
                        ({customer.nickname})
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{customer.phoneNumber}</p>
                </div>
                {parseFloat(customer.balanceDue) > 0 && (
                  <Badge variant="destructive">
                    {customer.balanceDue}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          <Separator />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <h4 className="font-medium">Add New Customer</h4>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="phone">Phone Number *</FormLabel>
                      <FormControl>
                        <Input id="phone" placeholder="Phone number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="name">Name *</FormLabel>
                      <FormControl>
                        <Input id="name" placeholder="Customer name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel htmlFor="nickname">Nickname</FormLabel>
                      <FormControl>
                        <Input id="nickname" placeholder="Nickname" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" disabled={addCustomerMutation.isPending} className="w-full">
                Add Customer
              </Button>
            </form>
          </Form>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
