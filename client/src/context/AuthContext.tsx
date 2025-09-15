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
  const { data: user, isLoading, error } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  // Normalize null (from 401) to undefined to keep consumer API consistent
  const normalizedUser: AuthUser | undefined = user ?? undefined;

  const value: AuthContextValue = {
    user: normalizedUser,
    branch: normalizedUser?.branch || null,
    isLoading,
    isAuthenticated: !!normalizedUser && !error,
    isAdmin:
      normalizedUser?.role === "admin" ||
      normalizedUser?.role === "super_admin" ||
      normalizedUser?.role === "delivery_admin",
    isSuperAdmin: normalizedUser?.role === "super_admin",
    isDeliveryAdmin: normalizedUser?.role === "delivery_admin",
    isDispatcher: normalizedUser?.role === "dispatcher",
    isDriver: normalizedUser?.role === "driver",
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
