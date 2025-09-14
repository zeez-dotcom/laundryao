import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "@/lib/i18n";
import { passwordSchema } from "@shared/schemas";
import { z } from "zod";

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const schema = z
    .object({
      password: passwordSchema(t.passwordRequirements),
      confirm: z.string(),
    })
    .refine((data) => data.password === data.confirm, {
      path: ["confirm"],
      message: t.passwordsDoNotMatch,
    });

  const form = useForm<{ password: string; confirm: string }>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: { password: string; confirm: string }) => {
      const res = await apiRequest("POST", "/auth/password/reset", {
        token,
        newPassword: data.password,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t.passwordReset });
    },
    onError: (err: any) => {
      toast({
        title: t.failedToResetPassword,
        description: t[err.message as keyof typeof t] || err.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: { password: string; confirm: string }) => {
    mutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t.resetPassword}</CardTitle>
          <CardDescription>{t.newPassword}</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="password">{t.newPassword}</FormLabel>
                    <FormControl>
                      <Input id="password" type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="confirm">{t.confirmPasswordLabel}</FormLabel>
                    <FormControl>
                      <Input id="confirm" type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {t.resetPassword}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
