import { useQuery } from "@tanstack/react-query";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import type { OrderLog } from "@shared/schema";

export function OrderLogsTable() {
  const { data: logs = [] } = useQuery<OrderLog[]>({
    queryKey: ["/api/order-logs"],
    queryFn: async () => {
      const res = await fetch("/api/order-logs");
      return res.json();
    },
  });

  const formatDate = (d?: string | null) => (d ? format(new Date(d), "PP") : "-");

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order #</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Package</TableHead>
          <TableHead>Received</TableHead>
          <TableHead>Processed</TableHead>
          <TableHead>Ready</TableHead>
          <TableHead>Delivered</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell>{log.orderNumber}</TableCell>
            <TableCell>{log.customerName}</TableCell>
            <TableCell>{log.packageName || "-"}</TableCell>
            <TableCell>{formatDate(log.receivedAt)}</TableCell>
            <TableCell>{formatDate(log.processedAt)}</TableCell>
            <TableCell>{formatDate(log.readyAt)}</TableCell>
            <TableCell>{formatDate(log.deliveredAt)}</TableCell>
            <TableCell>{log.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default OrderLogsTable;
