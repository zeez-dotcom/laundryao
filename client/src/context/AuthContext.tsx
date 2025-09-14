import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import type { User, Branch } from "@shared/schema";

// Extended user type with optional branch information
export type AuthUser =
  User & { branch?: (Branch & { logoUrl?: string | null; tagline?: string | null }) | null };

interface AuthContextValue {
  user: AuthUser | undefined;
  branch: (Branch & { logoUrl?: string | null; tagline?: string | null }) | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isDeliveryAdmin: boolean;
  isDispatcher: boolean;
  isDriver: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const value: AuthContextValue = {
    user,
    branch: user?.branch || null,
    isLoading,
    isAuthenticated: !!user && !error,
    isAdmin:
      user?.role === "admin" ||
      user?.role === "super_admin" ||
      user?.role === "delivery_admin",
    isSuperAdmin: user?.role === "super_admin",
    isDeliveryAdmin: user?.role === "delivery_admin",
    isDispatcher: user?.role === "dispatcher",
    isDriver: user?.role === "driver",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;

