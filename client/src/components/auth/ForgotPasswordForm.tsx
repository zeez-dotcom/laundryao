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
import { Link } from "wouter";
import { z } from "zod";

const schema = z.object({ username: z.string().min(1, "Username is required") });

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const form = useForm<{ username: string }>({
    resolver: zodResolver(schema),
    defaultValues: { username: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: { username: string }) => {
      const res = await apiRequest("POST", "/auth/password/forgot", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t.passwordResetLinkSent });
    },
    onError: (err: any) => {
      toast({
        title: t.failedToResetPassword,
        description: t[err.message as keyof typeof t] || err.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: { username: string }) => {
    mutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t.forgotPassword}</CardTitle>
          <CardDescription>{t.sendResetLink}</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="username">{t.usernameLabel}</FormLabel>
                    <FormControl>
                      <Input id="username" type="text" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex justify-between">
              <Link href="/">
                <Button variant="ghost" type="button">
                  {t.loginButton}
                </Button>
              </Link>
              <Button type="submit" disabled={mutation.isPending}>
                {t.sendResetLink}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
