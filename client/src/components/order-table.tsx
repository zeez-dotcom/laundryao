import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface OrderWithDue {
  id: string;
  orderNumber: string;
  customerName: string;
  dueAt?: string | Date | null;
}

interface OrderTableProps {
  orders: OrderWithDue[];
}

export function OrderTable({ orders }: OrderTableProps) {
  const now = new Date();

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const dueDate = order.dueAt ? new Date(order.dueAt) : null;
            const isOverdue = dueDate ? dueDate < now : false;
            return (
              <TableRow
                key={order.id}
                className={isOverdue ? "bg-red-50" : undefined}
              >
                <TableCell>{order.orderNumber}</TableCell>
                <TableCell>{order.customerName}</TableCell>
                <TableCell className={isOverdue ? "text-red-600" : undefined}>
                  {dueDate ? format(dueDate, "PP") : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        <span className="text-red-600 font-medium">Red</span> indicates past due
        orders.
      </p>
    </div>
  );
}

export default OrderTable;

