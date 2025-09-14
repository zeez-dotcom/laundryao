import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Phone, Lock, KeyRound, CheckCircle, ArrowLeft } from "lucide-react";
import { z } from "zod";

const requestResetSchema = z.object({
  phoneNumber: z.string().min(8, "Phone number must be at least 8 digits").regex(/^[0-9+]+$/, "Invalid phone number format"),
});

const resetPasswordSchema = z.object({
  otp: z.string().min(6, "OTP must be 6 digits").max(6, "OTP must be 6 digits").regex(/^[0-9]+$/, "OTP must be numeric"),
  newPassword: z.string().min(4, "Password must be at least 4 characters").max(8, "Password must be at most 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RequestResetFormData = z.infer<typeof requestResetSchema>;
type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

interface CustomerPasswordResetFormProps {
  initialPhoneNumber?: string;
  onSuccess: () => void;
  onBackToLogin: () => void;
}

export function CustomerPasswordResetForm({ 
  initialPhoneNumber = "", 
  onSuccess, 
  onBackToLogin 
}: CustomerPasswordResetFormProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);

  const requestForm = useForm<RequestResetFormData>({
    resolver: zodResolver(requestResetSchema),
    defaultValues: {
      phoneNumber: initialPhoneNumber,
    },
  });

  const resetForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      otp: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const requestResetMutation = useMutation({
    mutationFn: async (data: RequestResetFormData) => {
      const response = await apiRequest("POST", "/customer/request-password-reset", data);
      return await response.json();
    },
    onSuccess: (data) => {
      setPhoneNumber(requestForm.getValues("phoneNumber"));
      setStep("reset");
      toast({
        title: "OTP Sent",
        description: "A 6-digit code has been sent to your mobile number.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send OTP",
        description: error.message || "Unable to send OTP. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordFormData) => {
      const response = await apiRequest("POST", "/customer/reset-password", {
        phoneNumber,
        otp: data.otp,
        newPassword: data.newPassword,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Reset Successful",
        description: "Your password has been updated successfully.",
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Password Reset Failed",
        description: error.message || "Unable to reset password. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onRequestReset = (data: RequestResetFormData) => {
    requestResetMutation.mutate(data);
  };

  const onResetPassword = (data: ResetPasswordFormData) => {
    resetPasswordMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-orange-100 dark:bg-orange-900/20 p-3 rounded-full w-fit">
            {step === "request" ? (
              <KeyRound className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            ) : (
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {step === "request" ? "Reset Password" : "Enter OTP"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {step === "request" 
              ? "Enter your mobile number to receive a reset code"
              : `Enter the 6-digit code sent to ${phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}`
            }
          </p>
        </CardHeader>

        <CardContent>
          {step === "request" && (
            <Form {...requestForm}>
              <form onSubmit={requestForm.handleSubmit(onRequestReset)} className="space-y-6">
                <FormField
                  control={requestForm.control}
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
                          data-testid="input-phone"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={requestResetMutation.isPending}
                  className="w-full text-lg py-3"
                  data-testid="button-send-otp"
                >
                  {requestResetMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  {requestResetMutation.isPending ? "Sending..." : "Send Reset Code"}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="text-sm text-blue-600 hover:underline font-medium flex items-center justify-center"
                    data-testid="link-back-login"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back to Login
                  </button>
                </div>
              </form>
            </Form>
          )}

          {step === "reset" && (
            <Form {...resetForm}>
              <form onSubmit={resetForm.handleSubmit(onResetPassword)} className="space-y-6">

                <FormField
                  control={resetForm.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>6-Digit Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="000000"
                          className="text-2xl text-center tracking-widest"
                          maxLength={6}
                          data-testid="input-otp"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={resetForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center space-x-2">
                          <Lock className="h-4 w-4" />
                          <span>New PIN</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="New PIN"
                            className="text-lg text-center"
                            maxLength={8}
                            data-testid="input-new-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={resetForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm PIN</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Confirm"
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

                <div className="flex space-x-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("request")}
                    className="flex-1"
                    data-testid="button-back"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                  </Button>
                  
                  <Button
                    type="submit"
                    disabled={resetPasswordMutation.isPending}
                    className="flex-1"
                    data-testid="button-reset"
                  >
                    {resetPasswordMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {resetPasswordMutation.isPending ? "Updating..." : "Reset PIN"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}