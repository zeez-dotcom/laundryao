import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/lib/currency";
import { ReceiptModal } from "./receipt-modal";
import { buildReceiptData } from "@/lib/receipt";
import { useAuthContext } from "@/context/AuthContext";

interface OrderSummary {
  id: string;
  orderNumber: string;
  createdAt: string;
  status?: string;
  subtotal: string;
  paid: string;
  remaining: string;
}

export function CustomerOrders() {
  const { branch, user } = useAuthContext();
  const { formatCurrency } = useCurrency();
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isReceiptOpen, setReceiptOpen] = useState(false);

  const { data: orders = [], isLoading } = useQuery<OrderSummary[]>({
    queryKey: ["/customer/orders"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/customer/orders");
      if (!res.ok) throw new Error("Failed to fetch orders");
      return await res.json();
    },
  });

  const viewReceipt = async (orderId: string) => {
    const res = await apiRequest("GET", `/customer/orders/${orderId}/receipt`);
    if (res.ok) {
      const order = await res.json();
      setSelectedOrder(buildReceiptData(order, branch, user));
      setReceiptOpen(true);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Your Orders</h2>
      {orders.length === 0 ? (
        <div>No orders found.</div>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex justify-between items-center border rounded p-2"
            >
              <div>
                <div className="font-medium">#{o.orderNumber}</div>
                <div className="text-sm text-gray-500">
                  {new Date(o.createdAt).toLocaleString()}
                </div>
                {o.status && (
                  <div className="mt-1 text-xs">
                    Status: <span className="inline-block rounded bg-gray-100 px-2 py-0.5">{o.status}</span>
                    {o.status === 'ready' && (
                      <span className="ml-2 text-green-700">Ready for pickup</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span>{formatCurrency(Number(o.subtotal))}</span>
                <button
                  onClick={() => viewReceipt(o.id)}
                  className="text-blue-600 hover:underline"
                >
                  View Receipt
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReceiptModal
        order={selectedOrder}
        isOpen={isReceiptOpen}
        onClose={() => setReceiptOpen(false)}
      />
    </div>
  );
}
