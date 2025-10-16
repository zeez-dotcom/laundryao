import type { Express, RequestHandler } from "express";
import type { Logger } from "pino";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import {
  deliveryOrders,
  orders,
  users,
  customerAddresses,
  deliveryStatusEnum,
  type DeliveryStatus,
  type User,
  type UserWithBranch,
} from "@shared/schema";

import type { IStorage } from "../storage";
import { db } from "../db";
import { haversineDistance } from "../utils/geolocation";
import { createAnalyticsEvent, type EventBus } from "../services/event-bus";

type DeliveryBroadcastPayload = {
  orderId: string;
  deliveryStatus: string | null;
  driverId: string | null;
};

const deliveryStatusValues = [...deliveryStatusEnum] as [DeliveryStatus, ...DeliveryStatus[]];

const customerDeliveryItemSchema = z.object({
  clothingItemId: z.string().min(1),
  serviceId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

const customerDeliveryOrderSchema = z.object({
  customerId: z.string().min(1),
  branchCode: z.string().min(1),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  items: z.array(customerDeliveryItemSchema).min(1),
  deliveryFee: z.coerce.number().nonnegative().optional(),
  deliveryAddressId: z.string().optional(),
  deliveryInstructions: z.string().optional(),
  paymentMethod: z.string().optional(),
});

const deliveryOrderRequestQuerySchema = z.object({
  branchId: z.string().optional(),
});

const deliveryOrdersQuerySchema = z.object({
  status: z.string().optional(),
  branchId: z.string().optional(),
  driverId: z.string().optional(),
});

const statusUpdateSchema = z.object({
  status: z.enum(deliveryStatusValues),
});

const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["driver_enroute", "cancelled"],
  driver_enroute: ["picked_up", "cancelled"],
  picked_up: ["processing_started", "cancelled"],
  processing_started: ["ready", "cancelled"],
  ready: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const DEFAULT_DRIVER_SPEED_KMH = 35;

interface DeliveryRoutesDeps {
  app: Express;
  storage: IStorage;
  logger: Logger;
  requireAuth: RequestHandler;
  requireAdminOrSuperAdmin: RequestHandler;
  broadcastDeliveryUpdate: (payload: DeliveryBroadcastPayload) => Promise<void>;
  eventBus: EventBus;
}

function isValidStatus(value: string): value is DeliveryStatus {
  return (deliveryStatusValues as readonly DeliveryStatus[]).includes(value as DeliveryStatus);
}

function resolveActorName(user?: { firstName?: string | null; lastName?: string | null; username?: string | null }) {
  if (!user) return "system";
  const parts = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length) {
    return parts.join(" ");
  }
  return user.username || "system";
}

export function registerDeliveryRoutes({
  app,
  storage,
  logger,
  requireAuth,
  requireAdminOrSuperAdmin,
  broadcastDeliveryUpdate,
  eventBus,
}: DeliveryRoutesDeps): void {
  app.post("/api/delivery-orders", async (req, res) => {
    const sessionCustomerId = (req.session as { customerId?: string } | undefined)?.customerId;

    if (!sessionCustomerId) {
      return res.status(401).json({ message: "Login required" });
    }

    try {
      const payload = customerDeliveryOrderSchema.parse(req.body);

      if (payload.customerId !== sessionCustomerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const branch = await storage.getBranchByCode(payload.branchCode);
      if (!branch) {
        return res.status(404).json({ message: "Branch not found" });
      }

      const orderItems = payload.items.map((item) => ({
        clothingItemId: item.clothingItemId,
        serviceId: item.serviceId,
        quantity: item.quantity,
      }));

      let subtotal = 0;
      for (const item of payload.items) {
        const price =
          (await storage.getItemServicePrice(item.clothingItemId, item.serviceId, "", branch.id)) ?? 0;
        subtotal += price * item.quantity;
      }

      const deliveryFee = payload.deliveryFee ?? 0;
      const total = subtotal + deliveryFee;

      const promisedReadyDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const newOrder = await storage.createOrder({
        customerId: sessionCustomerId,
        branchId: branch.id,
        customerName: payload.customerName || "Customer",
        customerPhone: payload.customerPhone || "",
        items: orderItems,
        subtotal: subtotal.toFixed(2),
        tax: "0",
        total: total.toFixed(2),
        paymentMethod: payload.paymentMethod || "cash",
        status: "received",
        sellerName: "Online Order",
        promisedReadyDate,
        promisedReadyOption: "tomorrow",
        isDeliveryRequest: true,
      });

      const deliveryRecord = payload.deliveryAddressId
        ? await storage.createDeliveryOrder({
          orderId: newOrder.id,
          deliveryMode: "driver_pickup",
          deliveryAddressId: payload.deliveryAddressId,
          deliveryInstructions: payload.deliveryInstructions || "",
          deliveryStatus: "pending",
          deliveryFee: deliveryFee.toFixed(2),
        })
        : null;

      const totalValue = Number.parseFloat(String(newOrder.total ?? total));
      await eventBus.publish(
        createAnalyticsEvent({
          source: "api.delivery-orders",
          category: "order.lifecycle",
          name: "created",
          payload: {
            orderId: newOrder.id,
            branchId: branch.id,
            customerId: sessionCustomerId,
            status: newOrder.status ?? "received",
            previousStatus: null,
            deliveryStatus: deliveryRecord?.deliveryStatus ?? (payload.deliveryAddressId ? "pending" : null),
            deliveryId: deliveryRecord?.id ?? null,
            total: Number.isFinite(totalValue) ? totalValue : undefined,
            promisedReadyDate:
              typeof (newOrder as any).promisedReadyDate === "string"
                ? (newOrder as any).promisedReadyDate
                : promisedReadyDate,
          },
          actor: {
            actorId: sessionCustomerId,
            actorType: "customer",
          },
          context: {
            tenantId: branch.id,
          },
        }),
      );

      res.status(201).json({
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        total: newOrder.total,
      });
    } catch (error) {
      logger.error({ err: error }, "Error creating delivery order");
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.get("/api/delivery-order-requests", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const query = deliveryOrderRequestQuerySchema.parse(req.query);
      const branchId =
        query.branchId && user.role === "super_admin" ? query.branchId : user.branchId || undefined;
      const orders = await storage.getDeliveryOrderRequests(branchId);
      res.json(orders);
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch delivery order requests");
      res.status(500).json({ message: "Failed to fetch delivery order requests" });
    }
  });

  app.patch("/api/delivery-order-requests/:id/accept", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      if (user.role !== "super_admin" && user.branchId !== order.branchId) {
        return res.status(403).json({ message: "Access denied" });
      }
      const updated = await storage.acceptDeliveryOrderRequest(
        req.params.id,
        resolveActorName(user),
      );
      if (!updated) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(updated);

      const acceptedTotal = Number.parseFloat(String((updated as any).total ?? order.total ?? 0));
      await eventBus.publish(
        createAnalyticsEvent({
          source: "api.delivery-order-requests",
          category: "order.lifecycle",
          name: "request_accepted",
          payload: {
            orderId: updated.id,
            branchId: updated.branchId ?? order.branchId ?? null,
            customerId: updated.customerId ?? order.customerId ?? null,
            status: updated.status ?? order.status ?? "accepted",
            previousStatus: order.status ?? null,
            deliveryStatus: "accepted",
            deliveryId: null,
            total: Number.isFinite(acceptedTotal) ? acceptedTotal : undefined,
          },
          actor: {
            actorId: user.id,
            actorType: "user",
            actorName: resolveActorName(user),
          },
          context: {
            tenantId: order.branchId ?? undefined,
          },
        }),
      );
    } catch (error) {
      logger.error({ err: error }, "Failed to accept delivery order request");
      res.status(500).json({ message: "Failed to accept delivery order request" });
    }
  });

  app.get("/api/delivery-orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      if (!["admin", "super_admin", "driver"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const query = deliveryOrdersQuerySchema.parse(req.query);

      let targetBranchId = query.branchId;
      if (user.role !== "super_admin") {
        if (query.branchId && query.branchId !== user.branchId) {
          return res.status(403).json({ message: "Cannot access other branch delivery orders" });
        }
        targetBranchId = user.branchId || undefined;
      }

      const statusFilter = query.status && isValidStatus(query.status) ? (query.status as DeliveryStatus) : undefined;
      if (query.status && !statusFilter) {
        return res.status(400).json({ message: "Invalid status filter" });
      }

      const ordersList = query.driverId
        ? await storage.getDeliveryOrdersByDriver(query.driverId, targetBranchId)
        : await storage.getDeliveryOrders(targetBranchId, statusFilter);

      const deliveryAddressIds = Array.from(
        new Set(
          ordersList
            .map((order) => (order as any).deliveryAddressId as string | null | undefined)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const addressRows = deliveryAddressIds.length
        ? await db
            .select({
              id: customerAddresses.id,
              label: customerAddresses.label,
              address: customerAddresses.address,
              lat: customerAddresses.lat,
              lng: customerAddresses.lng,
            })
            .from(customerAddresses)
            .where(inArray(customerAddresses.id, deliveryAddressIds))
        : [];
      const addressMap = new Map(addressRows.map((addr) => [addr.id, addr]));

      const driverIds = Array.from(
        new Set(ordersList.map((o) => o.driverId).filter((id): id is string => Boolean(id))),
      );

      const driverRows = driverIds.length
        ? await db
            .select({
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
              username: users.username,
            })
            .from(users)
            .where(inArray(users.id, driverIds))
        : [];
      const driverNameMap = new Map(
        driverRows.map((row) => [row.id, [row.firstName, row.lastName].filter(Boolean).join(" ") || row.username]),
      );

      const driverLocationMap = new Map(
        (driverIds.length ? await storage.getLatestDriverLocations(driverIds) : []).map((loc) => [loc.driverId, loc]),
      );

      const response = ordersList.map((entry) => {
        const delivery = entry as typeof entry & { deliveryAddressId?: string | null };
        const order = entry.order;
        const address = delivery.deliveryAddressId ? addressMap.get(delivery.deliveryAddressId) : undefined;
        const driverLocation = delivery.driverId ? driverLocationMap.get(delivery.driverId) : undefined;
        const deliveryLat = address?.lat != null ? Number(address.lat) : null;
        const deliveryLng = address?.lng != null ? Number(address.lng) : null;

        let distanceKm: number | null = null;
        let etaMinutes: number | null = null;
        if (driverLocation && deliveryLat != null && deliveryLng != null) {
          distanceKm = Math.round(haversineDistance(driverLocation.lat, driverLocation.lng, deliveryLat, deliveryLng) * 100) / 100;
          etaMinutes = distanceKm > 0 ? Math.round(((distanceKm / DEFAULT_DRIVER_SPEED_KMH) * 60 + Number.EPSILON) * 10) / 10 : 0;
        }

        return {
          id: order.id,
          deliveryId: delivery.id,
          orderId: delivery.orderId,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          deliveryAddress: address?.address ?? "",
          deliveryAddressLabel: address?.label ?? null,
          deliveryLat,
          deliveryLng,
          total: Number(order.total),
          status: delivery.deliveryStatus,
          driverId: delivery.driverId ?? null,
          driverName: delivery.driverId ? driverNameMap.get(delivery.driverId) ?? null : null,
          etaMinutes,
          distanceKm,
          driverLat: driverLocation?.lat ?? null,
          driverLng: driverLocation?.lng ?? null,
          driverLocationTimestamp: driverLocation?.timestamp.toISOString() ?? null,
        };
      });

      res.json(response);
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch delivery orders");
      res.status(500).json({ message: "Failed to fetch delivery orders" });
    }
  });

  app.get("/api/drivers", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      if (!["admin", "super_admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const where =
        user.role === "super_admin"
          ? and(eq(users.role, "driver"))
          : and(eq(users.role, "driver"), eq(users.branchId, user.branchId as string));

      const rows = await db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username })
        .from(users)
        .where(where);

      const drivers = rows.map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username,
      }));

      res.json(drivers);
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch drivers");
      res.status(500).json({ message: "Failed to fetch drivers" });
    }
  });

  app.patch("/api/delivery-orders/:id/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { status } = statusUpdateSchema.parse(req.body);

      const [current] = await db
        .select({ order: orders, delivery: deliveryOrders })
        .from(deliveryOrders)
        .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
        .where(and(eq(deliveryOrders.orderId, req.params.id), eq(orders.isDeliveryRequest, false)));

      if (!current) {
        return res.status(404).json({ message: "Delivery order not found" });
      }

      if (user.role !== "super_admin" && current.order.branchId !== user.branchId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const currentStatus = current.delivery.deliveryStatus as DeliveryStatus;
      const allowed = DELIVERY_STATUS_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status transition" });
      }

      const updated = await storage.updateDeliveryStatus(
        req.params.id,
        status,
        resolveActorName(user),
      );
      if (!updated) {
        return res.status(404).json({ message: "Delivery order not found" });
      }

      res.json(updated);
      await broadcastDeliveryUpdate({
        orderId: updated.orderId,
        deliveryStatus: updated.deliveryStatus,
        driverId: updated.driverId || null,
      });

      const monetaryTotal = Number.parseFloat(String((updated.order as any).total ?? 0));
      await eventBus.publish(
        createAnalyticsEvent({
          source: "api.delivery-orders.status",
          category: "order.lifecycle",
          name: "delivery_status_changed",
          payload: {
            orderId: updated.orderId,
            branchId: updated.order.branchId ?? null,
            customerId: updated.order.customerId ?? null,
            status,
            previousStatus: currentStatus,
            deliveryStatus: updated.deliveryStatus,
            deliveryId: updated.id ?? null,
            total: Number.isFinite(monetaryTotal) ? monetaryTotal : undefined,
          },
          actor: {
            actorId: user.id,
            actorType: "user",
            actorName: resolveActorName(user),
          },
          context: {
            tenantId: updated.order.branchId ?? undefined,
          },
        }),
      );
    } catch (error) {
      logger.error({ err: error }, "Failed to update delivery status");
      res.status(500).json({ message: "Failed to update delivery status" });
    }
  });

  // Branch-level delivery settings and catalogue management
  app.get("/api/branches/:id/delivery-settings", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;

      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch settings" });
      }

      const settings = await storage.getBranchDeliverySettings(id);
      res.json(settings);
    } catch (error) {
      logger.error({ err: error }, "Error fetching delivery settings");
      res.status(500).json({ message: "Failed to fetch delivery settings" });
    }
  });

  app.put("/api/branches/:id/delivery-settings", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;

      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branch settings" });
      }

      const settings = await storage.updateBranchDeliverySettings(id, req.body);
      res.json(settings);
    } catch (error) {
      logger.error({ err: error }, "Error updating delivery settings");
      res.status(500).json({ message: "Failed to update delivery settings" });
    }
  });

  app.get("/api/branches/:id/delivery-items", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;

      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch delivery items" });
      }

      const items = await storage.getBranchDeliveryItems(id);
      res.json(items);
    } catch (error) {
      logger.error({ err: error }, "Error fetching delivery items");
      res.status(500).json({ message: "Failed to fetch delivery items" });
    }
  });

  app.put("/api/branches/:id/delivery-items/:clothingItemId/:serviceId", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id, clothingItemId, serviceId } = req.params;
      const { isAvailable, deliveryPrice, estimatedProcessingTime } = req.body as {
        isAvailable?: boolean;
        deliveryPrice?: string;
        estimatedProcessingTime?: number;
      };
      const user = req.user as User;

      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branch delivery items" });
      }

      const item = await storage.updateBranchDeliveryItem(id, clothingItemId, serviceId, {
        isAvailable,
        deliveryPrice,
        estimatedProcessingTime,
      });
      res.json(item);
    } catch (error) {
      logger.error({ err: error }, "Error updating delivery item");
      res.status(500).json({ message: "Failed to update delivery item" });
    }
  });

  app.get("/api/branches/:id/delivery-packages", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;

      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch delivery packages" });
      }

      const packages = await storage.getBranchDeliveryPackages(id);
      res.json(packages);
    } catch (error) {
      logger.error({ err: error }, "Error fetching delivery packages");
      res.status(500).json({ message: "Failed to fetch delivery packages" });
    }
  });

  app.put("/api/branches/:id/delivery-packages/:packageId", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id, packageId } = req.params;
      const { isAvailable, deliveryDiscount } = req.body as {
        isAvailable?: boolean;
        deliveryDiscount?: string;
      };
      const user = req.user as User;

      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branch delivery packages" });
      }

      const pkg = await storage.updateBranchDeliveryPackage(id, packageId, {
        isAvailable,
        deliveryDiscount,
      });
      res.json(pkg);
    } catch (error) {
      logger.error({ err: error }, "Error updating delivery package");
      res.status(500).json({ message: "Failed to update delivery package" });
    }
  });
}
