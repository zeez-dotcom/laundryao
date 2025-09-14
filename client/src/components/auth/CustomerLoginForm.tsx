import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Phone, Lock, LogIn, AlertCircle } from "lucide-react";
import { z } from "zod";

const loginSchema = z.object({
  phoneNumber: z.string().min(8, "Phone number must be at least 8 digits").regex(/^[0-9+]+$/, "Invalid phone number format"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  rememberMe: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface CustomerLoginFormProps {
  onSuccess: (customer: any) => void;
  onRegisterRedirect: () => void;
  onForgotPassword: (phoneNumber: string) => void;
}

export function CustomerLoginForm({ onSuccess, onRegisterRedirect, onForgotPassword }: CustomerLoginFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loginError, setLoginError] = useState<string | null>(null);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phoneNumber: "",
      password: "",
      rememberMe: false,
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/customer/login", data);
      return await response.json();
    },
    onSuccess: (customer) => {
      setLoginError(null);
      toast({
        title: "Welcome Back!",
        description: `Hello ${customer.name}! You are now logged in.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/customer/me"] });
      onSuccess(customer);
    },
    onError: (error: any) => {
      const errorMessage = error.message || "Login failed";
      setLoginError(errorMessage);
      
      if (errorMessage.includes("Invalid phone or password")) {
        form.setError("password", { message: "Invalid phone number or password" });
      }
    },
  });

  const onSubmit = (data: LoginFormData) => {
    setLoginError(null);
    loginMutation.mutate(data);
  };

  const handleForgotPassword = () => {
    const phoneNumber = form.getValues("phoneNumber");
    if (!phoneNumber) {
      form.setError("phoneNumber", { message: "Please enter your phone number first" });
      return;
    }
    onForgotPassword(phoneNumber);
  };

  const watchedPhone = form.watch("phoneNumber");

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-green-100 dark:bg-green-900/20 p-3 rounded-full w-fit">
            <LogIn className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to your account to continue ordering
          </p>
        </CardHeader>

        <CardContent>
          {loginError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{loginError}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        placeholder="Enter your mobile number"
                        className="text-lg"
                        autoComplete="tel"
                        data-testid="input-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                        placeholder="Enter your 4-digit PIN"
                        className="text-lg text-center"
                        maxLength={8}
                        autoComplete="current-password"
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-between">
                <FormField
                  control={form.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-remember"
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal">
                        Remember me
                      </FormLabel>
                    </FormItem>
                  )}
                />

                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-blue-600 hover:underline font-medium"
                  data-testid="link-forgot-password"
                  disabled={!watchedPhone}
                >
                  Forgot PIN?
                </button>
              </div>

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full text-lg py-3"
                data-testid="button-login"
              >
                {loginMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <LogIn className="h-4 w-4 mr-2" />
                )}
                {loginMutation.isPending ? "Signing In..." : "Sign In"}
              </Button>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={onRegisterRedirect}
                    className="text-green-600 hover:underline font-medium"
                    data-testid="link-register"
                  >
                    Create Account
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