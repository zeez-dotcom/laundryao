import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Phone, Lock, KeyRound, CheckCircle, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { useTranslationContext } from "@/context/TranslationContext";
import { interpolate } from "@/lib/i18n";

type RequestResetFormData = {
  phoneNumber: string;
};

type ResetPasswordFormData = {
  otp: string;
  newPassword: string;
  confirmPassword: string;
};

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
  const { t } = useTranslationContext();

  const requestResetSchema = useMemo(
    () =>
      z.object({
        phoneNumber: z
          .string()
          .min(8, t.customerAuth.validation.phoneMin)
          .regex(/^[0-9+]+$/, t.customerAuth.validation.phoneFormat),
      }),
    [t],
  );

  const resetPasswordSchema = useMemo(
    () =>
      z
        .object({
          otp: z
            .string()
            .min(6, t.customerAuth.validation.otpLength)
            .max(6, t.customerAuth.validation.otpLength)
            .regex(/^[0-9]+$/, t.customerAuth.validation.otpNumeric),
          newPassword: z
            .string()
            .min(4, t.customerAuth.validation.passwordMin)
            .max(8, t.customerAuth.validation.passwordMax),
          confirmPassword: z.string(),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: t.customerAuth.validation.passwordsMismatch,
          path: ["confirmPassword"],
        }),
    [t],
  );

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
    onSuccess: () => {
      const currentPhone = requestForm.getValues("phoneNumber");
      setPhoneNumber(currentPhone);
      setStep("reset");
      toast({
        title: t.customerAuth.reset.toast.otpSentTitle,
        description: t.customerAuth.reset.toast.otpSentDescription,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.customerAuth.reset.toast.otpErrorTitle,
        description: error.message || t.customerAuth.reset.toast.otpErrorDescription,
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
        title: t.customerAuth.reset.toast.successTitle,
        description: t.customerAuth.reset.toast.successDescription,
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: t.customerAuth.reset.toast.errorTitle,
        description: error.message || t.customerAuth.reset.toast.errorDescription,
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

  const maskedPhone = phoneNumber
    ? phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")
    : phoneNumber;

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
            {step === "request"
              ? t.customerAuth.reset.titleRequest
              : t.customerAuth.reset.titleOtp}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {step === "request"
              ? t.customerAuth.reset.subtitleRequest
              : interpolate(t.customerAuth.reset.subtitleOtp, { phone: maskedPhone })}
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
                        <span>{t.customerAuth.login.phoneLabel}</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="tel"
                          placeholder={t.customerAuth.reset.phonePlaceholder}
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
                  {requestResetMutation.isPending
                    ? t.customerAuth.reset.buttons.sendLoading
                    : t.customerAuth.reset.buttons.send}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="text-sm text-blue-600 hover:underline font-medium flex items-center justify-center"
                    data-testid="link-back-login"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    {t.customerAuth.reset.buttons.backToLogin}
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
                      <FormLabel>{t.customerAuth.reset.codeLabel}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder={t.customerAuth.reset.codePlaceholder}
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
                          <span>{t.customerAuth.reset.newPinLabel}</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder={t.customerAuth.reset.newPinPlaceholder}
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
                        <FormLabel>{t.customerAuth.reset.confirmPinLabel}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder={t.customerAuth.reset.confirmPinPlaceholder}
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
                    {t.customerAuth.reset.buttons.back}
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
                    {resetPasswordMutation.isPending
                      ? t.customerAuth.reset.buttons.submitLoading
                      : t.customerAuth.reset.buttons.submit}
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
