import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoUrl from "@/assets/logo.png";
import { useTranslation } from "@/lib/i18n";
import { loginSchema, type LoginInput } from "@shared/schemas";
import { Link, useLocation } from "wouter";

interface LoginFormProps {
  onLoginSuccess?: () => void;
}

export function LoginForm({ onLoginSuccess }: LoginFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [_, setLocation] = useLocation();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginInput) => {
      const response = await apiRequest("POST", "/api/login", credentials);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: t.loginSuccess,
        description: t.welcome,
      });
      
      // Wait a bit for session to be established, then invalidate and navigate
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        
        // Navigate based on user role
        if (data.user?.role === "driver") {
          setLocation("/driver");
        } else {
          setLocation("/");
        }
        
        onLoginSuccess?.();
      }, 300);
    },
    onError: (error) => {
      toast({
        title: t.loginFailed,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoginInput) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={logoUrl} alt="Laundry Logo" className="w-16 h-16 object-cover rounded-lg" />
          </div>
          <CardTitle className="text-2xl">{t.loginTitle}</CardTitle>
          <CardDescription>{t.loginDescription}</CardDescription>
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
                      <Input id="username" type="text" placeholder={t.usernameLabel} {...field} />
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
                    <FormLabel htmlFor="password">{t.passwordLabel}</FormLabel>
                    <FormControl>
                      <Input id="password" type="password" placeholder={t.passwordLabel} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col space-y-2">
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? t.signingIn : t.loginButton}
              </Button>
              <Link href="/forgot-password" className="text-sm text-center text-blue-500 hover:underline">
                {t.forgotPassword}
              </Link>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}