import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CitySelect } from "@/components/city-select";
import { Loader2, User, Phone, Lock, MapPin } from "lucide-react";
import { z } from "zod";

const registrationSchema = z.object({
  branchCode: z.string().min(1, "Branch code is required"),
  phoneNumber: z.string().min(8, "Phone number must be at least 8 digits").regex(/^[0-9+]+$/, "Invalid phone number format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(4, "Password must be at least 4 characters").max(8, "Password must be at most 8 characters"),
  confirmPassword: z.string(),
  city: z.string().min(1, "Please select a city"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  addressLabel: z.string().min(1, "Address label is required"),
  agreeToTerms: z.boolean().refine(val => val === true, "You must agree to the terms and conditions"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

interface CustomerRegistrationFormProps {
  branchCode: string;
  onSuccess: (customer: any) => void;
  onLoginRedirect: () => void;
}

export function CustomerRegistrationForm({ branchCode, onSuccess, onLoginRedirect }: CustomerRegistrationFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      branchCode,
      phoneNumber: "",
      name: "",
      password: "",
      confirmPassword: "",
      city: "",
      address: "",
      addressLabel: "Home",
      agreeToTerms: false,
    },
  });

  const registrationMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      const response = await apiRequest("POST", "/customer/register", data);
      return await response.json();
    },
    onSuccess: (customer) => {
      toast({
        title: "Registration Successful",
        description: `Welcome ${customer.name}! You are now registered and logged in.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/customer/me"] });
      onSuccess(customer);
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Unable to register. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RegistrationFormData) => {
    registrationMutation.mutate(data);
  };

  const nextStep = () => {
    if (step === 1) {
      // Validate first step fields
      form.trigger(["phoneNumber", "name", "password", "confirmPassword"]).then(isValid => {
        if (isValid) setStep(2);
      });
    } else {
      // Final submission
      form.handleSubmit(onSubmit)();
    }
  };

  const prevStep = () => {
    setStep(Math.max(1, step - 1));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-blue-100 dark:bg-blue-900/20 p-3 rounded-full w-fit">
            <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Step {step} of 2 - Join us and start ordering!
          </p>
          <div className="flex space-x-2 justify-center">
            <div className={`h-2 w-8 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-gray-200'}`} />
            <div className={`h-2 w-8 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
          </div>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {step === 1 && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center space-x-2">
                          <Phone className="h-4 w-4" />
                          <span>Mobile Number</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="tel"
                            placeholder="e.g., +96512345678 or 12345678"
                            className="text-lg"
                            data-testid="input-phone"
                          />
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
                        <FormLabel className="flex items-center space-x-2">
                          <User className="h-4 w-4" />
                          <span>Full Name</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter your full name"
                            className="text-lg"
                            data-testid="input-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center space-x-2">
                            <Lock className="h-4 w-4" />
                            <span>PIN</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder="4-8 digits"
                              className="text-lg text-center"
                              maxLength={8}
                              data-testid="input-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm PIN</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder="Repeat PIN"
                              className="text-lg text-center"
                              maxLength={8}
                              data-testid="input-confirm-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4" />
                          <span>City/Area</span>
                        </FormLabel>
                        <FormControl>
                          <CitySelect
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="addressLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Label</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., Home, Office, etc."
                            data-testid="input-address-label"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Address</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Street, building, apartment details"
                            className="min-h-[60px]"
                            data-testid="input-address"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="agreeToTerms"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-terms"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm">
                            I agree to the Terms and Conditions
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            By creating an account, you agree to our privacy policy and terms of service.
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <div className="flex space-x-3">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prevStep}
                    className="flex-1"
                    data-testid="button-previous"
                  >
                    Previous
                  </Button>
                )}
                
                <Button
                  type="button"
                  onClick={step === 2 ? form.handleSubmit(onSubmit) : nextStep}
                  disabled={registrationMutation.isPending}
                  className="flex-1"
                  data-testid={step === 2 ? "button-register" : "button-next"}
                >
                  {registrationMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {step === 2 ? "Create Account" : "Next"}
                </Button>
              </div>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={onLoginRedirect}
                    className="text-blue-600 hover:underline font-medium"
                    data-testid="link-login"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}