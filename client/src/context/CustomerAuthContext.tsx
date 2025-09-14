import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Customer, CustomerAddress } from "@shared/schema";

// Customer authentication context value
interface CustomerAuthContextValue {
  customer: Customer | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | undefined>(undefined);

// Custom query function for customer auth that returns null on 401
const customerQueryFn = async ({ queryKey }: any): Promise<Customer | null> => {
  try {
    const response = await apiRequest("GET", queryKey.join("/"));
    return await response.json();
  } catch (error: any) {
    if (error.message?.includes("401")) {
      return null;
    }
    throw error;
  }
};

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const { data: customer, isLoading, error } = useQuery<Customer | null>({
    queryKey: ["/customer/me"],
    queryFn: customerQueryFn,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const value: CustomerAuthContextValue = {
    customer: customer || undefined,
    isLoading,
    isAuthenticated: !!customer,
    error: error as Error | null,
  };

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error("useCustomerAuth must be used within a CustomerAuthProvider");
  }
  return context;
}

export default CustomerAuthContext;