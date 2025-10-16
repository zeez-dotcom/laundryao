export type DeliveryMessagePayload = {
  id: string;
  deliveryId: string;
  orderId: string;
  senderType: "customer" | "agent" | "system";
  body: string;
  createdAt: string;
  attachments?: Array<{ id: string; name: string; url?: string }>;
  metadata?: Record<string, unknown> | null;
};

export type DeliveryReschedulePayload = {
  deliveryId: string;
  orderId: string;
  scheduledDeliveryTime: string;
  actor?: string | null;
  reason?: string | null;
};

export type DeliveryCompensationPayload = {
  deliveryId: string;
  orderId: string;
  amount: number;
  currency: string;
  reason?: string | null;
  actor?: string | null;
};

export type DeliveryChannelEvent =
  | {
      type: "status";
      orderId: string;
      deliveryStatus: string | null;
      driverId: string | null;
    }
  | ({
      type: "message";
      orderId: string;
      message: DeliveryMessagePayload;
    })
  | ({
      type: "reschedule";
      orderId: string;
      reschedule: DeliveryReschedulePayload;
    })
  | ({
      type: "compensation";
      orderId: string;
      compensation: DeliveryCompensationPayload;
    });
