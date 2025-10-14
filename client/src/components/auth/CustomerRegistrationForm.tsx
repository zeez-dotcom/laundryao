import { useMemo, useState } from "react";
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
import { useTranslationContext } from "@/context/TranslationContext";

type RegistrationFormData = {
  branchCode: string;
  phoneNumber: string;
  name: string;
  password: string;
  confirmPassword: string;
  city: string;
  address: string;
  addressLabel: string;
  agreeToTerms: boolean;
};

interface CustomerRegistrationFormProps {
  branchCode: string;
  onSuccess: (customer: any) => void;
  onLoginRedirect: () => void;
}

export function CustomerRegistrationForm({ branchCode, onSuccess, onLoginRedirect }: CustomerRegistrationFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const { t } = useTranslationContext();

  const registrationSchema = useMemo(
    () =>
      z
        .object({
          branchCode: z.string().min(1, t.customerAuth.validation.branchCodeRequired),
          phoneNumber: z
            .string()
            .min(8, t.customerAuth.validation.phoneMin)
            .regex(/^[0-9+]+$/, t.customerAuth.validation.phoneFormat),
          name: z.string().min(2, t.customerAuth.validation.nameMin),
          password: z
            .string()
            .min(4, t.customerAuth.validation.passwordMin)
            .max(8, t.customerAuth.validation.passwordMax),
          confirmPassword: z.string(),
          city: z.string().min(1, t.customerAuth.validation.cityRequired),
          address: z.string().min(5, t.customerAuth.validation.addressMin),
          addressLabel: z.string().min(1, t.customerAuth.validation.addressLabelRequired),
          agreeToTerms: z
            .boolean()
            .refine((val) => val === true, t.customerAuth.validation.termsRequired),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: t.customerAuth.validation.passwordsMismatch,
          path: ["confirmPassword"],
        }),
    [t],
  );

  const defaultValues = useMemo(
    () => ({
      branchCode,
      phoneNumber: "",
      name: "",
      password: "",
      confirmPassword: "",
      city: "",
      address: "",
      addressLabel: t.customerAuth.registration.defaultAddressLabel,
      agreeToTerms: false,
    }),
    [branchCode, t],
  );

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues,
  });

  const registrationMutation = useMutation({
    mutationFn: async (data: RegistrationFormData) => {
      const response = await apiRequest("POST", "/customer/register", data);
      return await response.json();
    },
    onSuccess: (customer) => {
      toast({
        title: t.customerAuth.registration.toast.successTitle,
        description: t.customerAuth.registration.toast.successDescription.replace("{name}", customer.name),
      });
      queryClient.invalidateQueries({ queryKey: ["/customer/me"] });
      onSuccess(customer);
    },
    onError: (error: any) => {
      toast({
        title: t.customerAuth.registration.toast.errorTitle,
        description: error.message || t.customerAuth.registration.toast.errorDescription,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RegistrationFormData) => {
    registrationMutation.mutate(data);
  };

  const nextStep = () => {
    if (step === 1) {
      void form
        .trigger(["phoneNumber", "name", "password", "confirmPassword"])
        .then((isValid) => {
          if (isValid) setStep(2);
        });
    } else {
      form.handleSubmit(onSubmit)();
    }
  };

  const prevStep = () => {
    setStep(Math.max(1, step - 1));
  };

  const totalSteps = 2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-blue-100 dark:bg-blue-900/20 p-3 rounded-full w-fit">
            <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl font-bold">{t.customerAuth.registration.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t.customerAuth.registration.subtitle
              .replace("{step}", String(step))
              .replace("{total}", String(totalSteps))}
          </p>
          <div className="flex space-x-2 justify-center">
            <div className={`h-2 w-8 rounded-full ${step >= 1 ? "bg-blue-600" : "bg-gray-200"}`} />
            <div className={`h-2 w-8 rounded-full ${step >= 2 ? "bg-blue-600" : "bg-gray-200"}`} />
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
                          <span>{t.customerAuth.login.phoneLabel}</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="tel"
                            placeholder={t.customerAuth.registration.phonePlaceholder}
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
                          <span>{t.customerAuth.registration.nameLabel}</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t.customerAuth.registration.namePlaceholder}
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
                            <span>{t.customerAuth.login.pinLabel}</span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder={t.customerAuth.registration.pinPlaceholder}
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
                          <FormLabel>{t.customerAuth.registration.confirmPinLabel}</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="password"
                              placeholder={t.customerAuth.registration.confirmPinPlaceholder}
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
                          <span>{t.customerAuth.registration.cityLabel}</span>
                        </FormLabel>
                        <FormControl>
                          <CitySelect value={field.value} onChange={field.onChange} />
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
                        <FormLabel>{t.customerAuth.registration.addressLabel}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t.customerAuth.registration.addressLabelPlaceholder}
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
                        <FormLabel>{t.customerAuth.registration.addressFieldLabel}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t.customerAuth.registration.addressPlaceholder}
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
                            {t.customerAuth.registration.termsLabel}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            {t.customerAuth.registration.termsHelper}
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
                    {t.previous}
                  </Button>
                )}

                <Button
                  type="button"
                  onClick={step === totalSteps ? form.handleSubmit(onSubmit) : nextStep}
                  disabled={registrationMutation.isPending}
                  className="flex-1"
                  data-testid={step === totalSteps ? "button-register" : "button-next"}
                >
                  {registrationMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  {step === totalSteps ? t.customerAuth.registration.submit : t.next}
                </Button>
              </div>

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {t.customerAuth.registration.ctaPrefix}{" "}
                  <button
                    type="button"
                    onClick={onLoginRedirect}
                    className="text-blue-600 hover:underline font-medium"
                    data-testid="link-login"
                  >
                    {t.customerAuth.registration.ctaAction}
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
