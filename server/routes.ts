import type { Express, RequestHandler, Request } from "express";
import { createServer, type Server } from "http";
import {
  storage,
  type ParsedRow,
  type ReportDateRangeFilter,
  generateCustomerPasswordOtp,
  verifyCustomerPasswordOtp,
  DEFAULT_CUSTOMER_OUTREACH_RATE_LIMIT_HOURS,
  type CustomerEngagementPlanUpdateInput,
} from "./storage";
import { db } from "./db";
import {
  insertTransactionSchema,
  insertClothingItemSchema,
  insertLaundryServiceSchema,
  insertProductSchema,
  insertUserSchema,
  updateUserSchema,
  insertCategorySchema,
  insertBranchSchema,
  updateBranchSchema,
  insertCustomerSchema,
  insertCustomerAddressSchema,
  insertOrderSchema,
  packageUsageSchema,
  packageUsagesSchema,
  insertPackageSchema,
  clothingItems,
  laundryServices,
  itemServicePrices,
  categories,
  users,
  customers,
  packages,
  products,
  insertPaymentSchema,
  insertSecuritySettingsSchema,
  insertItemServicePriceSchema,
  type InsertPayment,
  type User,
  type ItemType,
  type ClothingItem,
  orders,
  branchAds,
  cities,
  type City,
} from "@shared/schema";
import { loginSchema } from "@shared/schemas";
import {
  setupAuth,
  requireAuth,
  requireSuperAdmin,
  requireAdminOrSuperAdmin,
  requireCustomerOrAdmin,
  getSession,
  getAdminSession,
} from "./auth";
import { attachTenant } from "./middleware/tenant-context";
import { auditMiddleware } from "./middleware/audit";
import { seedSuperAdmin } from "./seed-superadmin";
import { seedPackages } from "./seed-packages";
import { seedBranches } from "./seed-branches";
import passport from "passport";
import type { UserWithBranch } from "@shared/schema";
import type { IStorage } from "./storage";
import multer from "multer";
import ExcelJS from "exceljs";
import { z, ZodError } from "zod";
import { eq, sql, and, inArray, like, or, ilike, gt } from "drizzle-orm";
import logger from "./logger";
import { NotificationService } from "./services/notification";
import { registerHealthRoutes } from "./routes/health";
import { registerCatalogRoutes } from "./routes/catalog";
import { registerSmartOrderRoutes } from "./routes/orders.smart";
import { registerDeliveryRoutes } from "./routes/delivery";
import { registerDeliveryMessageRoutes } from "./routes/delivery-messages";
import { registerDeliveryActionRoutes } from "./routes/delivery-actions";
import type { DeliveryChannelEvent } from "./types/delivery-channel";
import { registerCustomerCommandCenterRoutes } from "./routes/customers/command-center";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { passwordSchema } from "@shared/schemas";
import path from "path";
import fs from "fs";
import { CustomerInsightsService } from "./services/customer-insights";
import { OrderSuggestionsService } from "./services/order-suggestions";
import { OrderAnomaliesService } from "./services/order-anomalies";
import { DeliveryOptimizationService } from "./services/delivery-optimization";
import { ForecastingService } from "./services/forecasting";
import { AlertingEngine } from "./services/alerts";
import { registerAnalyticsWorkspaceRoutes } from "./routes/analytics";
import { registerAlertRoutes } from "./routes/alerts";
import { createAnalyticsEvent, type EventBus } from "./services/event-bus";
import { registerWorkflowRoutes } from "./routes/workflows";
import { glMappings, insertGlMappingSchema } from "@shared/schema";
import { WorkflowEngine } from "./services/workflows/engine";
import { registerGraphql } from "./graphql";

// Helper: resolve UUID by numeric publicId for routes that accept :id
async function resolveUuidByPublicId(table: any, idParam: string) {
  try {
    if (idParam && /^\d+$/.test(idParam)) {
      const num = Number(idParam);
      const rows = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.publicId, num));
      if (rows && rows[0]?.id) return rows[0].id as string;
    }
  } catch {
    // ignore resolution errors and fall back to original param
  }
  return idParam;
}

function getActorName(user?: { firstName?: string | null; lastName?: string | null; username?: string | null }): string {
  if (!user) return "system";
  const parts = [user.firstName, user.lastName]
    .filter((part): part is string => Boolean(part && part.trim()));
  if (parts.length) {
    return parts.join(" ");
  }
  return user.username || "system";
}

const parseAmount = (value: string | number | null | undefined) =>
  Number.parseFloat(typeof value === "string" ? value : value != null ? String(value) : "0");
import { WebSocketServer } from "ws";

const upload = multer();
const uploadDir = path.resolve(import.meta.dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
});

const passwordResetTokens = new Map<string, { userId: string; expires: Date }>();

// Enhanced security: Comprehensive rate limiting for all auth endpoints
interface RateLimitRecord {
  count: number;
  windowStart: number;
  lastAttempt: number;
  lockoutUntil?: number; // For temporary lockouts
}

const authAttempts = new Map<string, RateLimitRecord>();
let lastCityFetch = 0;

const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;

// Security constants for rate limiting
const RATE_LIMIT_CONFIG = {
  LOGIN_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  LOGIN_MAX_ATTEMPTS: 5,
  RESET_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  RESET_MAX_ATTEMPTS: 3,
  REGISTER_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  REGISTER_MAX_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 30 * 60 * 1000, // 30 minutes lockout
} as const;

const MAX_BULK_CUSTOMER_ACTIONS = 50;

interface RegisterRoutesOptions {
  eventBus: EventBus;
}

/**
 * Enhanced rate limiting with exponential backoff and temporary lockouts
 * Protects against brute-force attacks on authentication endpoints
 */
function isRateLimited(key: string, type: 'login' | 'reset' | 'register' = 'reset'): boolean {
  const now = Date.now();
  const record = authAttempts.get(key);
  
  // Select configuration based on endpoint type
  const config = {
    login: { window: RATE_LIMIT_CONFIG.LOGIN_WINDOW_MS, maxAttempts: RATE_LIMIT_CONFIG.LOGIN_MAX_ATTEMPTS },
    reset: { window: RATE_LIMIT_CONFIG.RESET_WINDOW_MS, maxAttempts: RATE_LIMIT_CONFIG.RESET_MAX_ATTEMPTS },
    register: { window: RATE_LIMIT_CONFIG.REGISTER_WINDOW_MS, maxAttempts: RATE_LIMIT_CONFIG.REGISTER_MAX_ATTEMPTS },
  }[type];
  
  // Check if currently locked out
  if (record?.lockoutUntil && now < record.lockoutUntil) {
    return true;
  }
  
  // Reset window if expired or no record exists
  if (!record || now - record.windowStart > config.window) {
    authAttempts.set(key, {
      count: 1,
      windowStart: now,
      lastAttempt: now,
    });
    return false;
  }
  
  // Check if max attempts exceeded
  if (record.count >= config.maxAttempts) {
    // Implement temporary lockout for repeated violations
    record.lockoutUntil = now + RATE_LIMIT_CONFIG.LOCKOUT_DURATION_MS;
    authAttempts.set(key, record);
    logger.warn({ key, type, attempts: record.count }, 'Rate limit exceeded - temporary lockout applied');
    return true;
  }
  
  // Increment attempt counter
  record.count++;
  record.lastAttempt = now;
  authAttempts.set(key, record);
  return false;
}

/**
 * Clear rate limiting record on successful authentication
 */
function clearRateLimit(key: string): void {
  authAttempts.delete(key);
}

/**
 * Apply package modification logic to show per-transaction usage instead of cumulative.
 * This ensures receipts display only the credits used in the current transaction.
 * Now supports multiple package usages for comprehensive credit tracking.
 */
function applyPackageUsageModification(packages: any[], packageUsages: any[]) {
  if (!packageUsages || !packages.length) {
    return [];
  }

  const packageUsageMap = new Map(packageUsages.map((pu: any) => [pu.packageId, pu]));

  return packages
    .map((pkg: any) => {
      // Match usage by the base package id, not the customer-package id
      const packageUsage = packageUsageMap.get(pkg.packageId ?? pkg.id);
      if (!packageUsage) {
        return null;
      }

      const packageUsedMap = new Map(
        packageUsage.items.map((i: any) => [`${i.serviceId}:${i.clothingItemId}`, i.quantity])
      );

      let pkgUsed = 0;
      const items = (pkg.items || []).map((item: any) => {
        const usedRaw = packageUsedMap.get(`${item.serviceId}:${item.clothingItemId}`) ?? 0;
        const used = typeof usedRaw === 'string' ? parseFloat(usedRaw) : Number(usedRaw) || 0;
        if (used > 0) pkgUsed += used;
        const balanceNum = typeof item.balance === 'string' ? parseFloat(item.balance) : (item.balance ?? 0);
        const totalCreditsNum = typeof item.totalCredits === 'string' ? parseFloat(item.totalCredits) : (item.totalCredits ?? 0);
        return {
          ...item,
          // Preserve bilingual labels if present from storage
          used,
          balance: Math.max(balanceNum - used, 0),
          totalCredits: totalCreditsNum,
        };
      });

      if (pkgUsed <= 0) {
        return null;
      }

      const pkgBalanceNum = typeof pkg.balance === 'string' ? parseFloat(pkg.balance) : (pkg.balance ?? 0);
      const pkgTotalCreditsNum = typeof pkg.totalCredits === 'string' ? parseFloat(pkg.totalCredits) : (pkg.totalCredits ?? 0);
      return {
        ...pkg,
        items,
        used: pkgUsed,
        balance: Math.max(pkgBalanceNum - pkgUsed, 0),
        totalCredits: pkgTotalCreditsNum,
        expiresAt: pkg.expiresAt,
      };
    })
    .filter(Boolean);
}

function parseReportFilters(req: Request, user: UserWithBranch): {
  filter: ReportDateRangeFilter;
  error?: string;
} {
  const { start, end, branchId: queryBranchId } = req.query as Record<string, string | undefined>;
  const filter: ReportDateRangeFilter = {};

  if (start) {
    const startDate = new Date(start);
    if (Number.isNaN(startDate.getTime())) {
      return { filter, error: "Invalid start date" };
    }
    filter.start = startDate;
  }

  if (end) {
    const endDate = new Date(end);
    if (Number.isNaN(endDate.getTime())) {
      return { filter, error: "Invalid end date" };
    }
    filter.end = endDate;
  }

  if (filter.start && filter.end && filter.start > filter.end) {
    return { filter, error: "Start date must be before end date" };
  }

  const branchScope = user.role === "super_admin"
    ? queryBranchId || undefined
    : user.branchId || undefined;

  if (branchScope) {
    if (!UUID_REGEX.test(branchScope)) {
      return { filter, error: "Invalid branch" };
    }
    filter.branchId = branchScope;
  }

  return { filter };
}

/**
 * Compute packageUsages server-side based on customer's available packages and cart items.
 * Uses multiple packages to maximize credit utilization and prevent unnecessary cash charges.
 * This prevents client-side tampering with financial credit data.
 */
export async function computePackageUsage(
  customerId: string,
  cartItems: any[],
  storage: IStorage
): Promise<{ packageUsages: any[]; usedCredits: { customerPackageId: string; serviceId: string; clothingItemId: string; quantity: number }[] } | null> {
  try {
    // Get customer's available packages with current usage/balance
    const customerPackages = await storage.getCustomerPackagesWithUsage(customerId);
    if (!customerPackages?.length) {
      return null;
    }

    const usedCredits: { customerPackageId: string; serviceId: string; clothingItemId: string; quantity: number }[] = [];
    const packageUsageMap = new Map<string, { packageId: string; items: { serviceId: string; clothingItemId: string; quantity: number }[] }>();

    // Process each cart item to see if we can use package credits
    for (const cartItem of cartItems) {
      if (!cartItem.serviceId || !cartItem.clothingItemId || !cartItem.quantity) {
        continue;
      }

      let remainingQuantity = cartItem.quantity;

      // Continue using credits from multiple packages until the item quantity is fully covered
      for (const customerPackage of customerPackages) {
        if (remainingQuantity <= 0) break; // No more quantity to cover
        if (!customerPackage.items?.length) continue;

        const packageItem = customerPackage.items.find(
          (item: any) => 
            item.serviceId === cartItem.serviceId && 
            item.clothingItemId === cartItem.clothingItemId &&
            item.balance > 0
        );

        if (packageItem) {
          const creditsToUse = Math.min(remainingQuantity, packageItem.balance);
          if (creditsToUse > 0) {
            // Track used credits for database updates
            usedCredits.push({
              customerPackageId: customerPackage.id,
              serviceId: cartItem.serviceId,
              clothingItemId: cartItem.clothingItemId,
              quantity: creditsToUse
            });

            // Build package usage tracking for receipt display
            const packageId = customerPackage.packageId;
            if (!packageUsageMap.has(packageId)) {
              packageUsageMap.set(packageId, {
                packageId,
                items: []
              });
            }
            
            const packageUsage = packageUsageMap.get(packageId)!;
            const existingItem = packageUsage.items.find(
              item => item.serviceId === cartItem.serviceId && 
                     item.clothingItemId === cartItem.clothingItemId
            );
            
            if (existingItem) {
              existingItem.quantity += creditsToUse;
            } else {
              packageUsage.items.push({
                serviceId: cartItem.serviceId,
                clothingItemId: cartItem.clothingItemId,
                quantity: creditsToUse
              });
            }

            // Update the package item balance to reflect usage
            packageItem.balance -= creditsToUse;
            remainingQuantity -= creditsToUse;
          }
        }
      }
    }

    if (usedCredits.length === 0) {
      return null;
    }

    return {
      packageUsages: Array.from(packageUsageMap.values()),
      usedCredits
    };
  } catch (error) {
    logger.error({ error, customerId }, "Error computing package usage");
    return null;
  }
}

function getServerTaxRate(): number {
  const raw = (process.env.TAX_RATE_PERCENT ?? process.env.TAX_RATE ?? '').trim();
  if (!raw) return 0; // default to no tax unless explicitly configured
  const n = Number(raw);
  if (!isFinite(n) || isNaN(n)) return 0;
  // If given like 8.5 treat as percent; if <=1 assume decimal (0.085)
  return n > 1 ? n / 100 : n;
}
const SERVER_TAX_RATE = getServerTaxRate();

export async function computeTotalsWithCredits(
  cartItems: any[],
  usedCredits: { serviceId: string; clothingItemId: string; quantity: number }[],
  storage: IStorage,
  userId: string,
  branchId: string
): Promise<{ subtotal: number; tax: number; total: number }> {
  const creditMap = new Map<string, number>();
  for (const credit of usedCredits) {
    const key = `${credit.serviceId}:${credit.clothingItemId}`;
    creditMap.set(key, (creditMap.get(key) || 0) + credit.quantity);
  }

  let subtotal = 0;
  for (const item of cartItems) {
    if (!item.serviceId || !item.clothingItemId || typeof item.quantity !== "number") {
      continue;
    }
    const price =
      (await storage.getItemServicePrice(
        item.clothingItemId,
        item.serviceId,
        userId,
        branchId,
      )) ?? 0;
    const key = `${item.serviceId}:${item.clothingItemId}`;
    const creditQty = Math.min(creditMap.get(key) || 0, item.quantity);
    const paidQty = item.quantity - creditQty;
    subtotal += price * paidQty;
    item.price = price;
    item.total = price * paidQty;
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const tax = Math.round(subtotal * SERVER_TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, tax, total };
}

export async function registerRoutes(
  app: Express,
  notificationService: NotificationService,
  options: RegisterRoutesOptions,
): Promise<Server> {
  const httpServer = createServer(app);
  const { eventBus } = options;
  const deliveryOrderWss = new WebSocketServer({ noServer: true });
  const driverLocationWss = new WebSocketServer({ noServer: true });
  const sessionMiddleware = getAdminSession();
  const passportInitialize = passport.initialize();
  const passportSession = passport.session();

  const orderSuggestionsService = new OrderSuggestionsService();
  const orderAnomaliesService = new OrderAnomaliesService();
  const forecastingService = new ForecastingService();
  const alertingEngine = new AlertingEngine({
    notificationService,
    forecastingService,
  });
  const workflowEngine = new WorkflowEngine({ logger });

  if (process.env.NODE_ENV !== "test") {
    setInterval(() => {
      alertingEngine.runDueRules().catch((error) => {
        logger.error({ err: error }, "scheduled alert evaluation failed");
      });
    }, 60_000);
  }

  const runMiddleware = (req: any, middleware: RequestHandler) =>
    new Promise<void>((resolve, reject) => {
      middleware(req, {} as any, (err?: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

  const broadcastDeliveryEvent = async (event: DeliveryChannelEvent) => {
    const tracking = await storage.getDeliveryTrackingSnapshot(event.orderId);
    const payload: Record<string, unknown> = {
      eventType: event.type,
      orderId: event.orderId,
    };

    if (event.type === "status") {
      payload.deliveryStatus = event.deliveryStatus;
      payload.driverId = event.driverId;
    } else if (event.type === "message") {
      payload.message = event.message;
    } else if (event.type === "reschedule") {
      payload.reschedule = event.reschedule;
    } else if (event.type === "compensation") {
      payload.compensation = event.compensation;
    }

    if (tracking) {
      payload.tracking = {
        etaMinutes: tracking.etaMinutes ?? null,
        distanceKm: tracking.distanceKm ?? null,
        driverLocation: tracking.driverLocation
          ? {
              lat: tracking.driverLocation.lat,
              lng: tracking.driverLocation.lng,
              timestamp: tracking.driverLocation.timestamp.toISOString(),
            }
          : null,
        deliveryLocation: tracking.deliveryLocation ?? null,
      };
    }

    const msg = JSON.stringify(payload);
    for (const client of deliveryOrderWss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(msg);
      }
    }
  };

  driverLocationWss.on("connection", (ws, req) => {
    const user = (req as any).user as User | undefined;
    if (!user || user.role !== "driver") {
      ws.close(1008, "Unauthorized");
      return;
    }

    storage.getLatestDriverLocations().then((locs) => {
      for (const loc of locs) {
        ws.send(JSON.stringify({
          driverId: loc.driverId,
          lat: loc.lat,
          lng: loc.lng,
          timestamp: loc.timestamp.toISOString(),
        }));
      }
    });

    ws.on("message", async (msg) => {
      if (!user || user.role !== "driver") {
        return;
      }

      try {
        const payload = JSON.parse(msg.toString()) as Record<string, unknown>;
        const lat = Number((payload as any).lat);
        const lng = Number((payload as any).lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        const parseNumber = (value: unknown) =>
          typeof value === "number" && Number.isFinite(value) ? value : undefined;
        const parseString = (value: unknown) => (typeof value === "string" && value.trim().length > 0 ? value : undefined);
        const parseDate = (value: unknown) => {
          if (typeof value !== "string") return undefined;
          const time = Date.parse(value);
          return Number.isNaN(time) ? undefined : new Date(time);
        };
        const metadataValue = (payload as Record<string, unknown>)["metadata"];

        const snapshot = await storage.updateDriverLocation({
          driverId: user.id,
          lat,
          lng,
          speedKph: parseNumber((payload as any).speedKph ?? (payload as any).speed),
          heading: parseNumber((payload as any).heading),
          accuracyMeters: parseNumber((payload as any).accuracyMeters ?? (payload as any).accuracy),
          altitudeMeters: parseNumber((payload as any).altitudeMeters ?? (payload as any).altitude),
          batteryLevelPct: parseNumber((payload as any).batteryLevelPct ?? (payload as any).batteryPct),
          source: parseString((payload as any).source),
          orderId: parseString((payload as any).orderId),
          deliveryId: parseString((payload as any).deliveryId),
          recordedAt: parseDate((payload as any).timestamp ?? (payload as any).recordedAt),
          metadata:
            typeof metadataValue === "object" && metadataValue !== null && !Array.isArray(metadataValue)
              ? (metadataValue as Record<string, unknown>)
              : undefined,
          isManualOverride: Boolean((payload as any).isManualOverride),
        });
        const broadcastPayload = JSON.stringify({
          driverId: snapshot.driverId,
          lat: snapshot.lat,
          lng: snapshot.lng,
          speedKph: snapshot.speedKph ?? null,
          heading: snapshot.heading ?? null,
          accuracyMeters: snapshot.accuracyMeters ?? null,
          altitudeMeters: snapshot.altitudeMeters ?? null,
          batteryLevelPct: snapshot.batteryLevelPct ?? null,
          orderId: snapshot.orderId ?? null,
          deliveryId: snapshot.deliveryId ?? null,
          source: snapshot.source ?? null,
          isManualOverride: snapshot.isManualOverride ?? false,
          timestamp: snapshot.timestamp.toISOString(),
        });
        for (const client of driverLocationWss.clients) {
          if (client.readyState === client.OPEN) {
            client.send(broadcastPayload);
          }
        }

        await eventBus.publish(
          createAnalyticsEvent({
            source: "api.driver-location",
            category: "driver.telemetry",
            name: "location_updated",
            payload: {
              driverId: snapshot.driverId,
              lat: snapshot.lat,
              lng: snapshot.lng,
              speedKph: snapshot.speedKph ?? undefined,
              heading: snapshot.heading ?? undefined,
              accuracyMeters: snapshot.accuracyMeters ?? undefined,
              orderId: snapshot.orderId ?? undefined,
              deliveryId: snapshot.deliveryId ?? undefined,
            },
            actor: {
              actorId: user.id,
              actorType: "driver",
              actorName: getActorName(user),
            },
            context: {
              tenantId: user.branchId ?? undefined,
            },
          }),
        );
      } catch {
        /* ignore */
      }
    });
  });

  httpServer.on("upgrade", async (req, socket, head) => {
    const { pathname } = new URL(req.url || "", "http://localhost");

    const isDeliveryOrders = pathname === "/ws/delivery-orders";
    const isDriverLocation = pathname === "/ws/driver-location";

    if (!isDeliveryOrders && !isDriverLocation) {
      if (process.env.NODE_ENV !== "development") {
        socket.destroy();
      }
      return;
    }

    if (isDeliveryOrders) {
      deliveryOrderWss.handleUpgrade(req, socket, head, (ws) => {
        deliveryOrderWss.emit("connection", ws, req);
      });
      return;
    }

    if (isDriverLocation) {
      try {
        await runMiddleware(req, sessionMiddleware);
        await runMiddleware(req, passportInitialize);
        await runMiddleware(req, passportSession);
      } catch {
        socket.destroy();
        return;
      }

      const user = (req as any).user as User | undefined;
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      if (user.role !== "driver") {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      driverLocationWss.handleUpgrade(req, socket, head, (ws) => {
        driverLocationWss.emit("connection", ws, req);
      });
    }
  });

  app.get("/api/driver-locations", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      if (!["driver", "admin", "super_admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { driverId, branchId } = req.query as { driverId?: string; branchId?: string };
      const conditions = [eq(users.role, "driver")] as any[];

      if (user.role === "driver") {
        if (driverId && driverId !== user.id) {
          return res.status(403).json({ message: "Access denied" });
        }
        conditions.push(eq(users.id, user.id));
      } else {
        if (driverId) {
          conditions.push(eq(users.id, driverId));
        }
        if (user.role !== "super_admin" && user.branchId) {
          conditions.push(eq(users.branchId, user.branchId));
        } else if (user.role === "super_admin" && branchId) {
          conditions.push(eq(users.branchId, branchId));
        }
      }

      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
      const driverRows = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          username: users.username,
          branchId: users.branchId,
        })
        .from(users)
        .where(whereClause);

      if (driverRows.length === 0) {
        return res.json([]);
      }

      const driverMap = new Map(
        driverRows.map((row) => [row.id, { ...row, name: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.username }]),
      );
      const locations = await storage.getLatestDriverLocations(driverRows.map((row) => row.id));

      res.json(
        locations.map((loc) => {
          const info = driverMap.get(loc.driverId);
          return {
            driverId: loc.driverId,
            lat: loc.lat,
            lng: loc.lng,
            timestamp: loc.timestamp.toISOString(),
            driverName: info?.name ?? null,
            branchId: info?.branchId ?? null,
          };
        }),
      );
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch driver locations");
      res.status(500).json({ message: "Failed to fetch driver locations" });
    }
  });

  app.get("/api/driver-locations/:driverId/history", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      if (!["driver", "admin", "super_admin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { driverId } = req.params;
      if (user.role === "driver" && driverId !== user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const [driver] = await db
        .select({ id: users.id, branchId: users.branchId })
        .from(users)
        .where(and(eq(users.id, driverId), eq(users.role, "driver")))
        .limit(1);

      if (!driver) {
        return res.status(404).json({ message: "Driver not found" });
      }

      if (user.role === "admin" && user.branchId && driver.branchId !== user.branchId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { limit, sinceMinutes } = req.query as { limit?: string; sinceMinutes?: string };
      const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
      const parsedSince = sinceMinutes ? Number.parseInt(sinceMinutes, 10) : undefined;
      const history = await storage.getDriverLocationHistory(driverId, {
        limit: parsedLimit != null && !Number.isNaN(parsedLimit) ? parsedLimit : undefined,
        sinceMinutes: parsedSince != null && !Number.isNaN(parsedSince) ? parsedSince : undefined,
      });

      res.json(
        history.map((entry) => ({
          driverId: entry.driverId,
          lat: entry.lat,
          lng: entry.lng,
          timestamp: entry.timestamp.toISOString(),
        })),
      );
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch driver location history");
      res.status(500).json({ message: "Failed to fetch driver location history" });
    }
  });

  // Setup authentication
  await setupAuth(app, {
    sessionMiddleware,
    passportInitialize,
    passportSession,
  });
  app.use(auditMiddleware);
  // Attach derived tenantId (branch) to each request for downstream use
  app.use(attachTenant);
  // Optional: seed data only when explicitly enabled
  if (process.env.SEED_ON_START === 'true') {
    await seedSuperAdmin();
    await seedBranches();
    await seedPackages();
  }

  registerHealthRoutes(app);

  // Authentication routes
  app.post("/api/login", (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid login data" });
    }
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Login failed" });
      }

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }
        
        // Set session data manually and save
        req.session.passport = { user: user.id };
        req.session.save((saveErr) => {
          if (saveErr) {
            logger.error({ err: saveErr }, "Session save error");
            return next(saveErr);
          }

          logger.debug({ sessionID: req.sessionID }, "Session saved successfully");

          // Don't send password hash to client
          const { passwordHash, ...safeUser } = user;
          return res.json({ user: safeUser, message: "Login successful" });
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    const userId = (req.user as any)?.id;
    
    req.logout((err) => {
      if (err) {
        logger.error({ err, userId }, 'Error during admin logout');
        return res.status(500).json({ message: "Logout failed" });
      }
      
      // Destroy session completely for security
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          logger.error({ sessionErr, userId }, 'Error destroying admin session during logout');
        }
        
        // Clear the session cookie
        res.clearCookie('sid', { 
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
        });
        
        logger.info({ userId }, 'Admin logged out successfully');
        res.json({ message: "Logout successful" });
      });
    });
  });

  app.get("/api/auth/user", requireAuth, (req, res) => {
    const user = req.user as any;
    // Sanitize user object - remove sensitive fields
    const sanitizedUser = {
      ...user,
      passwordHash: undefined // Remove password hash for security
    };
    logger.debug({ role: user?.role }, "Auth API - returning sanitized user");
    res.json(sanitizedUser);
  });

  app.post("/auth/password/forgot", async (req, res) => {
    try {
      const { username } = z.object({ username: z.string() }).parse(req.body);
      const ip = req.ip;
      if (isRateLimited(`u:${username}`) || isRateLimited(`i:${ip}`)) {
        return res.status(429).json({ message: "tooManyRequests" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ message: "userNotFound" });
      }
      const token = randomUUID();
      passwordResetTokens.set(token, {
        userId: user.id,
        expires: new Date(Date.now() + 30 * 60 * 1000),
      });
      // In production, send email. For tests, return token.
      res.json({ message: "passwordResetLinkSent", token });
    } catch (err) {
      res.status(400).json({ message: "invalidData" });
    }
  });

  app.post("/auth/password/reset", async (req, res) => {
    try {
      const { token, newPassword } = z
        .object({ token: z.string(), newPassword: z.string() })
        .parse(req.body);
      const info = passwordResetTokens.get(token);
      if (!info || info.expires < new Date()) {
        return res.status(400).json({ message: "invalidOrExpiredToken" });
      }
      const schema = passwordSchema("passwordRequirements");
      try {
        schema.parse(newPassword);
      } catch {
        return res.status(400).json({ message: "passwordRequirements" });
      }
      await storage.updateUserPassword(info.userId, newPassword);
      passwordResetTokens.delete(token);
      res.json({ message: "passwordReset" });
    } catch {
      res.status(400).json({ message: "invalidData" });
    }
  });


  // Customer authentication routes
  app.post("/customer/register", async (req, res) => {
    try {
      const ip = req.ip;
      // Security: Rate limit registration attempts per IP
      if (isRateLimited(`reg_ip:${ip}`, 'register')) {
        return res.status(429).json({ message: "Too many registration attempts. Please try again later." });
      }
      
      const schema = z.object({
        branchCode: z.string(),
        phoneNumber: z.string(),
        name: z.string(),
        password: z.string().min(8),
        city: z.string(),
        addressLabel: z.string().optional(),
        address: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
      });
      const data = schema.parse(req.body);
      
      // Additional rate limiting per phone number to prevent spam
      if (isRateLimited(`reg_phone:${data.phoneNumber}`, 'register')) {
        return res.status(429).json({ message: "Too many attempts with this phone number. Please try again later." });
      }
      
      const branch = await storage.getBranchByCode(data.branchCode);
      if (!branch) return res.status(404).json({ message: "Branch not found" });
      if (branch.serviceCityIds?.length && !branch.serviceCityIds.includes(data.city)) {
        return res.status(400).json({ message: "areas.notServed" });
      }
      const existing = await storage.getCustomerByPhone(data.phoneNumber, branch.id);
      if (existing) {
        return res.status(400).json({ message: "Customer already exists" });
      }
      const passwordHash = await bcrypt.hash(data.password, 10);
      const customer = await storage.createCustomer(
        { phoneNumber: data.phoneNumber, name: data.name, passwordHash },
        branch.id,
      );
      if (data.address && data.addressLabel) {
        await storage.createCustomerAddress({
          customerId: customer.id,
          label: data.addressLabel,
          address: data.address,
          lat: data.lat,
          lng: data.lng,
          isDefault: true,
        });
      }
      
      // Clear rate limiting on successful registration
      clearRateLimit(`reg_ip:${ip}`);
      clearRateLimit(`reg_phone:${data.phoneNumber}`);
      
      req.session.customerId = customer.id;
      const { passwordHash: _pw, ...safe } = customer;
      res.status(201).json(safe);
    } catch (err) {
      res.status(400).json({ message: "Invalid registration data" });
    }
  });

  app.post("/customer/login", async (req, res) => {
    try {
      const schema = z.object({ phoneNumber: z.string(), password: z.string() });
      const { phoneNumber, password } = schema.parse(req.body);
      const ip = req.ip;
      
      // Security: Rate limit login attempts per IP and per phone number
      if (isRateLimited(`login_ip:${ip}`, 'login') || isRateLimited(`login_phone:${phoneNumber}`, 'login')) {
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }
      
      const customer = await storage.getCustomerByPhone(phoneNumber);
      if (!customer || !customer.passwordHash) {
        logger.warn({ phoneNumber, ip }, 'Failed customer login attempt - invalid phone');
        return res.status(401).json({ message: "Invalid phone or password" });
      }
      
      const valid = await bcrypt.compare(password, customer.passwordHash);
      if (!valid) {
        logger.warn({ phoneNumber, ip, customerId: customer.id }, 'Failed customer login attempt - invalid password');
        return res.status(401).json({ message: "Invalid phone or password" });
      }
      
      // Clear rate limiting on successful login
      clearRateLimit(`login_ip:${ip}`);
      clearRateLimit(`login_phone:${phoneNumber}`);
      
      req.session.customerId = customer.id;
      const { passwordHash, ...safe } = customer;
      logger.info({ customerId: customer.id, ip }, 'Successful customer login');
      res.json(safe);
    } catch (err) {
      res.status(400).json({ message: "Invalid login data" });
    }
  });

  app.post("/customer/logout", (req, res) => {
    const customerId = req.session.customerId;
    
    // Properly destroy the session for security
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err, customerId }, 'Error destroying customer session during logout');
        return res.status(500).json({ message: "Logout failed" });
      }
      
      // Clear the session cookie
      res.clearCookie('sid', { 
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
      
      logger.info({ customerId }, 'Customer logged out successfully');
      res.json({ message: "Logout successful" });
    });
  });

  app.get("/customer/me", async (req, res) => {
    const customerId = req.session.customerId;
    if (!customerId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const customer = await storage.getCustomer(customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const { passwordHash, ...safe } = customer;
      res.json(safe);
    } catch {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post("/customer/request-password-reset", async (req, res) => {
    try {
      const { phoneNumber } = z.object({ phoneNumber: z.string() }).parse(req.body);
      const ip = req.ip;
      if (isRateLimited(`reset_phone:${phoneNumber}`, 'reset') || isRateLimited(`reset_ip:${ip}`, 'reset')) {
        return res.status(429).json({ message: "Too many password reset requests. Please try again later." });
      }
      const customer = await storage.getCustomerByPhone(phoneNumber);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const otp = generateCustomerPasswordOtp(phoneNumber);
      
      // Send OTP via SMS using NotificationService (secure approach)
      const otpMessage = `Your password reset code is: ${otp}. Valid for 10 minutes.`;
      await notificationService.sendSMS(phoneNumber, otpMessage);
      
      // SECURITY: Never return OTP in API response - only send via SMS
      // Development debugging can be enabled via environment variable
      const response: any = { message: "OTP sent successfully to your mobile number" };
      if (process.env.NODE_ENV === "development" && process.env.DEBUG_OTP === "true") {
        response.debug_otp = otp; // Only for local development debugging
      }
      res.json(response);
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.post("/customer/reset-password", async (req, res) => {
    try {
      const { phoneNumber, otp, newPassword } = z
        .object({
          phoneNumber: z.string(),
          otp: z.string(),
          newPassword: z.string().min(8),
        })
        .parse(req.body);
      if (!verifyCustomerPasswordOtp(phoneNumber, otp)) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }
      const customer = await storage.getCustomerByPhone(phoneNumber);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await storage.updateCustomerPassword(customer.id, passwordHash);
      res.json({ message: "Password updated" });
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.get("/customer/addresses", async (req, res) => {
    const customerId = req.session.customerId;
    if (!customerId) return res.status(401).json({ message: "Login required" });
    try {
      const addresses = await storage.getCustomerAddresses(customerId);
      res.json(addresses);
    } catch {
      res.status(500).json({ message: "Failed to fetch addresses" });
    }
  });

  app.post("/customer/addresses", async (req, res) => {
    const customerId = req.session.customerId;
    if (!customerId) return res.status(401).json({ message: "Login required" });
    try {
      const data = insertCustomerAddressSchema
        .omit({ customerId: true })
        .parse(req.body);
      const address = await storage.createCustomerAddress({ ...data, customerId });
      res.status(201).json(address);
    } catch {
      res.status(400).json({ message: "Invalid address data" });
    }
  });

  app.put("/customer/addresses/:id", async (req, res) => {
    const customerId = req.session.customerId;
    if (!customerId) return res.status(401).json({ message: "Login required" });
    try {
      const data = insertCustomerAddressSchema
        .partial()
        .omit({ customerId: true })
        .parse(req.body);
      const address = await storage.updateCustomerAddress(req.params.id, data, customerId);
      if (!address) return res.status(404).json({ message: "Address not found" });
      res.json(address);
    } catch {
      res.status(400).json({ message: "Invalid address data" });
    }
  });

  app.delete("/customer/addresses/:id", async (req, res) => {
    const customerId = req.session.customerId;
    if (!customerId) return res.status(401).json({ message: "Login required" });
    try {
      const success = await storage.deleteCustomerAddress(req.params.id, customerId);
      if (!success) return res.status(404).json({ message: "Address not found" });
      res.status(204).end();
    } catch {
      res.status(500).json({ message: "Failed to delete address" });
    }
  });

  app.get("/customer/packages", requireCustomerOrAdmin, async (req, res) => {
    const customerId = req.session.customerId;
    if (!customerId) return res.status(401).json({ message: "Login required" });
    try {
      const packages = await storage.getCustomerPackagesWithUsage(customerId);
      res.json(packages);
    } catch {
      res.status(500).json({ message: "Failed to fetch packages" });
    }
  });

  app.get("/customer/orders", async (req, res) => {
    const customerId = req.session.customerId;
    if (!customerId) return res.status(401).json({ message: "Login required" });
    try {
      let orders = await storage.getOrdersByCustomer(customerId);
      orders = orders
        .filter((o: any) => !o.isDeliveryRequest)
        .sort((a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 10);
      const mapped = orders.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        subtotal: o.subtotal,
        paid: o.paid,
        remaining: o.remaining,
      }));
      res.json(mapped);
    } catch {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/customer/orders/:id/receipt", async (req, res) => {
    const customerId = req.session.customerId;
    if (!customerId) return res.status(401).json({ message: "Login required" });
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order || order.customerId !== customerId) {
        return res.status(404).json({ message: "Order not found" });
      }
      let packages: any[] = [];
      if (order.customerId) {
        try {
          packages = await storage.getCustomerPackagesWithUsage(order.customerId);
          if (order.packageUsages) {
            packages = applyPackageUsageModification(
              packages,
              Array.isArray(order.packageUsages) ? order.packageUsages : [],
            );
          }
        } catch (error) {
          logger.error(
            { err: error, orderId: order.id, customerId: order.customerId },
            "Failed to fetch customer packages",
          );
        }
      }
      res.json({ ...order, packages });
    } catch {
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.post("/api/chatbot", async (req, res) => {
    const customerId = (req.session as any).customerId as string | undefined;
    if (!customerId) return res.status(401).json({ message: "Login required" });
    const message = String(req.body?.message || "").toLowerCase();

    try {
      if (message.includes("package")) {
        const packages = await storage.getCustomerPackagesWithUsage(customerId);
        return res.json({ reply: "Here are your packages", packages });
      }

      if (message.includes("order")) {
        const orders = await storage.getOrdersByCustomer(customerId);
        const summaries = orders
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10)
          .map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            createdAt: o.createdAt,
            itemCount: Array.isArray(o.items)
              ? o.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
              : 0,
            subtotal: o.subtotal,
            paid: o.paid,
            remaining: o.remaining,
          }));
        return res.json({ reply: "Here is your recent order history", orders: summaries });
      }

      return res.json({ reply: "I can help show your packages or order history." });
    } catch (error) {
      logger.error({ err: error, customerId }, "Chatbot handler failed");
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Customer addresses for ordering interface
  app.get("/api/customers/:customerId/addresses", async (req, res) => {
    const sessionCustomerId = req.session.customerId;
    const { customerId } = req.params;
    
    // Ensure the requesting customer can only access their own addresses
    if (!sessionCustomerId || sessionCustomerId !== customerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const addresses = await storage.getCustomerAddresses(customerId);
      res.json(addresses);
    } catch (error) {
      logger.error("Error fetching customer addresses:", error as any);
      res.status(500).json({ message: "Failed to fetch addresses" });
    }
  });

  // Create customer address for ordering interface
  app.post("/api/customers/:customerId/addresses", async (req, res) => {
    const sessionCustomerId = req.session.customerId;
    const { customerId } = req.params;
    
    // Ensure the requesting customer can only create addresses for themselves
    if (!sessionCustomerId || sessionCustomerId !== customerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const data = insertCustomerAddressSchema
        .omit({ customerId: true })
        .parse(req.body);
      const address = await storage.createCustomerAddress({ ...data, customerId });
      res.status(201).json(address);
    } catch (error) {
      logger.error("Error creating customer address:", error as any);
      res.status(400).json({ message: "Invalid address data" });
    }
  });

  const optimizationService = new DeliveryOptimizationService({ storage, logger });

  registerDeliveryRoutes({
    app,
    storage,
    logger,
    requireAuth,
    requireAdminOrSuperAdmin,
    broadcastDeliveryEvent,
    eventBus,
    optimizationService,
  });

  registerDeliveryMessageRoutes({
    app,
    storage,
    logger,
    requireAuth,
    broadcastDeliveryEvent,
    eventBus,
  });

  registerDeliveryActionRoutes({
    app,
    storage,
    logger,
    requireAuth,
    broadcastDeliveryEvent,
  });

  const customerInsightsService = new CustomerInsightsService();

  await registerGraphql({
    app,
    httpServer,
    storage,
    workflowEngine,
    requireAuth,
    services: {
      customerInsightsService,
      optimizationService,
    },
  });
  registerCustomerCommandCenterRoutes({
    app,
    storage,
    requireAdminOrSuperAdmin,
    logger,
    customerInsightsService,
    eventBus,
  });

  app.put("/api/users/:id", requireAuth, async (req, res, next) => {
    const { id } = req.params;
    const user = req.user as UserWithBranch;
    if (user.id !== id) {
      if (user.role === "super_admin") return next();
      return res.status(403).json({ message: "Unauthorized" });
    }
    try {
      const data = insertUserSchema
        .pick({ firstName: true, lastName: true, email: true })
        .partial()
        .parse(req.body);
      const updated = await storage.updateUserProfile(id, data);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      const { passwordHash, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      logger.error("Error updating profile:", error as any);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.put("/api/users/:id/password", requireAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.user as UserWithBranch;
    if (user.id !== id) {
      return res.status(403).json({ message: "Unauthorized" });
    }
    try {
      const { password } = req.body as { password: string };
      const updated = await storage.updateUserPassword(id, password);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "Password updated" });
    } catch (error) {
      logger.error("Error updating password:", error as any);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // User management routes (Super Admin only)
  app.get("/api/users", requireSuperAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      // Don't send password hashes
      const safeUsers = users.map(({ passwordHash: _passwordHash, ...user }: UserWithBranch) => user);
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/users", requireSuperAdmin, async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const newUser = await storage.createUser(validatedData);
      // Don't send password hash
      const { passwordHash, ...safeUser } = newUser;
      res.json(safeUser);
    } catch (error) {
      logger.error("Error creating user:", error as any);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  app.put("/api/users/:id", requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = updateUserSchema.parse(req.body);
      if (validatedData.passwordHash === "") {
        delete validatedData.passwordHash;
      }
      const updatedUser = await storage.updateUser(id, validatedData);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      // Don't send password hash
      const { passwordHash, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      logger.error("Error updating user:", error as any);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  app.put("/api/users/:id/branch", requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const data = insertUserSchema.pick({ branchId: true }).parse(req.body);
      const updatedUser = await storage.updateUserBranch(id, data.branchId ?? null);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const { passwordHash, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      logger.error("Error updating user branch:", error as any);
      res.status(500).json({ message: "Failed to update user branch" });
    }
  });

  // Category management routes (Admin or Super Admin)
  app.get("/api/categories", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const type = req.query.type as string;
      const userId = (req.user as UserWithBranch).id;
      const categories = type
        ? await storage.getCategoriesByType(type, userId)
        : await storage.getCategories(userId);
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const validatedData = insertCategorySchema.parse(req.body);
      const currentUser = req.user as UserWithBranch;
      const { userId: bodyUserId, ...categoryData } = validatedData;
      const userId =
        currentUser.role === "super_admin"
          ? bodyUserId ?? currentUser.id
          : currentUser.id;
      const newCategory = await storage.createCategory(categoryData, userId);
      res.json(newCategory);
    } catch (error) {
      logger.error("Error creating category:", error as any);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.put("/api/categories/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertCategorySchema.parse(req.body);
      const currentUser = req.user as UserWithBranch;
      const { userId: bodyUserId, ...categoryData } = validatedData;
      const userId =
        currentUser.role === "super_admin"
          ? bodyUserId ?? currentUser.id
          : currentUser.id;
      const updatedCategory = await storage.updateCategory(
        id,
        categoryData,
        userId,
      );
      if (!updatedCategory) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json(updatedCategory);
    } catch (error) {
      logger.error("Error updating category:", error as any);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/api/categories/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as UserWithBranch).id;
      const deleted = await storage.deleteCategory(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Category not found" });
      }
      res.json({ message: "Category deleted successfully" });
    } catch (error) {
      logger.error("Error deleting category:", error as any);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  registerCatalogRoutes({
    app,
    storage,
    logger,
    requireAuth,
    requireAdminOrSuperAdmin,
    upload,
  });

  registerSmartOrderRoutes({
    app,
    requireAuth,
    storage,
    logger,
    eventBus,
    suggestionsService: orderSuggestionsService,
    anomaliesService: orderAnomaliesService,
  });

  registerAnalyticsWorkspaceRoutes(app, forecastingService);
  registerAlertRoutes(app, alertingEngine);
  registerWorkflowRoutes(app, workflowEngine);

  // Public branch info
  app.get("/api/branches/:code", async (req, res) => {
    try {
      const branch = await storage.getBranchByCode(req.params.code);
      if (!branch) {
        return res.status(404).json({ message: "Branch not found" });
      }
      // Only expose public fields needed by client
      const branchData = branch as any;
      const { name, nameAr, tagline, taglineAr, logoUrl, whatsappQrUrl, serviceCityIds } = branchData;
      const deliveryEnabled = branchData.deliveryEnabled || false;
      res.json({ name, nameAr, tagline, taglineAr, logoUrl, whatsappQrUrl, serviceCityIds, deliveryEnabled });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch branch" });
    }
  });

  app.get("/api/cities", async (_req, res) => {
    try {
      const cities = await storage.getCities();
      res.json(cities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cities" });
    }
  });

  // Admin Cities Management
  app.post("/api/admin/cities", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const cityPayload = z
        .object({
          nameEn: z.string().min(1),
          nameAr: z.string().min(1),
          type: z.enum(["governorate", "area"]).default("area"),
          parentId: z.string().uuid().optional().nullable(),
          displayOrder: z.coerce.number().int().optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);

      if (cityPayload.type === "area") {
        if (!cityPayload.parentId) {
          return res.status(400).json({ message: "parentId is required for area" });
        }
        const [parent] = await db
          .select({ id: cities.id, type: cities.type })
          .from(cities)
          .where(eq(cities.id, cityPayload.parentId));
        if (!parent || (parent as any).type !== "governorate") {
          return res.status(400).json({ message: "Invalid governorate parentId" });
        }
      }

      const [created] = await db
        .insert(cities)
        .values({
          nameEn: cityPayload.nameEn,
          nameAr: cityPayload.nameAr,
          type: cityPayload.type as any,
          parentId: cityPayload.parentId ?? null,
          displayOrder: cityPayload.displayOrder ?? 0,
          isActive: cityPayload.isActive ?? true,
          updatedAt: new Date(),
        })
        .returning();

      res.status(201).json(created);
    } catch (error) {
      res.status(400).json({ message: "Failed to create city" });
    }
  });

  app.put("/api/admin/cities/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const payload = z
        .object({
          nameEn: z.string().min(1).optional(),
          nameAr: z.string().min(1).optional(),
          type: z.enum(["governorate", "area"]).optional(),
          parentId: z.string().uuid().nullable().optional(),
          displayOrder: z.coerce.number().int().optional(),
          isActive: z.boolean().optional(),
        })
        .parse(req.body);

      if (payload.type === "area") {
        if (payload.parentId === undefined) {
          // leave as is
        } else if (!payload.parentId) {
          return res.status(400).json({ message: "parentId is required for area" });
        } else {
          const [parent] = await db
            .select({ id: cities.id, type: cities.type })
            .from(cities)
            .where(eq(cities.id, payload.parentId));
          if (!parent || (parent as any).type !== "governorate") {
            return res.status(400).json({ message: "Invalid governorate parentId" });
          }
        }
      }

      const updateData: any = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined) (updateData as any)[k] = v;
      }

      const [updated] = await db.update(cities).set(updateData).where(eq(cities.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "City not found" });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ message: "Failed to update city" });
    }
  });

  app.delete("/api/admin/cities/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const [updated] = await db
        .update(cities)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(cities.id, id))
        .returning();
    
      if (!updated) return res.status(404).json({ message: "City not found" });
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete city" });
    }
  });

  // Bulk cities template (CSV)
  app.get("/api/admin/cities/template", requireAdminOrSuperAdmin, async (_req, res) => {
    const csv = [
      [
        "nameEn",
        "nameAr",
        "type",
        "parentId",
        "parentNameEn",
        "displayOrder",
        "isActive",
      ].join(","),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=city-template.csv");
    res.send(csv);
  });

  // Bulk cities sample (CSV with example data)
  app.get("/api/admin/cities/sample", requireAdminOrSuperAdmin, async (_req, res) => {
    const header = [
      "nameEn",
      "nameAr",
      "type",
      "parentId",
      "parentNameEn",
      "displayOrder",
      "isActive",
    ].join(",");

    // Provide a small representative subset that uses parentNameEn links
    const rows = [
      // Governorates
      ["Al Asimah", "العاصمة", "governorate", "", "", "0", "true"],
      ["Hawalli", "حولي", "governorate", "", "", "0", "true"],
      // Areas under Al Asimah
      ["Sharq", "شرق", "area", "", "Al Asimah", "1", "true"],
      ["Shuwaikh", "الشويخ", "area", "", "Al Asimah", "2", "true"],
      // Areas under Hawalli
      ["Salmiya", "السالمية", "area", "", "Hawalli", "1", "true"],
      ["Jabriya", "الجابرية", "area", "", "Hawalli", "2", "true"],
    ];

    const csv = [header, ...rows.map((r) => r.join(","))].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=city-sample.csv");
    res.send(csv);
  });

  // Bulk cities upload (CSV)
  app.post(
    "/api/admin/cities/bulk-upload",
    requireAdminOrSuperAdmin,
    upload.single("file"),
    async (req, res) => {
      try {
        const buf = req.file?.buffer;
        if (!buf || !buf.length) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        const text = buf.toString("utf8");
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        if (lines.length === 0) {
          return res.status(400).json({ message: "Empty CSV" });
        }
        const headers = lines[0].split(",").map((h) => h.trim());
        const idx = (name: string) => headers.indexOf(name);
        const required = ["nameEn", "nameAr", "type"];
        for (const r of required) {
          if (idx(r) === -1) {
            return res.status(400).json({ message: `Missing column: ${r}` });
          }
        }

        const colParentId = idx("parentId");
        const colParentName = idx("parentNameEn");
        const colDisp = idx("displayOrder");
        const colActive = idx("isActive");

        let inserted = 0;
        let updated = 0;
        const errors: { line: number; error: string }[] = [];

        // cache governorates by nameEn for quick lookups
        const govRows = await db
          .select({ id: cities.id, nameEn: cities.nameEn })
          .from(cities)
          .where(eq(cities.type, "governorate" as any));
        const govByName = new Map(govRows.map((g) => [g.nameEn.toLowerCase(), g.id]));

        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map((p) => p.trim());
          if (parts.length === 1 && parts[0] === "") continue;
          const safe = (idx: number) => (idx >= 0 ? (parts[idx] ?? "").trim() : "");
          const nameEn = safe(idx("nameEn"));
          const nameAr = safe(idx("nameAr"));
          const type = safe(idx("type")).toLowerCase();
          let parentId = colParentId >= 0 ? safe(colParentId) : "";
          const parentNameEn = colParentName >= 0 ? safe(colParentName) : "";
          const displayOrder = colDisp >= 0 ? Number.parseInt(safe(colDisp) || "0", 10) : 0;
          const isActive = colActive >= 0 ? /^true|1|yes$/i.test(safe(colActive)) : true;

          if (!nameEn || !nameAr || !["governorate", "area"].includes(type)) {
            errors.push({ line: i + 1, error: "Invalid row values" });
            continue;
          }

          if (type === "area" && !parentId) {
            if (parentNameEn) {
              const govId = govByName.get(parentNameEn.toLowerCase());
              if (govId) parentId = govId;
            }
          }
          if (type === "area" && !parentId) {
            errors.push({ line: i + 1, error: "Missing parent governorate" });
            continue;
          }

          // Try find existing city by nameEn + type
          const [existing] = await db
            .select({ id: cities.id })
            .from(cities)
            .where(and(eq(cities.nameEn, nameEn), eq(cities.type, type as any)))
            .limit(1);

          if (existing) {
            const [row] = await db
              .update(cities)
              .set({ nameAr, parentId: type === "area" ? (parentId || null) : null, displayOrder, isActive, updatedAt: new Date() })
              .where(eq(cities.id, existing.id))
              .returning();
            if (row) updated++;
          } else {
            const [row] = await db
              .insert(cities)
              .values({ nameEn, nameAr, type: type as any, parentId: type === "area" ? (parentId || null) : null, displayOrder, isActive, updatedAt: new Date() })
              .returning();
            if (row) inserted++;
          }
        }

        res.json({ inserted, updated, errors });
      } catch (error) {
        logger.error("Bulk upload cities failed", error as any);
        res.status(400).json({ message: "Failed to process file" });
      }
    },
  );

  // Coupon management routes
  app.get("/api/coupons", requireAuth, async (req, res) => {
    try {
      const branchId = (req.user as UserWithBranch)?.branchId || undefined;
      const coupons = await storage.getCoupons(branchId);
      res.json(coupons);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch coupons" });
    }
  });

  app.get("/api/coupons/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const branchId = (req.user as UserWithBranch)?.branchId || undefined;
      const coupon = await storage.getCoupon(id, branchId);
      if (!coupon) return res.status(404).json({ message: "Coupon not found" });

      // Get applicable items and services
      const clothingItems = await storage.getCouponClothingItems(id);
      const services = await storage.getCouponServices(id);
      
      res.json({ 
        ...coupon,
        clothingItems: clothingItems.map(ci => ci.clothingItemId),
        services: services.map(cs => cs.serviceId)
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch coupon" });
    }
  });

  app.post("/api/coupons", requireAuth, async (req, res) => {
    try {
      const branchId = (req.user as UserWithBranch)?.branchId || "default";
      const createdBy = (req.user as UserWithBranch)?.id || "unknown";
      const { clothingItemIds = [], serviceIds = [], ...couponData } = req.body;

      // Validate that specific items/services are provided when needed
      if (couponData.applicationType === "specific_items" && clothingItemIds.length === 0) {
        return res.status(400).json({ message: "Clothing items must be specified for item-specific coupons" });
      }
      if (couponData.applicationType === "specific_services" && serviceIds.length === 0) {
        return res.status(400).json({ message: "Services must be specified for service-specific coupons" });
      }

      const coupon = await storage.createCoupon(couponData, branchId, createdBy, clothingItemIds, serviceIds);
      res.status(201).json(coupon);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to create coupon" });
    }
  });

  app.put("/api/coupons/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const branchId = (req.user as UserWithBranch)?.branchId || undefined;
      const { clothingItemIds = [], serviceIds = [], ...couponData } = req.body;

      // Validate that specific items/services are provided when needed
      if (couponData.applicationType === "specific_items" && clothingItemIds.length === 0) {
        return res.status(400).json({ message: "Clothing items must be specified for item-specific coupons" });
      }
      if (couponData.applicationType === "specific_services" && serviceIds.length === 0) {
        return res.status(400).json({ message: "Services must be specified for service-specific coupons" });
      }

      const coupon = await storage.updateCoupon(id, couponData, branchId, clothingItemIds, serviceIds);
      if (!coupon) return res.status(404).json({ message: "Coupon not found" });
      res.json(coupon);
    } catch (error: any) {
      res.status(400).json({ message: error.message || "Failed to update coupon" });
    }
  });

  app.delete("/api/coupons/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const branchId = (req.user as UserWithBranch)?.branchId || undefined;
      const deleted = await storage.deleteCoupon(id, branchId);
      if (!deleted) return res.status(404).json({ message: "Coupon not found" });
      res.json({ message: "Coupon deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete coupon" });
    }
  });

  app.post("/api/coupons/validate", async (req, res) => {
    try {
      const { code, branchId, cartItems = [] } = req.body;
      const validation = await storage.validateCoupon(code, branchId, cartItems);
      res.json(validation);
    } catch (error) {
      res.status(500).json({ message: "Failed to validate coupon" });
    }
  });

  // Global reporting routes (Super Admin only)
  app.get("/api/reports/global-stats", requireSuperAdmin, async (_req, res) => {
    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      
      // Get all transactions, orders, payments, and branches for comprehensive calculations
      const [allTransactions, allOrders, allPayments, branches] = await Promise.all([
        storage.getTransactions(),
        storage.getOrders(),
        storage.getPayments(),
        storage.getBranches()
      ]);

      // Filter by date ranges
      const currentMonthTransactions = allTransactions.filter(t => new Date(t.createdAt) >= lastMonth);
      const currentMonthPayments = allPayments.filter(p => new Date(p.createdAt) >= lastMonth);
      
      const previousMonthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), lastMonth.getDate());
      const previousMonthStart = new Date(previousMonthEnd.getFullYear(), previousMonthEnd.getMonth() - 1, previousMonthEnd.getDate());
      
      const previousMonthTransactions = allTransactions.filter(t => {
        const date = new Date(t.createdAt);
        return date >= previousMonthStart && date < lastMonth;
      });
      const previousMonthPayments = allPayments.filter(p => {
        const date = new Date(p.createdAt);
        return date >= previousMonthStart && date < lastMonth;
      });

      // Use only payments table to avoid double counting cash orders
      // Cash orders appear in both transactions and payments tables
      const totalRevenue = allPayments.reduce<number>((sum, payment) => sum + parseAmount(payment.amount), 0);

      const currentRevenue = currentMonthPayments.reduce<number>(
        (sum, payment) => sum + parseAmount(payment.amount),
        0,
      );

      const previousRevenue = previousMonthPayments.reduce<number>(
        (sum, payment) => sum + parseAmount(payment.amount),
        0,
      );
      
      const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue * 100) : 0;

      const totalOrders = allOrders.length;
      const currentOrders = allOrders.filter(o => new Date(o.createdAt) >= lastMonth).length;
      const previousOrders = allOrders.filter(o => {
        const date = new Date(o.createdAt);
        return date >= previousMonthStart && date < lastMonth;
      }).length;
      const orderGrowth = previousOrders > 0 ? ((currentOrders - previousOrders) / previousOrders * 100) : 0;

      // Active users (customers who placed orders in last 30 days)
      const activeUsers = new Set(allOrders.filter(o => new Date(o.createdAt) >= lastMonth).map(o => o.customerId).filter(Boolean)).size;

      res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        revenueGrowth: Math.round(revenueGrowth * 100) / 100,
        totalOrders,
        orderGrowth: Math.round(orderGrowth * 100) / 100,
        activeUsers,
        activeBranches: branches.filter(b => (b as any).deliveryEnabled).length,
        totalBranches: branches.length
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch global stats" });
    }
  });

  app.get("/api/reports/branch-performance", requireSuperAdmin, async (_req, res) => {
    try {
      const [allTransactions, allOrders, allPayments, branches] = await Promise.all([
        storage.getTransactions(),
        storage.getOrders(),
        storage.getPayments(),
        storage.getBranches()
      ]);

      const branchPerformance = branches.map(branch => {
        const branchOrders = allOrders.filter(o => o.branchId === branch.id);
        const branchTransactions = allTransactions.filter(t => t.branchId === branch.id);
        
        // Get customers from this branch to match with their package payments
        const branchCustomerIds = new Set(branchOrders.map(o => o.customerId).filter(Boolean));
        const branchPayments = allPayments.filter(p => branchCustomerIds.has(p.customerId));
        
        const transactionRevenue = branchTransactions.reduce<number>(
          (sum, transaction) => sum + parseAmount(transaction.total),
          0,
        );
        const packageRevenue = branchPayments.reduce<number>(
          (sum, payment) => sum + parseAmount(payment.amount),
          0,
        );
        const totalRevenue = transactionRevenue + packageRevenue;
        
        const orderCount = branchOrders.length;
        const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

        return {
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code,
          revenue: Math.round(totalRevenue * 100) / 100,
          orderCount,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
          isActive: (branch as any).deliveryEnabled || false
        };
      });

      res.json(branchPerformance);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch branch performance" });
    }
  });

  app.get("/api/reports/revenue-trends", requireSuperAdmin, async (_req, res) => {
    try {
      // Get both transactions and package payments for comprehensive revenue tracking
      const [allTransactions, allPayments] = await Promise.all([
        storage.getTransactions(),
        storage.getPayments()
      ]);
      
      // Group transactions and payments by month for the last 12 months
      const monthlyRevenue = [];
      const now = new Date();
      
      for (let i = 11; i >= 0; i--) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        
        const monthTransactions = allTransactions.filter(t => {
          const date = new Date(t.createdAt);
          return date >= month && date < nextMonth;
        });
        
        const monthPayments = allPayments.filter(p => {
          const date = new Date(p.createdAt);
          return date >= month && date < nextMonth;
        });
        
        const transactionRevenue = monthTransactions.reduce<number>(
          (sum, transaction) => sum + parseAmount(transaction.total),
          0,
        );
        const packageRevenue = monthPayments.reduce<number>(
          (sum, payment) => sum + parseAmount(payment.amount),
          0,
        );
        const totalRevenue = transactionRevenue + packageRevenue;
        
        const orderCount = monthTransactions.length;
        
        monthlyRevenue.push({
          month: month.toISOString().slice(0, 7), // YYYY-MM format
          revenue: Math.round(totalRevenue * 100) / 100,
          orderCount
        });
      }

      res.json(monthlyRevenue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch revenue trends" });
    }
  });

  app.get("/api/reports/service-analytics", requireSuperAdmin, async (_req, res) => {
    try {
      const allOrders = await storage.getOrders();
      
      // Aggregate service usage across all orders
      const serviceStats = new Map();
      
      allOrders.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const serviceName = item.service?.name || 'Unknown Service';
            const revenue = parseFloat(item.total || '0');
            
            if (serviceStats.has(serviceName)) {
              const current = serviceStats.get(serviceName);
              serviceStats.set(serviceName, {
                ...current,
                orderCount: current.orderCount + 1,
                revenue: current.revenue + revenue
              });
            } else {
              serviceStats.set(serviceName, {
                serviceName,
                orderCount: 1,
                revenue
              });
            }
          });
        }
      });

      const topServices = Array.from(serviceStats.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map(service => ({
          ...service,
          revenue: Math.round(service.revenue * 100) / 100
        }));

      res.json(topServices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service analytics" });
    }
  });

  // Branch customization routes
  app.get("/api/branches/:branchId/customization", requireAuth, async (req, res) => {
    try {
      const { branchId } = req.params;
      const user = req.user as UserWithBranch;
      
      // Allow super admin to access any branch, or branch-specific admin/user for their own branch
      if (user.role !== "super_admin" && user.branchId !== branchId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const customization = await storage.getBranchCustomization(branchId);
      res.json(customization);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch branch customization" });
    }
  });

  app.put("/api/branches/:branchId/customization", requireAuth, async (req, res) => {
    try {
      const { branchId } = req.params;
      const user = req.user as UserWithBranch;
      
      // Allow super admin to update any branch, or branch admin for their own branch
      if (user.role !== "super_admin" && user.branchId !== branchId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const customization = await storage.updateBranchCustomization(branchId, req.body);
      res.json(customization);
    } catch (error) {
      res.status(500).json({ message: "Failed to update branch customization" });
    }
  });

  // Order management routes for branches
  app.put("/api/orders/:orderId/status", requireAuth, async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status, notes, updatedBy } = req.body;
      const user = req.user as UserWithBranch;

      // Verify user has permission to update orders
      if (!user || user.role === "driver") {
        return res.status(403).json({ message: "Access denied" });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Check if user can access this order (branch permission)
      if (user.role !== "super_admin" && user.branchId !== order.branchId) {
        return res.status(403).json({ message: "Access denied to this order" });
      }

      // Valid status transitions (using orderStatusEnum from schema)
      const validStatuses = [
        "received",
        "start_processing",
        "processing", 
        "ready",
        "handed_over",
        "completed"
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      // Update order status
      const updatedOrder = await storage.updateOrderStatus(orderId, status, {
        actor: getActorName(user),
        notes,
      });
      res.json(updatedOrder);
    } catch (error) {
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  app.get("/api/orders/branch/:branchId", requireAuth, async (req, res) => {
    try {
      const { branchId } = req.params;
      const user = req.user as UserWithBranch;
      const { status, limit = "50" } = req.query;

      // Check permissions
      if (user.role !== "super_admin" && user.branchId !== branchId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const orders = await storage.getOrdersByBranch(branchId, {
        status: status as string,
        limit: parseInt(limit as string, 10)
      });

      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch branch orders" });
    }
  });

  // Lightweight image proxy to avoid CORB/CORS for allowed hosts
  app.get("/api/image-proxy", async (req, res) => {
    try {
      const rawUrl = (req.query.url as string) || "";
      if (!rawUrl) return res.status(400).json({ message: "Missing url" });
      let target: URL;
      try {
        target = new URL(rawUrl);
      } catch {
        return res.status(400).json({ message: "Invalid url" });
      }
      // Allowlist may be extended via env: ALLOWED_IMAGE_HOSTS=example.com,cdn.example.com
      const extra = (process.env.ALLOWED_IMAGE_HOSTS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const allowedHosts = [
        "drive.google.com",
        "lh3.googleusercontent.com",
        "googleusercontent.com",
        "i.imgur.com",
        ...extra,
      ];
      const okHost = allowedHosts.some(
        (h) => target.hostname === h || target.hostname.endsWith(`.${h}`),
      );
      if (!okHost) {
        // Instead of returning 400 (which floods logs/images), redirect to placeholder
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.redirect(302, "/uploads/placeholder-clothing.png");
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const upstream = await fetch(target.toString(), {
        headers: { Accept: "image/*" },
        signal: ctrl.signal,
      } as any);
      clearTimeout(timer);
      if (!upstream.ok) {
        return res.status(upstream.status).end();
      }
      const ct = upstream.headers.get("content-type") || "image/jpeg";
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to proxy image" });
    }
  });

  // Branch management routes (Super Admin only)
  app.get("/api/branches", requireSuperAdmin, async (_req, res) => {
    try {
      const branches = await storage.getBranches();
      const withUrls = branches.map((b) => {
        const result: any = {
          ...b,
          deliveryUrl: `/delivery/branch/${b.code}`,
        };
        if (!b.serviceCityIds || b.serviceCityIds.length === 0) {
          delete result.serviceCityIds;
        }
        return result;
      });
      res.json(withUrls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch branches" });
    }
  });

  app.post("/api/branches", requireSuperAdmin, async (req, res) => {
    try {
      const { deliveryCities = [], ...rest } = req.body;
      const validatedData = insertBranchSchema.parse({
        ...rest,
        logoUrl: rest.logoUrl || null,
        tagline: rest.tagline || null,
        deliveryEnabled: rest.deliveryEnabled ?? true,
      });
      const branch = await storage.createBranch(validatedData, deliveryCities);
      const response = {
        ...branch,
        ...(deliveryCities.length ? { serviceCityIds: deliveryCities } : {}),
      };
      res.json(response);
    } catch (error) {
      logger.error("Error creating branch:", error as any);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create branch" });
    }
  });

  app.put("/api/branches/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branches" });
      }
      const { deliveryCities = [], ...rest } = req.body;
      const validatedData = updateBranchSchema.parse({
        ...rest,
        logoUrl: rest.logoUrl || null,
        tagline: rest.tagline || null,
        deliveryEnabled: rest.deliveryEnabled ?? true,
      });
      const branch = await storage.updateBranch(id, validatedData, deliveryCities);
      if (!branch) {
        return res.status(404).json({ message: "Branch not found" });
      }
      const response = {
        ...branch,
        ...(branch.serviceCityIds && branch.serviceCityIds.length
          ? { serviceCityIds: branch.serviceCityIds }
          : {}),
      };
      res.json(response);
    } catch (error) {
      logger.error("Error updating branch:", error as any);
      res.status(500).json({ message: "Failed to update branch" });
    }
  });

  app.post(
    "/api/branches/:id/logo",
    requireAdminOrSuperAdmin,
    uploadLogo.single("logo"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const user = req.user as User;
        if (user.role !== "super_admin" && user.branchId !== id) {
          return res.status(403).json({ message: "Cannot modify other branches" });
        }
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        const logoUrl = `/uploads/${req.file.filename}`;
        const branch = await storage.updateBranch(id, { logoUrl });
        if (!branch) {
          return res.status(404).json({ message: "Branch not found" });
        }
        res.json({ logoUrl });
      } catch (error) {
        logger.error("Error uploading branch logo:", error as any);
        res.status(500).json({ message: "Failed to upload logo" });
      }
    },
  );

  // Upload WhatsApp QR code image for branch
  app.post(
    "/api/branches/:id/whatsapp-qr",
    requireAdminOrSuperAdmin,
    uploadLogo.single("whatsappQr"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const user = req.user as User;
        if (user.role !== "super_admin" && user.branchId !== id) {
          return res.status(403).json({ message: "Cannot modify other branches" });
        }
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        const whatsappQrUrl = `/uploads/${req.file.filename}`;
        const branch = await storage.updateBranch(id, { whatsappQrUrl } as any);
        if (!branch) {
          return res.status(404).json({ message: "Branch not found" });
        }
        res.json({ whatsappQrUrl });
      } catch (error) {
        logger.error("Error uploading WhatsApp QR:", error as any);
        res.status(500).json({ message: "Failed to upload WhatsApp QR" });
      }
    },
  );

  app.delete("/api/branches/:id", requireSuperAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteBranch(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Branch not found" });
      }
      res.json({ message: "Branch deleted successfully" });
    } catch (error) {
      logger.error("Error deleting branch:", error as any);
      res.status(500).json({ message: "Failed to delete branch" });
    }
  });

  // Branch QR Code Management Routes
  app.get("/api/branches/:id/qr-codes", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      // Authorization: users can only access their own branch QR codes unless super admin
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch QR codes" });
      }

      const qrCodes = await storage.getBranchQRCodes(id);
      res.json(qrCodes);
    } catch (error) {
      logger.error("Error fetching branch QR codes:", error as any);
      res
        .status(500)
        .json({ message: (error instanceof Error ? error.message : "Failed to fetch QR codes") });
    }
  });

  app.get("/api/branches/:id/qr-codes/active", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch QR codes" });
      }

      const activeQrCode = await storage.getActiveBranchQRCode(id);
      if (!activeQrCode) {
        return res.status(404).json({ message: "No active QR code found" });
      }
      res.json(activeQrCode);
    } catch (error) {
      logger.error("Error fetching active QR code:", error as any);
      res
        .status(500)
        .json({ message: (error instanceof Error ? error.message : "Failed to fetch active QR code") });
    }
  });

  app.post("/api/branches/:id/qr-codes", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot create QR codes for other branches" });
      }

      // Generate a unique QR code
      const qrCode = randomUUID().replace(/-/g, '');
      
      const newQrCode = await storage.createBranchQRCode({
        branchId: id,
        qrCode: qrCode,
        isActive: true,
        createdBy: user.id
      });

      res.status(201).json(newQrCode);
    } catch (error) {
      logger.error("Error creating QR code:", error as any);
      res
        .status(500)
        .json({ message: (error instanceof Error ? error.message : "Failed to create QR code") });
    }
  });

  app.put("/api/branches/:id/qr-codes/:qrId/deactivate", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id, qrId } = req.params;
      const user = req.user as User;
      
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branch QR codes" });
      }

      const deactivatedQrCode = await storage.deactivateBranchQRCode(qrId, user.id);
      if (!deactivatedQrCode) {
        return res.status(404).json({ message: "QR code not found" });
      }

      res.json(deactivatedQrCode);
    } catch (error) {
      logger.error("Error deactivating QR code:", error as any);
      res
        .status(500)
        .json({ message: (error instanceof Error ? error.message : "Failed to deactivate QR code") });
    }
  });

  app.post("/api/branches/:id/qr-codes/regenerate", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot regenerate QR codes for other branches" });
      }

      const newQrCode = await storage.regenerateBranchQRCode(id, user.id);
      res.json(newQrCode);
    } catch (error) {
      logger.error("Error regenerating QR code:", error as any);
      res
        .status(500)
        .json({ message: (error instanceof Error ? error.message : "Failed to regenerate QR code") });
    }
  });

  // Public QR code lookup route for customer access
  app.get("/api/qr/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const qrCodeRecord = await storage.getBranchQRCodeByCode(code);
      
      if (!qrCodeRecord || !qrCodeRecord.isActive) {
        return res.status(404).json({ message: "QR code not found or inactive" });
      }

      const branch = await storage.getBranch(qrCodeRecord.branchId);
      if (!branch) {
        return res.status(404).json({ message: "Associated branch not found" });
      }

      res.json({
        qrCode: qrCodeRecord,
        branch: {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          address: branch.address,
          phone: branch.phone
        }
      });
    } catch (error) {
      logger.error("Error looking up QR code:", error as any);
      res
        .status(500)
        .json({ message: (error instanceof Error ? error.message : "Failed to lookup QR code") });
    }
  });

  app.put(
    "/api/admin/branches/:id/service-cities",
    requireAdminOrSuperAdmin,
    async (req, res) => {
      try {
        const { id } = req.params;
        const user = req.user as User;
        if (user.role !== "super_admin" && user.branchId !== id) {
          return res.status(403).json({ message: "Cannot modify other branches" });
        }
        const { cityIds } = z.object({ cityIds: z.array(z.string()) }).parse(req.body);
        const updated = await storage.setBranchServiceCities(id, cityIds);
        res.json({ cityIds: updated });
      } catch (error) {
        res.status(400).json({ message: "Failed to update service cities" });
      }
    },
  );

  // Security settings (Admin or Super Admin)
  app.get("/api/security-settings", requireAdminOrSuperAdmin, async (_req, res) => {
    try {
      const settings = await storage.getSecuritySettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch security settings" });
    }
  });

  app.put("/api/security-settings", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const validated = insertSecuritySettingsSchema.parse(req.body);
      const updated = await storage.updateSecuritySettings(validated);
      res.json(updated);
    } catch (error) {
      logger.error("Error updating security settings:", error as any);
      res.status(400).json({ message: "Invalid security settings data" });
    }
  });

  // Products route
  app.get(
    "/api/products",
    async (req, res, next) => {
      res.set("Cache-Control", "no-store");
      app.set("etag", false);
      const branchCode = req.query.branchCode as string | undefined;
      if (!branchCode) return next();
      try {
        const branch = await storage.getBranchByCode(branchCode);
        if (!branch) {
          return res.status(404).json({ message: "Branch not found" });
        }
        const categoryId = req.query.categoryId as string;
        const search = req.query.search as string | undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;
        const itemType = req.query.itemType as ItemType | undefined;
        const result = categoryId
          ? await storage.getProductsByCategory(
              categoryId,
              branch.id,
              search,
              limit,
              offset,
              itemType,
            )
          : await storage.getProducts(
              branch.id,
              search,
              limit,
              offset,
              itemType,
            );
        console.debug("[products] branch resolved via branchCode", {
          branchCode,
          branchId: branch.id,
          productCount: result.items.length,
        });
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch products" });
      }
    },
    requireAuth,
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      app.set("etag", false);
      try {
        const categoryId = req.query.categoryId as string;
        const search = req.query.search as string | undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;
        const itemType = req.query.itemType as ItemType | undefined;
        const user = req.user as UserWithBranch;
        const branchId =
          user.branchId ??
          (user.role === "super_admin"
            ? (req.query.branchId as string | undefined)
            : undefined);
        if (!branchId)
          return res.status(400).json({ message: "branchId is required" });

        const result = categoryId
          ? await storage.getProductsByCategory(
              categoryId,
              branchId,
              search,
              limit,
              offset,
              itemType,
            )
          : await storage.getProducts(
              branchId,
              search,
              limit,
              offset,
              itemType,
            );

        console.debug("[products] branch resolved via authentication", {
          branchCode: req.query.branchCode,
          branchId,
          productCount: result.items.length,
        });
        res.status(200).json(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch products" });
      }
    },
  );

  app.get(
    "/api/product-categories",
    async (req, res, next) => {
      const branchCode = req.query.branchCode as string | undefined;
      if (!branchCode) return next();
      try {
        const branch = await storage.getBranchByCode(branchCode);
        if (!branch) {
          return res.status(404).json({ message: "Branch not found" });
        }
        const categories = await storage.getProductCategories(branch.id);
        res.json(categories);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch product categories" });
      }
    },
    requireAuth,
    async (req, res) => {
      try {
        const userId = (req.user as UserWithBranch).id;
        const categories = await storage.getCategoriesByType("product", userId);
        res.json(categories);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch product categories" });
      }
    },
  );

  app.post("/api/products", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId =
        user.branchId ?? (user.role === "super_admin" ? req.body.branchId : undefined);
      if (!branchId) {
        return res.status(400).json({ message: "branchId is required" });
      }
      const validatedData = insertProductSchema.parse(req.body);
      const newProduct = await storage.createProduct({ ...validatedData, branchId });
      res.json(newProduct);
    } catch (error) {
      logger.error("Error creating product:", error as any);
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.put("/api/products/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const id = await resolveUuidByPublicId(products, req.params.id);
      const user = req.user as UserWithBranch;
      const branchId =
        user.branchId ?? (user.role === "super_admin" ? req.body.branchId : undefined);
      if (!branchId) {
        return res.status(400).json({ message: "branchId is required" });
      }
      const validatedData = insertProductSchema.partial().parse(req.body);
      const updatedProduct = await storage.updateProduct(id, validatedData, branchId);
      if (!updatedProduct) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(updatedProduct);
    } catch (error) {
      logger.error("Error updating product:", error as any);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.get("/api/products/:id/services", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const categoryId = req.query.categoryId as string | undefined;
      const resolved = await resolveUuidByPublicId(products, req.params.id);
      const product = await storage.getProduct(resolved, user.branchId || undefined);
      if (!product?.clothingItemId) {
        return res.status(404).json({ message: "Product not found" });
      }
      const services = await storage.getServicesForClothingItem(
        product.clothingItemId,
        user.id,
        user.branchId!,
        categoryId,
      );
      res.json(services);
    } catch (error) {
      logger.error("Error fetching product services:", error as any);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });
  // Clothing Items routes - with public access via branchCode
  app.get(
    "/api/clothing-items",
    async (req, res, next) => {
      const branchCode = req.query.branchCode as string | undefined;
      logger.debug({ branchCode }, "[clothing-items] request");
      if (!branchCode) {
        logger.debug("[clothing-items] No branchCode, passing to next");
        return next();
      }
      logger.debug({ branchCode }, "[clothing-items] processing public request");
      try {
        const branch = await storage.getBranchByCode(branchCode);
        if (!branch) {
          return res.status(404).json({ message: "Branch not found" });
        }
        const categoryId = req.query.categoryId as string;
        const search = req.query.search as string | undefined;
        // Get clothing items only for this branch by joining item_service_prices
        const conditions: any[] = [eq(itemServicePrices.branchId, branch.id)];
        if (categoryId && categoryId !== "all") {
          conditions.push(eq(clothingItems.categoryId, categoryId));
        }
        if (search) {
          const pattern = `%${search}%`;
          conditions.push(
            or(
              ilike(clothingItems.name, pattern),
              ilike(clothingItems.description, pattern),
              ilike(clothingItems.nameAr, pattern as any),
              ilike(clothingItems.descriptionAr, pattern as any),
            ) as any,
          );
        }
        const where = conditions.length ? and(...conditions) : undefined;
        const rows = await db
          .select({ item: clothingItems })
          .from(clothingItems)
          .innerJoin(
            itemServicePrices,
            and(
              eq(itemServicePrices.clothingItemId, clothingItems.id),
              eq(itemServicePrices.branchId, branch.id),
            ),
          )
          .$dynamic()
          .where(where as any)
          .groupBy(clothingItems.id);
        const items = rows.map((r) => r.item);
        res.json(items);
      } catch (error) {
        logger.error("Error fetching clothing items (public):", error as any);
        res.status(500).json({ message: "Failed to fetch clothing items" });
      }
    },
    requireAuth,
    async (req, res) => {
        try {
          const categoryId = req.query.categoryId as string;
          const search = req.query.search as string | undefined;
          const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
          const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
          const user = req.user as UserWithBranch;

          // Resolve effective branch: non-super admins must use their branch; super_admin may provide ?branchId
          const effectiveBranchId =
            user.role === 'super_admin' ? ((req.query.branchId as string | undefined) ?? undefined) : (user.branchId || undefined);
          if (!effectiveBranchId) {
            return res.status(400).json({ message: 'branchId is required' });
          }

          const conditions: any[] = [eq(itemServicePrices.branchId, effectiveBranchId)];
          if (categoryId && categoryId !== 'all') {
            conditions.push(eq(clothingItems.categoryId, categoryId));
          }
          if (search) {
            const pattern = `%${search}%`;
            conditions.push(
              or(
                ilike(clothingItems.name, pattern),
                ilike(clothingItems.description, pattern),
                ilike(clothingItems.nameAr, pattern as any),
                ilike(clothingItems.descriptionAr, pattern as any),
              ) as any,
            );
          }
          const where = conditions.length ? and(...conditions) : undefined;

          // Count distinct items for pagination header
          const [{ count }] = await db
            .select({ count: sql<number>`count(distinct ${clothingItems.id})` })
            .from(clothingItems)
            .innerJoin(
              itemServicePrices,
              and(
                eq(itemServicePrices.clothingItemId, clothingItems.id),
                eq(itemServicePrices.branchId, effectiveBranchId),
              ),
            )
            .$dynamic()
            .where(where as any);

          // Fetch items with optional pagination
          let query = db
            .select({ item: clothingItems })
            .from(clothingItems)
            .innerJoin(
              itemServicePrices,
              and(
                eq(itemServicePrices.clothingItemId, clothingItems.id),
                eq(itemServicePrices.branchId, effectiveBranchId),
              ),
            )
            .$dynamic()
            .where(where as any)
            .groupBy(clothingItems.id);
          if (typeof limit === 'number') query = query.limit(limit);
          if (typeof offset === 'number') query = query.offset(offset);
          const rows = await query;
          const items = rows.map((r) => r.item);
          res.setHeader('X-Total-Count', String(Number(count)));
          res.json(items);
        } catch (error) {
          logger.error("Error fetching clothing items:", error as any);
          res.status(500).json({ message: "Failed to fetch clothing items" });
        }
    },
  );

  app.get("/api/clothing-items/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as UserWithBranch).id;
      const resolved = await resolveUuidByPublicId(clothingItems, req.params.id);
      const item = await storage.getClothingItem(resolved, userId);
      if (!item) {
        return res.status(404).json({ message: "Clothing item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clothing item" });
    }
  });

  app.post("/api/clothing-items", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const validatedData = insertClothingItemSchema.parse(req.body);
      const userId = (req.user as UserWithBranch).id;
      const category = await storage.getCategory(validatedData.categoryId, userId);
      if (!category) {
        return res.status(400).json({ message: "Invalid category" });
      }
      if (category.type !== 'clothing') {
        return res.status(400).json({ message: "Invalid category type" });
      }
      const newItem = await storage.createClothingItem({ ...validatedData, userId });
      res.json(newItem);
    } catch (error: any) {
      logger.error("Error creating clothing item:", error as any);
      if (error?.code === "23503") {
        return res.status(400).json({ message: "Invalid category" });
      }
      res.status(500).json({ message: "Failed to create clothing item" });
    }
  });

  app.put("/api/clothing-items/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const id = await resolveUuidByPublicId(clothingItems, req.params.id);
      const validatedData = insertClothingItemSchema.partial().parse(req.body);
      const userId = (req.user as UserWithBranch).id;
      const updatedItem = await storage.updateClothingItem(id, validatedData, userId);
      if (!updatedItem) {
        return res.status(404).json({ message: "Clothing item not found" });
      }
      res.json(updatedItem);
    } catch (error) {
      logger.error("Error updating clothing item:", error as any);
      res.status(500).json({ message: "Failed to update clothing item" });
    }
  });

  app.delete("/api/clothing-items/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const id = await resolveUuidByPublicId(clothingItems, req.params.id);
      const userId = (req.user as UserWithBranch).id;
      const deleted = await storage.deleteClothingItem(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Clothing item not found" });
      }
      res.json({ message: "Clothing item deleted successfully" });
    } catch (error) {
      logger.error("Error deleting clothing item:", error as any);
      res.status(500).json({ message: "Failed to delete clothing item" });
    }
  });

  // Clothing item services - with public access via branchCode
  app.get(
    "/api/clothing-items/:id/services",
    async (req, res, next) => {
      const branchCode = req.query.branchCode as string | undefined;
      if (!branchCode) return next();
      try {
        const branch = await storage.getBranchByCode(branchCode);
        if (!branch) {
          return res.status(404).json({ message: "Branch not found" });
        }
        const categoryId = req.query.categoryId as string | undefined;
        // Only return services that have a branch-specific price for this clothing item
        const conditions: any[] = [
          eq(itemServicePrices.clothingItemId, req.params.id as any),
          eq(itemServicePrices.branchId, branch.id),
          // Ensure we only return services tied to the same owner as the clothing item
          eq(laundryServices.userId, clothingItems.userId),
          // Only show services that have an explicit non-zero price for this branch/item
          gt(itemServicePrices.price, '0' as any),
        ];
        if (categoryId && categoryId !== "all") {
          conditions.push(eq(laundryServices.categoryId, categoryId));
        }
        const services = await db
          .select({
            id: laundryServices.id,
            name: laundryServices.name,
            nameAr: laundryServices.nameAr,
            description: laundryServices.description,
            descriptionAr: laundryServices.descriptionAr,
            categoryId: laundryServices.categoryId,
            price: laundryServices.price,
            userId: laundryServices.userId,
            branchId: laundryServices.branchId,
            itemPrice: itemServicePrices.price,
          })
          .from(itemServicePrices)
          .innerJoin(laundryServices, eq(itemServicePrices.serviceId, laundryServices.id))
          .innerJoin(clothingItems, eq(clothingItems.id, req.params.id as any))
          .where(and(...conditions));
        res.json(services);
      } catch (error) {
        logger.error("Error fetching item services (public):", error as any);
        res.status(500).json({ message: "Failed to fetch services" });
      }
    },
    requireAuth,
    async (req, res) => {
      try {
        const user = req.user as UserWithBranch;
        const categoryId = req.query.categoryId as string | undefined;
        const clothingId = await resolveUuidByPublicId(clothingItems, req.params.id);
        const effectiveBranchId =
          user.role === 'super_admin'
            ? ((req.query.branchId as string | undefined) ?? user.branchId ?? undefined)
            : (user.branchId || undefined);
        if (!effectiveBranchId) {
          return res.status(400).json({ message: 'branchId is required' });
        }
        const services = await storage.getServicesForClothingItem(
          clothingId,
          user.id,
          effectiveBranchId,
          categoryId,
        );
        res.json(services);
      } catch (error) {
        logger.error("Error fetching item services:", error as any);
        res.status(500).json({ message: "Failed to fetch services" });
      }
    }
  );

  // Laundry Services routes
  app.get("/api/laundry-services", requireAuth, async (req, res) => {
    try {
      const categoryId = req.query.categoryId as string;
      const search = req.query.search as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const userId = (req.user as UserWithBranch).id;

      let services = categoryId
        ? await storage.getLaundryServicesByCategory(categoryId, userId)
        : await storage.getLaundryServices(userId);

      if (search) {
        const term = search.toLowerCase();
        services = services.filter((service: any) =>
          service.name?.toLowerCase().includes(term) ||
          service.description?.toLowerCase?.().includes(term) ||
          service.nameAr?.toLowerCase?.().includes(term) ||
          service.descriptionAr?.toLowerCase?.().includes(term)
        );
      }

      const total = services.length;
      const sliced = typeof offset === 'number' && typeof limit === 'number' ? services.slice(offset, offset + limit) : services;
      res.setHeader('X-Total-Count', String(total));
      res.json(sliced);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch laundry services" });
    }
  });

  app.get("/api/laundry-services/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as UserWithBranch).id;
      const id = await resolveUuidByPublicId(laundryServices, req.params.id);
      const service = await storage.getLaundryService(id, userId);
      if (!service) {
        return res.status(404).json({ message: "Laundry service not found" });
      }
      res.json(service);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch laundry service" });
    }
  });

  app.post("/api/laundry-services", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const validatedData = insertLaundryServiceSchema.parse(req.body);
      const userId = (req.user as UserWithBranch).id;
      const category = await storage.getCategory(validatedData.categoryId, userId);
      if (!category || category.type !== "service") {
        return res.status(400).json({ message: "Invalid category" });
      }
      const newService = await storage.createLaundryService({ ...validatedData, userId });
      res.json(newService);
    } catch (error: any) {
      logger.error("Error creating laundry service:", error as any);
      if (error?.code === "23503") {
        return res.status(400).json({ message: "Invalid category" });
      }
      res.status(500).json({ message: "Failed to create laundry service" });
    }
  });

  app.put("/api/laundry-services/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const id = await resolveUuidByPublicId(laundryServices, req.params.id);
      const validatedData = insertLaundryServiceSchema.partial().parse(req.body);
      const userId = (req.user as UserWithBranch).id;
      const updatedService = await storage.updateLaundryService(id, validatedData, userId);
      if (!updatedService) {
        return res.status(404).json({ message: "Laundry service not found" });
      }
      res.json(updatedService);
    } catch (error) {
      logger.error("Error updating laundry service:", error as any);
      res.status(500).json({ message: "Failed to update laundry service" });
    }
  });

  app.delete("/api/laundry-services/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const id = await resolveUuidByPublicId(laundryServices, req.params.id);
      const userId = (req.user as UserWithBranch).id;
      const deleted = await storage.deleteLaundryService(id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Laundry service not found" });
      }
      res.json({ message: "Laundry service deleted successfully" });
    } catch (error) {
      logger.error("Error deleting laundry service:", error as any);
      res.status(500).json({ message: "Failed to delete laundry service" });
    }
  });

  // Item-service price management
  app.post("/api/item-service-prices", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const body = { ...req.body, branchId: req.body.branchId ?? user.branchId };
      const data = insertItemServicePriceSchema.parse(body);
      const record = await storage.createItemServicePrice(data);
      res.json(record);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: error.message,
          errors: error.errors,
        });
      }
      logger.error("Error upserting item service price:", error as any);
      res.status(500).json({ message: "Failed to upsert item service price" });
    }
  });

  app.put("/api/item-service-prices", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const body = { ...req.body, branchId: req.body.branchId ?? user.branchId };
      const data = insertItemServicePriceSchema.parse(body);
        const updated = await storage.updateItemServicePrice(
          data.clothingItemId,
          data.serviceId,
          data.branchId!,
          data.price.toString(),
        );
      if (!updated) {
        return res.status(404).json({ message: "Item service price not found" });
      }
      res.json(updated);
    } catch (error) {
      logger.error("Error updating item service price:", error as any);
      res.status(500).json({ message: "Failed to update item service price" });
    }
  });

  app.delete("/api/item-service-prices", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { clothingItemId, serviceId, branchId } = req.body as {
        clothingItemId: string;
        serviceId: string;
        branchId?: string;
      };
      const deleted = await storage.deleteItemServicePrice(
        clothingItemId,
        serviceId,
        branchId ?? user.branchId!,
      );
      res.json({ success: deleted });
    } catch (error) {
      logger.error("Error deleting item service price:", error as any);
      res.status(500).json({ message: "Failed to delete item service price" });
    }
  });

  app.get("/api/item-prices", requireAuth, async (req, res) => {
    try {
      const clothingItemId = req.query.clothingItemId as string;
      const serviceId = req.query.serviceId as string;
      if (!clothingItemId || !serviceId) {
        return res
          .status(400)
          .json({ message: "Missing clothingItemId or serviceId" });
      }
      const user = req.user as UserWithBranch;
      const price = await storage.getItemServicePrice(
        clothingItemId,
        serviceId,
        user.id,
        user.branchId!,
      );
      if (price == null) {
        return res.status(404).json({ message: "Price not found" });
      }
      res.json({ price });
    } catch (error) {
      logger.error("Error fetching item price:", error as any);
      res.status(500).json({ message: "Failed to fetch item price" });
    }
  });

  // Packages routes
  async function attachClothingItemNames(pkgs: any[]) {
    const ids = pkgs
      .flatMap((p) =>
        (p.packageItems || []).map((i: any) => i.clothingItemId).filter(Boolean),
      ) as string[];
    if (ids.length === 0) return pkgs;
    const clothing = await db
      .select({ id: clothingItems.id, name: clothingItems.name })
      .from(clothingItems)
      .where(inArray(clothingItems.id, ids));
    const map = new Map(clothing.map((c) => [c.id, c.name]));
    return pkgs.map((p) => ({
      ...p,
      packageItems: (p.packageItems || []).map((i: any) => ({
        ...i,
        clothingItem:
          i.clothingItemId && map.has(i.clothingItemId)
            ? { id: i.clothingItemId, name: map.get(i.clothingItemId) }
            : undefined,
      })),
    }));
  }

  app.get("/api/packages", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId =
        user.role === "super_admin"
          ? (req.query.branchId as string | undefined)
          : user.branchId;
      if (!branchId) {
        return res.status(400).json({ message: "branchId required" });
      }
      let pkgs = await storage.getPackages(branchId);
      pkgs = await attachClothingItemNames(pkgs);
      res.json(pkgs);
    } catch (error) {
      logger.error(error);
      res
        .status(500)
        .json({ message: "Failed to fetch packages", error: String(error) });
    }
  });

  app.get("/api/packages/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId =
        user.role === "super_admin"
          ? (req.query.branchId as string | undefined)
          : user.branchId;
      if (!branchId) {
        return res.status(400).json({ message: "branchId required" });
      }
      const id = await resolveUuidByPublicId(packages, req.params.id);
      const pkg = await storage.getPackage(id, branchId);
      if (!pkg) {
        return res.status(404).json({ message: "Package not found" });
      }
      const [withNames] = await attachClothingItemNames([pkg]);
      res.json(withNames);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch package" });
    }
  });

  app.post("/api/packages", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const data =
        user.role === "super_admin"
          ? req.body
          : { ...req.body, branchId: user.branchId };
      const { packageItems, ...pkgData } = insertPackageSchema.parse(data);
      let pkg = await storage.createPackage({
        ...pkgData,
        packageItems: packageItems?.map((i) => ({
          ...i,
          paidCredits: i.paidCredits ?? 0,
        })),
      });
      [pkg] = await attachClothingItemNames([pkg]);
      res.status(201).json(pkg);
    } catch (error) {
      res.status(400).json({ message: "Invalid package data" });
    }
  });

  app.put("/api/packages/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const data =
        user.role === "super_admin"
          ? req.body
          : { ...req.body, branchId: user.branchId };
      const { packageItems, ...pkgData } = insertPackageSchema
        .partial()
        .parse(data);
      if (!pkgData.branchId) {
        return res.status(400).json({ message: "branchId required" });
      }
      const id = await resolveUuidByPublicId(packages, req.params.id);
      let pkg = await storage.updatePackage(
        id,
        {
          ...pkgData,
          packageItems: packageItems?.map((i) => ({
            ...i,
            paidCredits: i.paidCredits ?? 0,
          })),
        },
        pkgData.branchId,
      );
      if (!pkg) {
        return res.status(404).json({ message: "Package not found" });
      }
      [pkg] = await attachClothingItemNames([pkg]);
      res.json(pkg);
    } catch (error) {
      res.status(400).json({ message: "Invalid package data" });
    }
  });

  app.delete("/api/packages/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId =
        user.role === "super_admin"
          ? (req.query.branchId as string | undefined)
          : user.branchId;
      if (!branchId) {
        return res.status(400).json({ message: "branchId required" });
      }
      const id = await resolveUuidByPublicId(packages, req.params.id);
      const deleted = await storage.deletePackage(id, branchId);
      if (!deleted) {
        return res.status(404).json({ message: "Package not found" });
      }
      res.json({ message: "Package deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete package" });
    }
  });

  app.post("/api/packages/:id/assign", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId =
        user.role === "super_admin"
          ? (req.query.branchId as string | undefined)
          : user.branchId;
      if (!branchId) {
        return res.status(400).json({ message: "branchId required" });
      }
      const { customerId, startsAt, expiresAt, paymentMethod } = z
        .object({
          customerId: z.string(),
          startsAt: z.string().datetime().optional(),
          expiresAt: z.string().datetime().optional(),
          paymentMethod: z.string().default("cash"), // Matches insertPaymentSchema paymentMethod
        })
        .parse(req.body);
      const pkgId = await resolveUuidByPublicId(packages, req.params.id);
      const pkg = await storage.getPackage(pkgId, branchId);
      if (!pkg) {
        return res.status(404).json({ message: "Package not found" });
      }
      const balance = (pkg.packageItems || []).reduce(
        (sum, item) => sum + (item.credits ?? 0),
        0,
      );
      const startDate = startsAt ? new Date(startsAt) : new Date();
      const expiryDate = expiresAt
        ? new Date(expiresAt)
        : pkg.expiryDays
        ? new Date(startDate.getTime() + pkg.expiryDays * 24 * 60 * 60 * 1000)
        : null;
      
      // Convert price to number for validation, then to string for storage
      const packagePrice = Number(pkg.price);
      
      // Check for existing package assignment to prevent duplicates
      const existingAssignments = await storage.getCustomerPackagesWithUsage(customerId);
      const duplicateAssignment = existingAssignments.find(
        (cp: any) => cp.packageId === pkgId && 
        Math.abs(new Date(cp.startsAt).getTime() - startDate.getTime()) < 60000 // Within 1 minute
      );
      
      if (duplicateAssignment) {
        return res.status(409).json({ 
          message: "Package already assigned recently", 
          existingAssignment: duplicateAssignment 
        });
      }
      
      // Perform atomic operations: both assignment and payment must succeed
      let record: any;
      try {
        // First assign the package
        record = await storage.assignPackageToCustomer(
          pkgId,
          customerId,
          balance,
          startDate,
          expiryDate,
        );

        // Only create payment record if price > 0
        if (packagePrice > 0) {
          // Validate payment data using proper schema
          const paymentData = insertPaymentSchema.parse({
            customerId,
            amount: packagePrice.toFixed(2), // Convert to string with 2 decimal places
            paymentMethod,
            notes: `Package purchase: ${pkg.nameEn || 'Package'} (Package ID: ${pkg.id})`,
            receivedBy: user.username || "System",
          });
          
          await storage.createPayment(paymentData);
        }
      } catch (error) {
        logger.error("Error in package assignment/payment:", error as any);
        
        // If payment fails but assignment succeeded, try to roll back assignment
        if (record) {
          try {
            // Note: In a real implementation with database transactions, 
            // this would be automatically rolled back
            logger.warn("Package assignment succeeded but payment failed - manual cleanup may be required");
          } catch (rollbackError) {
            logger.error("Failed to rollback package assignment:", rollbackError as any);
          }
        }
        
        return res.status(500).json({ 
          message: "Failed to assign package or record payment",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }

      res.status(200).json({
        ...record,
        paymentRecorded: packagePrice > 0,
        packagePrice: packagePrice.toFixed(2)
      });
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // Transactions routes
  app.post("/api/transactions", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      if (!user.branchId) {
        return res.status(400).json({ message: "User branch not set" });
      }

      const {
        customerId,
        customerName,
        customerPhone,
        loyaltyPointsEarned = 0,
        loyaltyPointsRedeemed = 0,
        promisedReadyOption,
        promisedReadyDate,
        ...transactionData
      } = req.body;
      const validatedData = insertTransactionSchema.parse(transactionData);

      let orderId = validatedData.orderId;
      if (!orderId) {
        const orderData = insertOrderSchema.parse({
          customerId,
          customerName: customerName || "Walk-in",
          customerPhone: customerPhone || "",
          items: validatedData.items,
          subtotal: validatedData.subtotal,
          tax: validatedData.tax,
          total: validatedData.total,
          paymentMethod: validatedData.paymentMethod,
          status: "handed_over",
          sellerName: validatedData.sellerName,
          promisedReadyOption,
          promisedReadyDate,
        });
        const order = await storage.createOrder({ ...orderData, branchId: user.branchId });
        orderId = order.id;
      }

      const transaction = await storage.createTransaction({
        ...validatedData,
        branchId: user.branchId,
        orderId,
      });

      if (customerId) {
        const customer = await storage.getCustomer(customerId, user.branchId);
        if (customer) {
          const newPoints = customer.loyaltyPoints + (loyaltyPointsEarned - loyaltyPointsRedeemed);
          await storage.updateCustomer(customerId, { loyaltyPoints: newPoints });
          if (loyaltyPointsEarned > 0) {
            await storage.createLoyaltyHistory({
              customerId,
              change: loyaltyPointsEarned,
              description: `Earned from transaction ${transaction.id}`,
            });
          }
          if (loyaltyPointsRedeemed > 0) {
            await storage.createLoyaltyHistory({
              customerId,
              change: -loyaltyPointsRedeemed,
              description: `Redeemed in transaction ${transaction.id}`,
            });
          }
        }
      }
      let packages = [] as any[];
      if (customerId) {
        try {
          packages = await storage.getCustomerPackagesWithUsage(customerId);
          // Note: Do not trust client-provided packageUsage for financial data
          // packageUsage should be computed server-side during order creation
          logger.info({ customerId }, "Loaded customer packages for transaction display");
        } catch (error) {
          logger.error({ err: error, customerId }, "Failed to fetch customer packages");
        }
      }

      res.json({ ...transaction, packages });
    } catch (error) {
      logger.error("Transaction creation error:", error as any);
      res.status(400).json({ message: "Failed to create transaction" });
    }
  });

  app.get("/api/transactions", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { start, end, limit, offset } = req.query as Record<string, string | undefined>;
      const transactions = await storage.getTransactions(
        user.branchId || undefined,
        start ? new Date(start) : undefined,
        end ? new Date(end) : undefined,
        limit ? parseInt(limit) : undefined,
        offset ? parseInt(offset) : undefined
      );
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  app.get("/api/transactions/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const transaction = await storage.getTransaction(req.params.id, user.branchId || undefined);
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      let packages = [] as any[];
      if (transaction.orderId) {
        const order = await storage.getOrder(transaction.orderId, user.branchId || undefined);
        if (order?.customerId) {
          try {
            packages = await storage.getCustomerPackagesWithUsage(order.customerId);
            // Use stored packageUsages from order for accurate per-transaction credit display
            if (order.packageUsages) {
              packages = applyPackageUsageModification(packages, Array.isArray(order.packageUsages) ? order.packageUsages : []);
            }
          } catch (error) {
            logger.error(
              { err: error as any, orderId: order.id, customerId: order.customerId },
              "Failed to fetch customer packages",
            );
          }
        }
      }
      res.json({ ...transaction, packages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  });

  // Customer Management Routes
  app.get("/api/customers", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const q = (req.query.q as string | undefined)?.trim();
      const includeInactive = req.query.includeInactive === "true";
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      if (q) {
        const byPhone = await storage.getCustomerByPhone(q, branchId);
        if (
          byPhone &&
          (!branchId || byPhone.branchId === branchId) &&
          (includeInactive || byPhone.isActive)
        ) {
          const data = page > 1 ? [] : [byPhone];
          return res.json({ data, total: 1 });
        }
        const byNickname = await storage.getCustomerByNickname(q, branchId);
        if (
          byNickname &&
          (!branchId || byNickname.branchId === branchId) &&
          (includeInactive || byNickname.isActive)
        ) {
          const data = page > 1 ? [] : [byNickname];
          return res.json({ data, total: 1 });
        }
      }
      const { items, total } = await storage.getCustomers(
        q,
        includeInactive,
        branchId,
        pageSize,
        (page - 1) * pageSize,
      );
      res.json({ data: items, total });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const id = await resolveUuidByPublicId(customers, req.params.id);
      const customer = await storage.getCustomer(id, branchId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.get("/api/customers/:customerId/packages", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId =
        user.role === "super_admin" ? undefined : user.branchId || undefined;
      const customer = await storage.getCustomer(req.params.customerId, branchId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const packages = await storage.getCustomerPackagesWithUsage(
        req.params.customerId,
      );
      res.json(packages);
    } catch (error) {
      logger.error(
        { err: error, customerId: req.params.customerId },
        "Failed to fetch customer packages",
      );
      res.status(500).json({ message: "Failed to fetch customer packages" });
    }
  });

  app.get("/api/customers/phone/:phoneNumber", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const customer = await storage.getCustomerByPhone(req.params.phoneNumber, branchId);
      if (!customer || (branchId && customer.branchId !== branchId)) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.get("/api/customers/nickname/:nickname", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const customer = await storage.getCustomerByNickname(req.params.nickname, branchId);
      if (!customer || (branchId && customer.branchId !== branchId)) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  app.post("/api/customers", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      // Super admin may specify branchId in body; admins use their own branch
      const targetBranchId = user.branchId ?? (req.body?.branchId as string | undefined);
      if (!targetBranchId) {
        return res.status(400).json({ message: "User branch not set" });
      }
      // Ignore client-only fields like 'city'
      const { phoneNumber, name, nickname, email, address } = req.body as any;
      const customerData = insertCustomerSchema.parse({ phoneNumber, name, nickname, email, address });
      // Pre-check uniqueness to return clear errors instead of generic 500s
      const existingByPhone = await storage.getCustomerByPhone(customerData.phoneNumber, targetBranchId);
      if (existingByPhone) {
        return res.status(409).json({ message: "Customer already exists (phone)" });
      }
      if (customerData.nickname) {
        const existingByNick = await storage.getCustomerByNickname(customerData.nickname, targetBranchId);
        if (existingByNick) {
          return res.status(409).json({ message: "Customer nickname already in use" });
        }
      }
      const customer = await storage.createCustomer(customerData, targetBranchId);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid customer data", errors: error.errors });
      }
      logger.error({ err: error }, "Error creating customer");
      res.status(500).json({ message: "Failed to create customer", error: (error as any)?.message || String(error) });
    }
  });

  app.patch("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const data = insertCustomerSchema.partial().parse(req.body);
      const id = await resolveUuidByPublicId(customers, req.params.id);
      const existing = await storage.getCustomer(id, branchId);
      if (!existing) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const customer = await storage.updateCustomer(id, data, branchId);
      if (req.audit) {
        await req.audit.log({
          type: "customer.updated",
          entityType: "customer",
          entityId: id,
          metadata: {
            updatedFields: Object.keys(data),
          },
        });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to update customer" });
    }
  });

  app.put("/api/customers/:id/password", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const { password, notify } = z
        .object({ password: z.string().min(8), notify: z.boolean().optional() })
        .parse(req.body);

      const id = await resolveUuidByPublicId(customers, req.params.id);
      const existing = await storage.getCustomer(id, branchId);
      if (!existing) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const updated = await storage.updateCustomerPassword(id, passwordHash);

      if (notify && updated) {
        if (updated.phoneNumber) {
          await notificationService.sendSMS(
            updated.phoneNumber,
            `Your password has been reset. New password: ${password}`,
          );
        }
        if (updated.email) {
          await notificationService.sendEmail(
            updated.email,
            "Password Reset",
            `Your password has been reset. Your new password is: ${password}`,
          );
        }
      }

      if (req.audit) {
        await req.audit.log({
          type: "customer.password_reset",
          entityType: "customer",
          entityId: id,
          severity: "warning",
          metadata: {
            notifyChannels: {
              sms: Boolean(notify && updated?.phoneNumber),
              email: Boolean(notify && updated?.email),
            },
          },
        });
      }

      res.json({ message: "Password updated" });
    } catch (error) {
      logger.error("Error updating customer password:", error as any);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  app.delete("/api/customers/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const id = await resolveUuidByPublicId(customers, req.params.id);
      const existing = await storage.getCustomer(id, branchId);
      if (!existing) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const deleted = await storage.deleteCustomer(id, branchId);
      if (!deleted) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json({ message: "Customer deactivated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to deactivate customer" });
    }
  });

  // Order Management Routes
  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const { status, sortBy, sortOrder, branchId, includeDelivery } = req.query as Record<string, string>;
      const user = req.user as UserWithBranch;
      const sortField = sortBy === "balanceDue" ? "balanceDue" : "createdAt";
      const orderDirection = sortOrder === "asc" ? "asc" : "desc";
      
      // Only super_admin may override branch via query; others are scoped to their own branch
      const targetBranchId = user.role === 'super_admin' ? (branchId || undefined) : (user.branchId || undefined);
      
      let orders;
      if (status && typeof status === 'string') {
        orders = await storage.getOrdersByStatus(
          status,
          targetBranchId,
          sortField,
          orderDirection,
        );
      } else {
        orders = await storage.getOrders(
          targetBranchId,
          sortField,
          orderDirection,
        );
      }
      
      // Include delivery enrichment if requested
      if (includeDelivery === "true") {
        orders = await Promise.all(orders.map(async (order) => {
          try {
            // Derive delivery order by scanning available deliveries for this branch
            const deliveryList = await storage.getDeliveryOrders(user.branchId || undefined);
            const deliveryOrder = deliveryList.find((d) => d.order.id === order.id);
            if (deliveryOrder) {
              // Enrich with pickup and delivery address information
              let pickupAddress, deliveryAddress;
              if (deliveryOrder.order.customerId) {
                const addresses = await storage.getCustomerAddresses(deliveryOrder.order.customerId);
                if ((deliveryOrder as any).pickupAddressId) {
                  pickupAddress = addresses.find((a) => a.id === (deliveryOrder as any).pickupAddressId);
                }
                if ((deliveryOrder as any).deliveryAddressId) {
                  deliveryAddress = addresses.find((a) => a.id === (deliveryOrder as any).deliveryAddressId);
                }
              }
              
              return {
                ...order,
                deliveryOrder: {
                  deliveryMode: deliveryOrder.deliveryMode,
                  deliveryStatus: deliveryOrder.deliveryStatus,
                  deliveryFee: (deliveryOrder as any).deliveryFee,
                  pickupAddress: pickupAddress ? {
                    label: pickupAddress.label || "Pickup Address",
                    address: pickupAddress.address
                  } : undefined,
                  deliveryAddress: deliveryAddress ? {
                    label: deliveryAddress.label || "Delivery Address", 
                    address: deliveryAddress.address
                  } : undefined
                }
              };
            }
            return order;
          } catch (error) {
            logger.error({ err: error }, "Failed to enrich order with delivery data");
            return order;
          }
        }));
      }
      // Attach customer packages with usage information for each order
      orders = await Promise.all(
        orders.map(async (order) => {
          let packages: any[] = [];
          if (order.customerId) {
            try {
              packages = await storage.getCustomerPackagesWithUsage(order.customerId);
              // Use stored packageUsages for accurate per-order credit display
              if (order.packageUsages) {
                packages = applyPackageUsageModification(
                  packages,
                  Array.isArray(order.packageUsages) ? order.packageUsages : [],
                );
              }
            } catch (error) {
              logger.error(
                { err: error, orderId: order.id, customerId: order.customerId },
                "Failed to fetch customer packages",
              );
            }
          }
          return { ...order, packages };
        }),
      );

      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const id = await resolveUuidByPublicId(orders, req.params.id);
      const order = await storage.getOrder(id, user.branchId || undefined);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      let packages = [] as any[];
      if (order.customerId) {
        try {
          packages = await storage.getCustomerPackagesWithUsage(order.customerId);
          // Use stored packageUsages for accurate per-transaction credit display  
          if (order.packageUsages) {
            packages = applyPackageUsageModification(packages, Array.isArray(order.packageUsages) ? order.packageUsages : []);
          }
        } catch (error) {
          logger.error(
            { err: error, orderId: order.id, customerId: order.customerId },
            "Failed to fetch customer packages",
          );
        }
      }
      res.json({ ...order, packages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  app.get("/api/customers/:customerId/orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { includeDelivery } = req.query as Record<string, string>;
      let orders = await storage.getOrdersByCustomer(
        req.params.customerId,
        user.branchId || undefined,
      );

      if (req.query.unpaid === "true") {
        orders = orders.filter((o) => Number(o.remaining) > 0);
      }

      // Include delivery enrichment if requested
      if (includeDelivery === "true") {
        orders = await Promise.all(orders.map(async (order) => {
          try {
            const deliveryList = await storage.getDeliveryOrders(user.branchId || undefined);
            const deliveryOrder = deliveryList.find((d) => d.order.id === order.id);
            if (deliveryOrder) {
              // Enrich with pickup and delivery address information
              let pickupAddress, deliveryAddress;
              if (order.customerId) {
                const addresses = await storage.getCustomerAddresses(order.customerId);
                if ((deliveryOrder as any).pickupAddressId) {
                  pickupAddress = addresses.find((a) => a.id === (deliveryOrder as any).pickupAddressId);
                }
                if ((deliveryOrder as any).deliveryAddressId) {
                  deliveryAddress = addresses.find((a) => a.id === (deliveryOrder as any).deliveryAddressId);
                }
              }
              
              return {
                ...order,
                deliveryOrder: {
                  deliveryMode: deliveryOrder.deliveryMode,
                  deliveryStatus: deliveryOrder.deliveryStatus,
                  deliveryFee: (deliveryOrder as any).deliveryFee,
                  pickupAddress: pickupAddress ? {
                    label: pickupAddress.label || "Pickup Address",
                    address: pickupAddress.address
                  } : undefined,
                  deliveryAddress: deliveryAddress ? {
                    label: deliveryAddress.label || "Delivery Address", 
                    address: deliveryAddress.address
                  } : undefined
                }
              };
            }
            return order;
          } catch (error) {
            logger.error({ err: error }, "Failed to enrich customer order with delivery data");
            return order;
          }
        }));
      }

      const mapped = orders.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        subtotal: o.subtotal,
        paid: o.paid,
        remaining: o.remaining,
        // Include delivery status in summary if available
        deliveryOrder: o.deliveryOrder ? {
          deliveryStatus: o.deliveryOrder.deliveryStatus,
          deliveryMode: o.deliveryOrder.deliveryMode,
          deliveryFee: o.deliveryOrder.deliveryFee
        } : undefined
      }));

      const page = parseInt(req.query.page as string);
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      if (page) {
        const start = (page - 1) * pageSize;
        const data = mapped.slice(start, start + pageSize);
        res.json({ data, total: mapped.length });
      } else {
        res.json(mapped);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer orders" });
    }
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const {
        loyaltyPointsEarned = 0,
        loyaltyPointsRedeemed = 0,
        cartItems,
        customerId,
        branchCode,
        ...data
      } = req.body;

      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        return res.status(400).json({ message: "cartItems required" });
      }
      if (!branchCode) {
        return res.status(400).json({ message: "branchCode required" });
      }

      const branch = await storage.getBranchByCode(branchCode);
      if (!branch) {
        return res.status(404).json({ message: "Branch not found" });
      }
      // Enforce branch ownership except for super admins; if super_admin has no session branch, allow using branchCode
      if (user.role !== 'super_admin' && user.branchId !== branch.id) {
        return res.status(403).json({ message: "Branch mismatch" });
      }
      const effectiveBranchId = user.branchId ?? branch.id;

      // If no customer was selected, use/create a branch-scoped Walk-in Customer
      let effectiveCustomerId: string | undefined = customerId;
      if (!effectiveCustomerId) {
        try {
          const WALKIN_PHONE = "0000000000";
          const WALKIN_NAME = "Walk-in Customer";
          const existing = await storage.getCustomerByPhone(WALKIN_PHONE);
          if (existing && existing.branchId === branch.id) {
            effectiveCustomerId = existing.id;
          } else {
            const walkIn = await storage.createCustomer(
              { name: WALKIN_NAME, phoneNumber: WALKIN_PHONE, isActive: true } as any,
              branch.id,
            );
            effectiveCustomerId = walkIn.id;
          }
        } catch (e) {
          // If walk-in resolution fails for any reason, continue without customerId
          // Downstream logic already guards package/loyalty flows by checking customerId.
          effectiveCustomerId = undefined;
        }
      }

      // Compute packageUsages server-side for security (don't trust client)
      const packageComputeResult = effectiveCustomerId
        ? await computePackageUsage(effectiveCustomerId, cartItems, storage)
        : null;
      let pkgUsages: any = null;

      if (packageComputeResult) {
        try {
          pkgUsages = packageUsagesSchema.parse(packageComputeResult.packageUsages);

          // Update customer package balances with used credits
          for (const credit of packageComputeResult.usedCredits) {
            await storage.updateCustomerPackageBalance(
              credit.customerPackageId,
              -credit.quantity, // Negative to deduct credits
              credit.serviceId,
              credit.clothingItemId
            );
          }
          logger.info({ customerId, pkgUsages }, "Applied server-computed package usages");
        } catch (schemaError) {
          logger.error({ schemaError, packageUsages: packageComputeResult.packageUsages }, "Invalid computed packageUsages schema");
          pkgUsages = null;
        }
      }

      const totals = await computeTotalsWithCredits(
        cartItems,
        packageComputeResult?.usedCredits || [],
        storage,
        user.id,
        effectiveBranchId,
      );
      data.subtotal = totals.subtotal.toFixed(2);
      data.tax = totals.tax.toFixed(2);
      data.total = totals.total.toFixed(2);

      const {
        customerName,
        customerPhone,
        subtotal,
        tax,
        total,
        paymentMethod,
        status,
        // intentionally ignore estimatedPickup/actualPickup/readyBy to reduce validation friction
        promisedReadyDate,
        promisedReadyOption,
        notes,
        sellerName,
        isDeliveryRequest,
      } = data as any;

      const safeData: any = {
        customerName: customerName || "Walk-in",
        // Use a sentinel phone number for walk-in orders
        customerPhone: (customerPhone ?? "0000000000"),
        subtotal,
        tax,
        total,
        paymentMethod: paymentMethod || 'cash',
        status: status || 'start_processing',
        promisedReadyDate,
        promisedReadyOption,
        notes,
        sellerName: sellerName || (user as any)?.username || "POS User",
        isDeliveryRequest: isDeliveryRequest ?? false,
      };

      const orderData = insertOrderSchema.parse({ ...safeData, items: cartItems, customerId: effectiveCustomerId });

      const order = await storage.createOrder({ ...orderData, branchId: effectiveBranchId, packageUsages: pkgUsages });

      // Record immediate payment for non-pay-later orders so cash/card receipts are reflected in reports
      if (order.paymentMethod !== 'pay_later' && order.customerId) {
        try {
          const paymentData = insertPaymentSchema.parse({
            customerId: order.customerId,
            orderId: order.id,
            branchId: effectiveBranchId,
            amount: order.total,
            paymentMethod: order.paymentMethod,
            channel: 'pos',
            notes: `Order payment: ${order.orderNumber || order.id}`,
            receivedBy: (user as any)?.username || 'POS User',
          });
          await storage.createPayment(paymentData);
        } catch (err) {
          logger.error({ err, orderId: order.id }, 'Failed to record immediate payment for order');
        }
      }

      // If payment method is pay_later, update customer balance
      if (order.paymentMethod === 'pay_later' && order.customerId) {
        try {
          const customer = await storage.getCustomer(order.customerId, effectiveBranchId);
          if (customer) {
            const orderAmount = parseFloat(order.total);
            const updatedBalance = parseFloat(customer.balanceDue) + orderAmount;

            await storage.updateCustomer(order.customerId, {
              balanceDue: updatedBalance.toString()
            });
          }
        } catch (error) {
          logger.error("Error updating customer balance:", error as any);
          // Continue with order creation even if balance update fails
        }
      }

      if (order.customerId) {
        try {
          const customer = await storage.getCustomer(order.customerId, user.branchId ?? undefined);
          if (customer) {
            const newPoints = customer.loyaltyPoints + (loyaltyPointsEarned - loyaltyPointsRedeemed);
            await storage.updateCustomer(order.customerId, { loyaltyPoints: newPoints });
            if (loyaltyPointsEarned > 0) {
              await storage.createLoyaltyHistory({
                customerId: order.customerId,
                change: loyaltyPointsEarned,
                description: `Earned from order ${order.id}`,
              });
            }
            if (loyaltyPointsRedeemed > 0) {
              await storage.createLoyaltyHistory({
                customerId: order.customerId,
                change: -loyaltyPointsRedeemed,
                description: `Redeemed in order ${order.id}`,
              });
            }
          }
        } catch (error) {
          logger.error("Error updating loyalty points:", error as any);
          // Continue with order creation even if loyalty points fail
        }
      }

      if (order.customerId && Array.isArray(pkgUsages) && pkgUsages.length > 0) {
        try {
          let pkgs: any[] = [];
          try {
            pkgs = await storage.getCustomerPackagesWithUsage(order.customerId);
          } catch (error) {
            logger.error(
              { err: error, customerId: order.customerId },
              "Failed to fetch customer packages for usage validation",
            );
            // Continue without package usage but don't fail the order
            pkgs = [];
          }

          for (const usage of pkgUsages) {
            const pkg = pkgs.find(
              (p: any) => p.packageId === usage.packageId || p.id === usage.packageId,
            );
            if (!pkg) {
              logger.warn({ packageId: usage.packageId }, "Package not found for usage");
              continue;
            }

            let validPackageUsage = true;
            for (const item of usage.items || []) {
              const pkgItem = pkg.items?.find(
                (i: any) =>
                  i.serviceId === item.serviceId &&
                  i.clothingItemId === item.clothingItemId,
              );
              if (!pkgItem || pkgItem.balance < item.quantity) {
                logger.error("Insufficient package credits for item:", item as any);
                validPackageUsage = false;
                break;
              }
            }

            if (!validPackageUsage) {
              continue;
            }

            for (const item of usage.items || []) {
              await storage.updateCustomerPackageBalance(
                pkg.id,
                -item.quantity,
                item.serviceId,
                item.clothingItemId,
              );
            }
          }
        } catch (error) {
          logger.error("Error processing package usage:", error as any);
          // Continue with order creation even if package usage fails
        }
      }

      let packages = [] as any[];
      if (order.customerId) {
        try {
          packages = await storage.getCustomerPackagesWithUsage(order.customerId);
          packages = applyPackageUsageModification(packages, pkgUsages);
        } catch (error) {
          logger.error(
            { err: error, customerId: order.customerId },
            "Failed to fetch customer packages",
          );
        }
      }

      res.status(201).json({ ...order, packages });
    } catch (error) {
      logger.error({ err: error }, "Error creating order");
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      return res.status(500).json({ message: "Failed to create order", error: (error as any)?.message || String(error) });
    }
  });

  app.patch("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const id = await resolveUuidByPublicId(orders, req.params.id);
      const order = await storage.updateOrder(id, req.body);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  app.patch("/api/orders/:id/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { status, notify, reason } = req.body as { status: string; notify?: boolean; reason?: string };
      const id = await resolveUuidByPublicId(orders, req.params.id);
      const order = await storage.updateOrderStatus(id, status, {
        actor: getActorName(user),
      });
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // If cancelled and reason provided, append to order notes
      if (status === 'cancelled' && reason && reason.trim()) {
        try {
          await storage.updateOrder(id, { notes: `${order.notes ? order.notes + '\n' : ''}Cancelled: ${reason.trim()}` });
        } catch {}
      }

      if (notify) {
        const channels: ("sms" | "email")[] = [];
        if (order.customerPhone) {
          const sent = await notificationService.sendSMS(
            order.customerPhone,
            `Order ${order.orderNumber} status ${status}`,
          );
          if (sent) channels.push("sms");
        }
        if (order.customerId) {
          const customer = await storage.getCustomer(
            order.customerId,
            user.branchId || undefined,
          );
          if (customer?.email) {
            const sent = await notificationService.sendEmail(
              customer.email,
              "Order Status Updated",
              `Order ${order.orderNumber} status ${status}`,
            );
            if (sent) channels.push("email");
          }
        }
        await Promise.all(
          channels.map((type) =>
            storage.createNotification({ orderId: order.id, type }),
          ),
        );
      }

      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  app.post("/api/orders/:id/print", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const id = await resolveUuidByPublicId(orders, req.params.id);
      const record = await storage.recordOrderPrint(id, user.id);
      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ message: "Failed to record order print" });
    }
  });

  app.get("/api/orders/:id/prints", requireAuth, async (req, res) => {
    try {
      const id = await resolveUuidByPublicId(orders, req.params.id);
      const history = await storage.getOrderPrintHistory(id);
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order print history" });
    }
  });


  // Payment Management Routes
  app.get("/api/payments", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const payments = await storage.getPayments(user.branchId || undefined);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get("/api/customers/:customerId/payments", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const payments = await storage.getPaymentsByCustomer(
        req.params.customerId,
        user.branchId || undefined
      );
      const page = parseInt(req.query.page as string);
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      if (page) {
        const start = (page - 1) * pageSize;
        const data = payments.slice(start, start + pageSize);
        res.json({ data, total: payments.length });
      } else {
        res.json(payments);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer payments" });
    }
  });

  app.get(
    "/api/customers/:customerId/loyalty-history",
    requireAuth,
    async (req, res) => {
      try {
        const history = await storage.getLoyaltyHistory(req.params.customerId);
        const page = parseInt(req.query.page as string);
        const pageSize = parseInt(req.query.pageSize as string) || 10;
        if (page) {
          const start = (page - 1) * pageSize;
          const data = history.slice(start, start + pageSize);
          res.json({ data, total: history.length });
        } else {
          res.json(history);
        }
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch loyalty history" });
      }
    }
  );

  const handleCreatePayment = async (payment: InsertPayment, user: UserWithBranch, res: any) => {
    // Server-side cap: do not allow paying more than remaining for an order unless explicitly overridden
    if (payment.orderId) {
      try {
        const order = await storage.getOrder(payment.orderId, undefined);
        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }
        const paidTotal = await storage.getOrderPaymentsTotal(order.id);
        const orderTotal = parseFloat(order.total);
        const remaining = Math.max(orderTotal - paidTotal, 0);
        const amountNum = parseFloat(String(payment.amount));
        const wantsOverride = Boolean((payment as any).isOverpayOverride);
        if (amountNum > remaining + 1e-6) {
          if (!wantsOverride) {
            return res.status(400).json({
              message: "Amount exceeds remaining for order",
              code: "OVERPAY_NOT_ALLOWED",
              remaining: remaining.toFixed(2),
            });
          }
          const role = user?.role;
          if (!(role === 'admin' || role === 'super_admin')) {
            return res.status(403).json({ message: "Overpay override not permitted" });
          }
          if (!((payment as any).overrideReason && String((payment as any).overrideReason).trim().length)) {
            return res.status(400).json({ message: "Override reason required" });
          }
        }
      } catch (err) {
        // If validation fails unexpectedly, block the payment
        return res.status(400).json({ message: "Failed to validate payment" });
      }
    }
    let branchForBalance: string | undefined = undefined;
    if (payment.orderId) {
      // Use the order's branch for balance adjustment
      const order = await storage.getOrder(payment.orderId, undefined);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      branchForBalance = order.branchId;
    } else {
      // Use the customer's branch
      const customer = await storage.getCustomer(payment.customerId, undefined);
      branchForBalance = customer?.branchId || undefined;
    }

    const newPayment = await storage.createPayment(payment);

    // Update customer balance when payment is received
    await storage.updateCustomerBalance(
      payment.customerId,
      -parseFloat(newPayment.amount),
      branchForBalance,
    );

    // If this payment is for a pay-later order, check if fully settled
    if (payment.orderId) {
      try {
        const order = await storage.getOrder(payment.orderId, undefined);
        if (order) {
          const paidTotal = await storage.getOrderPaymentsTotal(order.id);
          const orderTotal = parseFloat(order.total);
          if (paidTotal + 1e-6 >= orderTotal) {
            // Append notes indicating settlement (do NOT change status automatically)
            const createdWhen = order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString();
            const settledWhen = new Date().toISOString();
            const extra = `\nPay-later order created at ${createdWhen}. Settled at ${settledWhen} via ${payment.paymentMethod}${(payment as any).channel ? ' (' + (payment as any).channel + ')' : ''}.`;
            await storage.updateOrder(order.id, {
              paymentMethod: payment.paymentMethod as any,
              notes: ((order.notes || '') + extra) as any,
            });
          }
        }
      } catch {}
    }

    res.status(201).json(newPayment);
  };

  app.post("/api/customers/:customerId/payments", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const data = insertPaymentSchema
        .omit({ customerId: true })
        .parse(req.body);
      await handleCreatePayment({ ...data, customerId: req.params.customerId }, user, res);
    } catch (error) {
      res.status(400).json({ message: "Invalid payment data" });
    }
  });

  app.post("/api/payments", requireAuth, async (req, res) => {
    console.warn(
      "POST /api/payments is deprecated. Use POST /api/customers/:customerId/payments instead."
    );
    try {
      const user = req.user as UserWithBranch;
      const paymentData = insertPaymentSchema.parse(req.body);
      await handleCreatePayment(paymentData, user, res);
    } catch (error) {
      res.status(400).json({ message: "Invalid payment data" });
    }
  });

  app.post("/api/receipts/email", requireAuth, async (req, res) => {
    try {
      const { email, html } = req.body as { email?: string; html?: string };
      if (!email || !html) {
        return res.status(400).json({ message: "Email and receipt content required" });
      }
      await notificationService.sendEmail(email, "Your Receipt", html);
      res.json({ message: "Receipt emailed successfully" });
    } catch (error) {
      logger.error("Error sending receipt email:", error as any);
      res.status(500).json({ message: "Failed to send receipt email" });
    }
  });

  app.get("/api/reports/summary", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const summary = await storage.getRevenueSummaryByDateRange(filter);
      res.json(summary);
    } catch (err) {
      logger.error({ err }, "Failed to fetch revenue summary");
      res.status(500).json({ message: "Failed to fetch revenue summary" });
    }
  });

  app.get("/api/reports/service-breakdown", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const services = await storage.getServiceBreakdown(filter);
      res.json({ services });
    } catch (err) {
      logger.error({ err }, "Failed to fetch service breakdown");
      res.status(500).json({ message: "Failed to fetch service breakdown" });
    }
  });

  app.get("/api/reports/clothing-breakdown", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const items = await storage.getClothingBreakdown(filter);
      res.json({ items });
    } catch (err) {
      logger.error({ err }, "Failed to fetch clothing breakdown");
      res.status(500).json({ message: "Failed to fetch clothing breakdown" });
    }
  });

  app.get("/api/reports/payment-methods", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const methods = await storage.getPaymentMethodBreakdown(filter);
      res.json({ methods });
    } catch (err) {
      logger.error({ err }, "Failed to fetch payment methods");
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.get("/api/reports/cashflow-summary", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const data = await storage.getCashflowSummaryByDateRange(filter);
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch cashflow summary");
      res.status(500).json({ message: "Failed to fetch cashflow summary" });
    }
  });

  // Exceptions summary (overpay overrides, stale pay-later, cancellation spike)
  app.get("/api/reports/exceptions", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { filter, error } = parseReportFilters(req, user);
      if (error) return res.status(400).json({ message: error });
      const branchId = filter.branchId;

      // Load branch customization for stale threshold
      let staleDays = 14;
      if (branchId) {
        try {
          const customization = await storage.getBranchCustomization(branchId);
          if (customization && typeof (customization as any).payLaterStaleDays === 'number') {
            staleDays = (customization as any).payLaterStaleDays as number;
          }
        } catch {}
      }

      // Overpay overrides in window
      const wherePayments: string[] = ["p.is_overpay_override = true"];
      if (branchId) wherePayments.push(`p.branch_id = '${branchId.replace(/'/g, "''")}'`);
      if (filter.start) wherePayments.push(`p.created_at >= '${filter.start.toISOString()}'`);
      if (filter.end) wherePayments.push(`p.created_at <= '${filter.end.toISOString()}'`);
      const clauseP = wherePayments.length ? `WHERE ${wherePayments.join(' AND ')}` : '';
      const { rows: overpayRows } = await db.execute<any>(sql.raw(`
        SELECT id, order_id, customer_id, amount, created_at FROM payments p ${clauseP} ORDER BY created_at DESC LIMIT 50
      `));

      // Stale pay-later orders: remaining > 0 and older than threshold
      const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
      const branchClause = branchId ? `AND o.branch_id = '${branchId.replace(/'/g, "''")}'` : '';
      const andDates = [filter.start ? `o.created_at >= '${filter.start.toISOString()}'` : '', filter.end ? `o.created_at <= '${filter.end.toISOString()}'` : ''].filter(Boolean).join(' AND ');
      const dateClause = andDates ? `AND ${andDates}` : '';
      const { rows: staleRows } = await db.execute<any>(sql.raw(`
        SELECT o.id, o.order_number, o.customer_name, o.created_at, o.total,
               COALESCE(paid.total_paid, 0) AS total_paid,
               (o.total - COALESCE(paid.total_paid, 0)) AS remaining
        FROM orders o
        LEFT JOIN (
          SELECT order_id, SUM(amount)::numeric AS total_paid FROM payments GROUP BY order_id
        ) paid ON paid.order_id = o.id
        WHERE o.is_delivery_request = false
          AND o.status <> 'cancelled'
          ${branchClause}
          ${dateClause}
          AND o.payment_method = 'pay_later'
          AND o.created_at < '${staleCutoff}'
          AND (o.total - COALESCE(paid.total_paid, 0)) > 0.009
        ORDER BY o.created_at ASC
        LIMIT 50
      `));

      // Cancellation spike: compare last 7 vs last 28
      const now = new Date();
      const d7 = new Date(now.getTime() - 7 * 86400000);
      const d28 = new Date(now.getTime() - 28 * 86400000);
      const branchFilter = branchId ? `AND is_delivery_request = false AND branch_id = '${branchId.replace(/'/g, "''")}'` : 'AND is_delivery_request = false';
      const { rows: recent } = await db.execute<any>(sql.raw(`
        SELECT 
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::int AS cancels,
          COUNT(*)::int AS total
        FROM orders WHERE created_at >= '${d7.toISOString()}' ${branchFilter}
      `));
      const { rows: base } = await db.execute<any>(sql.raw(`
        SELECT 
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)::int AS cancels,
          COUNT(*)::int AS total
        FROM orders WHERE created_at >= '${d28.toISOString()}' AND created_at < '${d7.toISOString()}' ${branchFilter}
      `));
      const recentRate = recent[0]?.total ? (Number(recent[0].cancels) / Number(recent[0].total)) : 0;
      const baselineRate = base[0]?.total ? (Number(base[0].cancels) / Number(base[0].total)) : 0;
      const isSpike = (recentRate > baselineRate * 2) && (recentRate > 0.10);

      res.json({
        overpayOverrides: { count: Number(overpayRows.length || 0), items: overpayRows },
        stalePayLater: { thresholdDays: staleDays, count: Number(staleRows.length || 0), items: staleRows },
        cancellationSpike: { recentRate, baselineRate, isSpike },
      });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch exceptions' });
    }
  });

  // Cash Drawer Sessions
  app.get("/api/cash-sessions/current", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const session = await storage.getOpenCashSessionByUser(user.branchId || null, user.id);
      res.json(session || null);
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch current cash session' });
    }
  });

  app.get("/api/cash-sessions", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const items = await storage.getCashSessions(user.branchId || undefined, Number(req.query.limit || 20));
      res.json(items);
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch cash sessions' });
    }
  });

  app.post("/api/cash-sessions/open", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      if (!user.branchId) return res.status(400).json({ message: 'User has no branch' });
      const exists = await storage.getOpenCashSessionByUser(user.branchId, user.id);
      if (exists) return res.status(400).json({ message: 'A session is already open' });
      const { openingFloat, notes, counts } = req.body as { openingFloat?: number; notes?: string; counts?: any };
      const created = await storage.createCashSession({
        branchId: user.branchId,
        cashierId: user.id,
        openingFloat: Number(openingFloat || 0) as any,
        notes: notes as any,
        counts: (counts || {}) as any,
      } as any);
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ message: 'Failed to open cash session' });
    }
  });

  app.post("/api/cash-sessions/:id/close", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const id = req.params.id;
      const session = await storage.getCashSession(id, user.branchId || undefined);
      if (!session) return res.status(404).json({ message: 'Session not found' });
      if (session.closedAt) return res.status(400).json({ message: 'Session already closed' });
      const { countedCash, notes, counts } = req.body as { countedCash: number; notes?: string; counts?: any };
      // Compute expected cash: opening float + sum of cash payments in branch during session window
      const startIso = new Date(session.openedAt).toISOString();
      const endIso = new Date().toISOString();
      const { rows } = await db.execute<any>(sql.raw(`
        SELECT COALESCE(SUM(amount)::numeric, 0) AS total
        FROM payments
        WHERE branch_id = '${(session.branchId as string).replace(/'/g, "''")}'
          AND payment_method = 'cash'
          AND created_at >= '${startIso}' AND created_at <= '${endIso}'
      `));
      const cashReceived = Number(rows[0]?.total ?? 0);
      // Subtract cash expenses in the session window
      const { rows: expRows } = await db.execute<any>(sql.raw(`
        SELECT COALESCE(SUM(amount)::numeric, 0) AS total
        FROM expenses
        WHERE branch_id = '${(session.branchId as string).replace(/'/g, "''")}'
          AND (payment_method = 'cash' OR payment_method IS NULL)
          AND incurred_at >= '${startIso}' AND incurred_at <= '${endIso}'
      `));
      const cashPaidOut = Number(expRows[0]?.total ?? 0);
      const expectedCash = Number(session.openingFloat) + cashReceived - cashPaidOut;
      const variance = Number(countedCash) - expectedCash;
      const updated = await storage.closeCashSession(id, { countedCash, expectedCash, variance, notes, counts });
      res.json({ ...updated, cashReceived, cashPaidOut });
    } catch (err) {
      res.status(400).json({ message: 'Failed to close cash session' });
    }
  });

  app.get("/api/cash-sessions/:id/z-report", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const id = req.params.id;
      const session = await storage.getCashSession(id, user.branchId || undefined);
      if (!session) return res.status(404).json({ message: 'Session not found' });
      const startIso = new Date(session.openedAt).toISOString();
      const endIso = new Date(session.closedAt || new Date()).toISOString();
      const { rows } = await db.execute<any>(sql.raw(`
        SELECT created_at, amount, payment_method, channel, notes, received_by, order_id, customer_id
        FROM payments
        WHERE branch_id = '${(session.branchId as string).replace(/'/g, "''")}'
          AND payment_method = 'cash'
          AND created_at >= '${startIso}' AND created_at <= '${endIso}'
        ORDER BY created_at ASC
      `));
      const header = [
        'created_at','amount','payment_method','channel','notes','received_by','order_id','customer_id'
      ];
      const escape = (v: any) => {
        const s = v == null ? '' : String(v);
        return (s.includes(',') || s.includes('\n') || s.includes('"')) ? ('"' + s.replace(/"/g, '""') + '"') : s;
      };
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push([
          (r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at),
          r.amount,
          r.payment_method,
          r.channel ?? '',
          r.notes ?? '',
          r.received_by,
          r.order_id ?? '',
          r.customer_id,
        ].map(escape).join(','));
      }
      const filename = `z-report-${(session.id as string).slice(0,8)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(lines.join('\n'));
    } catch (err) {
      res.status(500).json({ message: 'Failed to export Z-report' });
    }
  });

  // Z-report XLSX
  app.get("/api/cash-sessions/:id/z-report.xlsx", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const id = req.params.id;
      const session = await storage.getCashSession(id, user.branchId || undefined);
      if (!session) return res.status(404).json({ message: 'Session not found' });
      const startIso = new Date(session.openedAt).toISOString();
      const endIso = new Date(session.closedAt || new Date()).toISOString();
      const { rows } = await db.execute<any>(sql.raw(`
        SELECT created_at, amount, payment_method, channel, notes, received_by, order_id, customer_id
        FROM payments
        WHERE branch_id = '${(session.branchId as string).replace(/'/g, "''")}'
          AND payment_method = 'cash'
          AND created_at >= '${startIso}' AND created_at <= '${endIso}'
        ORDER BY created_at ASC
      `));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Z-Report');
      ws.columns = [
        { header: 'created_at', key: 'created_at', width: 24 },
        { header: 'amount', key: 'amount', width: 12 },
        { header: 'payment_method', key: 'payment_method', width: 16 },
        { header: 'channel', key: 'channel', width: 12 },
        { header: 'notes', key: 'notes', width: 40 },
        { header: 'received_by', key: 'received_by', width: 24 },
        { header: 'order_id', key: 'order_id', width: 38 },
        { header: 'customer_id', key: 'customer_id', width: 38 },
      ];
      rows.forEach((r) => ws.addRow({
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        amount: r.amount,
        payment_method: r.payment_method,
        channel: r.channel ?? '',
        notes: r.notes ?? '',
        received_by: r.received_by,
        order_id: r.order_id ?? '',
        customer_id: r.customer_id,
      }));
      const startStr = startIso.slice(0,10);
      const filename = `z-report-${(session.id as string).slice(0,8)}-${startStr}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ message: 'Failed to export Z-report' });
    }
  });

  // Daily close XLSX (all sessions in branch for a date)
  app.get("/api/cash-sessions/daily-close.xlsx", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const date = (req.query.date as string | undefined) || new Date().toISOString().slice(0,10);
      const dayStart = new Date(date + 'T00:00:00.000Z');
      const dayEnd = new Date(date + 'T23:59:59.999Z');
      const branchId = user.branchId || undefined;
      // Sessions for day
      const { rows: sessions } = await db.execute<any>(sql.raw(`
        SELECT * FROM cash_sessions
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}'
          AND opened_at >= '${dayStart.toISOString()}' AND opened_at <= '${dayEnd.toISOString()}'
        ORDER BY opened_at ASC
      `));
      const wb = new ExcelJS.Workbook();
      // Sessions sheet
      const ws = wb.addWorksheet('Sessions');
      ws.columns = [
        { header: 'id', key: 'id', width: 36 },
        { header: 'cashier_id', key: 'cashier_id', width: 36 },
        { header: 'opened_at', key: 'opened_at', width: 24 },
        { header: 'closed_at', key: 'closed_at', width: 24 },
        { header: 'opening_float', key: 'opening_float', width: 14 },
        { header: 'expected_cash', key: 'expected_cash', width: 14 },
        { header: 'counted_cash', key: 'counted_cash', width: 14 },
        { header: 'variance', key: 'variance', width: 14 },
      ];
      let sumOpen = 0, sumExpected = 0, sumCounted = 0, sumVar = 0;
      sessions.forEach((s) => {
        sumOpen += Number(s.opening_float || 0);
        sumExpected += Number(s.expected_cash || 0);
        sumCounted += Number(s.counted_cash || 0);
        sumVar += Number(s.variance || 0);
        ws.addRow({
          id: s.id,
          cashier_id: s.cashier_id,
          opened_at: s.opened_at,
          closed_at: s.closed_at ?? '',
          opening_float: s.opening_float,
          expected_cash: s.expected_cash ?? '',
          counted_cash: s.counted_cash ?? '',
          variance: s.variance ?? '',
        });
      });
      ws.addRow({});
      ws.addRow({ id: 'TOTALS', opening_float: sumOpen, expected_cash: sumExpected, counted_cash: sumCounted, variance: sumVar });

      // Receipts sheet (cash payments for day)
      const wp = wb.addWorksheet('Cash Receipts');
      wp.columns = [
        { header: 'created_at', key: 'created_at', width: 24 },
        { header: 'amount', key: 'amount', width: 12 },
        { header: 'order_id', key: 'order_id', width: 36 },
        { header: 'customer_id', key: 'customer_id', width: 36 },
        { header: 'received_by', key: 'received_by', width: 24 },
      ];
      const { rows: receipts } = await db.execute<any>(sql.raw(`
        SELECT created_at, amount, order_id, customer_id, received_by
        FROM payments
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}'
          AND payment_method = 'cash'
          AND created_at >= '${dayStart.toISOString()}' AND created_at <= '${dayEnd.toISOString()}'
        ORDER BY created_at ASC
      `));
      receipts.forEach((r) => wp.addRow({ created_at: r.created_at, amount: r.amount, order_id: r.order_id ?? '', customer_id: r.customer_id, received_by: r.received_by }));

      // Cash expenses sheet
      const we = wb.addWorksheet('Cash Expenses');
      we.columns = [
        { header: 'incurred_at', key: 'incurred_at', width: 24 },
        { header: 'category', key: 'category', width: 24 },
        { header: 'notes', key: 'notes', width: 40 },
        { header: 'amount', key: 'amount', width: 12 },
      ];
      const { rows: exp } = await db.execute<any>(sql.raw(`
        SELECT incurred_at, category, notes, amount
        FROM expenses
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}'
          AND (payment_method = 'cash' OR payment_method IS NULL)
          AND incurred_at >= '${dayStart.toISOString()}' AND incurred_at <= '${dayEnd.toISOString()}'
        ORDER BY incurred_at ASC
      `));
      exp.forEach((e) => we.addRow({ incurred_at: e.incurred_at, category: e.category, notes: e.notes ?? '', amount: e.amount }));

      const filename = `daily-close-${date}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ message: 'Failed to export daily close' });
    }
  });

  // Accounting journal (summary JSON) for a date
  app.get("/api/accounting/journal", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const date = (req.query.date as string | undefined) || new Date().toISOString().slice(0,10);
      const dayStart = new Date(date + 'T00:00:00.000Z');
      const dayEnd = new Date(date + 'T23:59:59.999Z');
      const branchId = user.branchId || undefined;
      // Totals
      const { rows: cashRows } = await db.execute<any>(sql.raw(`
        SELECT COALESCE(SUM(amount)::numeric, 0) AS total FROM payments
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}' AND payment_method = 'cash'
        AND created_at >= '${dayStart.toISOString()}' AND created_at <= '${dayEnd.toISOString()}'`));
      const { rows: cardRows } = await db.execute<any>(sql.raw(`
        SELECT COALESCE(SUM(amount)::numeric, 0) AS total FROM payments
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}' AND payment_method = 'card'
        AND created_at >= '${dayStart.toISOString()}' AND created_at <= '${dayEnd.toISOString()}'`));
      const { rows: expRows } = await db.execute<any>(sql.raw(`
        SELECT category, COALESCE(SUM(amount)::numeric, 0) AS total
        FROM expenses
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}'
          AND incurred_at >= '${dayStart.toISOString()}' AND incurred_at <= '${dayEnd.toISOString()}'
        GROUP BY category`));
      const cash = Number(cashRows[0]?.total ?? 0);
      const card = Number(cardRows[0]?.total ?? 0);
      const expensesByCat = expRows.map((r) => ({ category: r.category, total: Number(r.total) }));
      // Load GL mappings for expenses
      const { rows: mapRows } = await db.execute<any>(sql.raw(`
        SELECT key, account FROM gl_mappings WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}'
      `));
      const map = new Map<string, string>(mapRows.map((r: any) => [r.key, r.account]));
      // Naive mapping defaults
      const GL = {
        cash: '1000',
        bankClearing: '1010',
        revenue: '4000',
        expenses: (cat: string) => ({ acct: map.get(cat) || `5${String(Math.abs(cat.hashCode?.() ?? 0) % 1000).padStart(3,'0')}`, name: cat }),
      } as const;
      const entries: any[] = [];
      if (cash > 0) entries.push({ debit: GL.cash, credit: GL.revenue, amount: cash, memo: 'Cash receipts' });
      if (card > 0) entries.push({ debit: GL.bankClearing, credit: GL.revenue, amount: card, memo: 'Card receipts' });
      for (const e of expensesByCat) {
        const acct = GL.expenses(e.category);
        entries.push({ debit: acct.acct, credit: GL.cash, amount: e.total, memo: `Expense: ${e.category}` });
      }
      res.json({ date, branchId, entries });
    } catch (err) {
      res.status(500).json({ message: 'Failed to build journal' });
    }
  });

  app.get("/api/accounting/journal.xlsx", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const date = (req.query.date as string | undefined) || new Date().toISOString().slice(0,10);
      const dayStart = new Date(date + 'T00:00:00.000Z');
      const dayEnd = new Date(date + 'T23:59:59.999Z');
      const branchId = user.branchId || undefined;
      const { rows: cashRows } = await db.execute<any>(sql.raw(`
        SELECT COALESCE(SUM(amount)::numeric, 0) AS total FROM payments
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}' AND payment_method = 'cash'
        AND created_at >= '${dayStart.toISOString()}' AND created_at <= '${dayEnd.toISOString()}'`));
      const { rows: cardRows } = await db.execute<any>(sql.raw(`
        SELECT COALESCE(SUM(amount)::numeric, 0) AS total FROM payments
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}' AND payment_method = 'card'
        AND created_at >= '${dayStart.toISOString()}' AND created_at <= '${dayEnd.toISOString()}'`));
      const { rows: expRows } = await db.execute<any>(sql.raw(`
        SELECT category, COALESCE(SUM(amount)::numeric, 0) AS total
        FROM expenses
        WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}'
          AND incurred_at >= '${dayStart.toISOString()}' AND incurred_at <= '${dayEnd.toISOString()}'
        GROUP BY category`));
      const expensesByCat = expRows.map((r) => ({ category: r.category, total: Number(r.total) }));
      const { rows: mapRows } = await db.execute<any>(sql.raw(`
        SELECT key, account FROM gl_mappings WHERE branch_id = '${(branchId as string).replace(/'/g, "''")}'
      `));
      const map = new Map<string, string>(mapRows.map((r: any) => [r.key, r.account]));
      const cash = Number(cashRows[0]?.total ?? 0);
      const card = Number(cardRows[0]?.total ?? 0);
      const GL = { cash: '1000', bankClearing: '1010', revenue: '4000', expenses: (cat: string) => map.get(cat) || `5${String(Math.abs(cat.hashCode?.() ?? 0) % 1000).padStart(3,'0')}` } as const;
      const entries: any[] = [];
      if (cash > 0) entries.push({ debit: GL.cash, credit: GL.revenue, amount: cash, memo: 'Cash receipts' });
      if (card > 0) entries.push({ debit: GL.bankClearing, credit: GL.revenue, amount: card, memo: 'Card receipts' });
      for (const e of expensesByCat) entries.push({ debit: GL.expenses(e.category), credit: GL.cash, amount: e.total, memo: `Expense: ${e.category}` });
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Journal');
      ws.columns = [
        { header: 'debit', key: 'debit', width: 16 },
        { header: 'credit', key: 'credit', width: 16 },
        { header: 'amount', key: 'amount', width: 12 },
        { header: 'memo', key: 'memo', width: 40 },
      ];
      ws.addRows(entries);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="journal-${date}.xlsx"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ message: 'Failed to build journal' });
    }
  });

  // GL mappings endpoints
  app.get("/api/accounting/gl-mappings", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === 'super_admin' ? (req.query.branchId as string || user.branchId) : user.branchId;
      if (!branchId) return res.status(400).json({ message: 'Branch is required' });
      const { rows } = await db.execute<any>(sql.raw(`SELECT id, key, account, type FROM gl_mappings WHERE branch_id = '${branchId.replace(/'/g, "''")}' ORDER BY key ASC`));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch mappings' });
    }
  });

  app.put("/api/accounting/gl-mappings", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const branchId = user.role === 'super_admin' ? (req.body.branchId as string || user.branchId) : user.branchId;
      if (!branchId) return res.status(400).json({ message: 'Branch is required' });
      const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
      // Upsert by (branchId, key)
      for (const m of mappings) {
        const parsed = insertGlMappingSchema.parse({ ...m, branchId });
        await db.execute(sql.raw(`
          INSERT INTO gl_mappings (branch_id, key, account, type)
          VALUES ('${branchId.replace(/'/g, "''")}', '${String(parsed.key).replace(/'/g, "''")}', '${String(parsed.account).replace(/'/g, "''")}', '${String(parsed.type).replace(/'/g, "''")}')
          ON CONFLICT (branch_id, key) DO UPDATE SET account = EXCLUDED.account, type = EXCLUDED.type, updated_at = now()
        `));
      }
      res.json({ message: 'Mappings saved', count: mappings.length });
    } catch (err) {
      res.status(400).json({ message: 'Failed to save mappings' });
    }
  });

  // Orders export (CSV)
  app.get("/api/reports/orders/export", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) {
      return res.status(400).json({ message: error });
    }
    try {
      const status = (req.query.status as string | undefined)?.trim();
      const method = (req.query.method as string | undefined)?.trim();
      const where: string[] = ["o.is_delivery_request = false"]; // exclude delivery requests
      if (filter.branchId) where.push(`o.branch_id = '${filter.branchId}'`);
      if (filter.start) where.push(`o.created_at >= '${filter.start.toISOString()}'`);
      if (filter.end) where.push(`o.created_at <= '${filter.end.toISOString()}'`);
      if (status) {
        where.push(`o.status = '${status.replace(/'/g, "''")}'`);
      } else {
        // Exclude cancelled by default
        where.push("o.status <> 'cancelled'");
      }
      if (method) where.push(`o.payment_method = '${method.replace(/'/g, "''")}'`);
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const sqlText = `
        SELECT 
          o.created_at as created_at,
          o.order_number as order_number,
          o.customer_name as customer_name,
          o.status as status,
          o.total as total,
          o.payment_method as payment_method,
          o.branch_id as branch_id,
          o.id as order_id
        FROM orders o
        ${clause}
        ORDER BY o.created_at ASC
      `;

      const { rows } = await db.execute<any>(sql.raw(sqlText));
      const header = [
        "created_at","order_number","customer_name","status","total","payment_method","branch_id","order_id"
      ];
      const escape = (v: any) => {
        const s = v == null ? "" : String(v);
        if (s.includes(",") || s.includes("\n") || s.includes('"')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push([
          r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          r.order_number,
          r.customer_name ?? "",
          r.status,
          r.total,
          r.payment_method,
          r.branch_id,
          r.order_id,
        ].map(escape).join(","));
      }
      const startStr = filter.start ? new Date(filter.start).toISOString().slice(0,10) : 'all';
      const endStr = filter.end ? new Date(filter.end).toISOString().slice(0,10) : 'now';
      const branchStr = filter.branchId ? filter.branchId.slice(0,8) : 'all';
      const filename = `orders-${branchStr}-${startStr}-${endStr}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
      res.send(lines.join("\n"));
    } catch (err) {
      logger.error({ err }, "Failed to export orders");
      res.status(500).json({ message: "Failed to export orders" });
    }
  });

  // Orders export (XLSX)
  app.get("/api/reports/orders/export.xlsx", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) return res.status(400).json({ message: error });
    try {
      const status = (req.query.status as string | undefined)?.trim();
      const method = (req.query.method as string | undefined)?.trim();
      const where: string[] = ["o.is_delivery_request = false"]; // exclude delivery requests
      if (filter.branchId) where.push(`o.branch_id = '${filter.branchId}'`);
      if (filter.start) where.push(`o.created_at >= '${filter.start.toISOString()}'`);
      if (filter.end) where.push(`o.created_at <= '${filter.end.toISOString()}'`);
      if (status) {
        where.push(`o.status = '${status.replace(/'/g, "''")}'`);
      } else {
        where.push("o.status <> 'cancelled'");
      }
      if (method) where.push(`o.payment_method = '${method.replace(/'/g, "''")}'`);
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const sqlText = `
        SELECT o.created_at, o.order_number, o.customer_name, o.status, o.total, o.payment_method, o.branch_id, o.id as order_id
        FROM orders o
        ${clause}
        ORDER BY o.created_at ASC
      `;
      const { rows } = await db.execute<any>(sql.raw(sqlText));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Orders');
      ws.columns = [
        { header: 'created_at', key: 'created_at', width: 24 },
        { header: 'order_number', key: 'order_number', width: 18 },
        { header: 'customer_name', key: 'customer_name', width: 28 },
        { header: 'status', key: 'status', width: 16 },
        { header: 'total', key: 'total', width: 12 },
        { header: 'payment_method', key: 'payment_method', width: 18 },
        { header: 'branch_id', key: 'branch_id', width: 36 },
        { header: 'order_id', key: 'order_id', width: 38 },
      ];
      rows.forEach((r) => ws.addRow({
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        order_number: r.order_number,
        customer_name: r.customer_name ?? '',
        status: r.status,
        total: r.total,
        payment_method: r.payment_method,
        branch_id: r.branch_id,
        order_id: r.order_id,
      }));

      const startStr = filter.start ? new Date(filter.start).toISOString().slice(0,10) : 'all';
      const endStr = filter.end ? new Date(filter.end).toISOString().slice(0,10) : 'now';
      const branchStr = filter.branchId ? filter.branchId.slice(0,8) : 'all';
      const filename = `orders-${branchStr}-${startStr}-${endStr}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      logger.error({ err }, 'Failed to export orders xlsx');
      res.status(500).json({ message: 'Failed to export orders' });
    }
  });

  // Payments export (CSV)
  app.get("/api/reports/payments/export", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) {
      return res.status(400).json({ message: error });
    }

    try {
      const method = (req.query.method as string | undefined)?.trim();
      const channel = (req.query.channel as string | undefined)?.trim();

      const where: string[] = [];
      if (filter.branchId) where.push(`p.branch_id = '${filter.branchId}'`);
      if (filter.start) where.push(`p.created_at >= '${filter.start.toISOString()}'`);
      if (filter.end) where.push(`p.created_at <= '${filter.end.toISOString()}'`);
      if (method) where.push(`p.payment_method = '${method.replace(/'/g, "''")}'`);
      if (channel) where.push(`p.channel = '${channel.replace(/'/g, "''")}'`);
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const sqlText = `
        SELECT 
          p.created_at as created_at,
          p.amount as amount,
          p.payment_method as payment_method,
          p.channel as channel,
          p.notes as notes,
          p.received_by as received_by,
          p.order_id as order_id,
          p.customer_id as customer_id
        FROM payments p
        ${clause}
        ORDER BY p.created_at ASC
      `;

      const { rows } = await db.execute<any>(sql.raw(sqlText));

      const header = [
        "created_at",
        "amount",
        "payment_method",
        "channel",
        "notes",
        "received_by",
        "order_id",
        "customer_id",
      ];

      const escape = (v: any) => {
        const s = v == null ? "" : String(v);
        if (s.includes(",") || s.includes("\n") || s.includes('"')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push([
          r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          r.amount,
          r.payment_method,
          r.channel ?? "",
          r.notes ?? "",
          r.received_by,
          r.order_id ?? "",
          r.customer_id,
        ].map(escape).join(","));
      }

      const startStr = filter.start ? new Date(filter.start).toISOString().slice(0,10) : 'all';
      const endStr = filter.end ? new Date(filter.end).toISOString().slice(0,10) : 'now';
      const branchStr = filter.branchId ? filter.branchId.slice(0,8) : 'all';
      const filename = `payments-${branchStr}-${startStr}-${endStr}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
      res.send(lines.join("\n"));
    } catch (err) {
      logger.error({ err }, "Failed to export payments");
      res.status(500).json({ message: "Failed to export payments" });
    }
  });

  // Payments export (XLSX)
  app.get("/api/reports/payments/export.xlsx", requireAdminOrSuperAdmin, async (req, res) => {
    const user = req.user as UserWithBranch;
    const { filter, error } = parseReportFilters(req, user);
    if (error) return res.status(400).json({ message: error });
    try {
      const method = (req.query.method as string | undefined)?.trim();
      const channel = (req.query.channel as string | undefined)?.trim();
      const where: string[] = [];
      if (filter.branchId) where.push(`p.branch_id = '${filter.branchId}'`);
      if (filter.start) where.push(`p.created_at >= '${filter.start.toISOString()}'`);
      if (filter.end) where.push(`p.created_at <= '${filter.end.toISOString()}'`);
      if (method) where.push(`p.payment_method = '${method.replace(/'/g, "''")}'`);
      if (channel) where.push(`p.channel = '${channel.replace(/'/g, "''")}'`);
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const sqlText = `
        SELECT p.created_at, p.amount, p.payment_method, p.channel, p.notes, p.received_by, p.order_id, p.customer_id
        FROM payments p
        ${clause}
        ORDER BY p.created_at ASC
      `;
      const { rows } = await db.execute<any>(sql.raw(sqlText));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Payments');
      ws.columns = [
        { header: 'created_at', key: 'created_at', width: 24 },
        { header: 'amount', key: 'amount', width: 12 },
        { header: 'payment_method', key: 'payment_method', width: 16 },
        { header: 'channel', key: 'channel', width: 12 },
        { header: 'notes', key: 'notes', width: 40 },
        { header: 'received_by', key: 'received_by', width: 24 },
        { header: 'order_id', key: 'order_id', width: 38 },
        { header: 'customer_id', key: 'customer_id', width: 38 },
      ];
      rows.forEach((r) => ws.addRow({
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        amount: r.amount,
        payment_method: r.payment_method,
        channel: r.channel ?? '',
        notes: r.notes ?? '',
        received_by: r.received_by,
        order_id: r.order_id ?? '',
        customer_id: r.customer_id,
      }));

      const startStr = filter.start ? new Date(filter.start).toISOString().slice(0,10) : 'all';
      const endStr = filter.end ? new Date(filter.end).toISOString().slice(0,10) : 'now';
      const branchStr = filter.branchId ? filter.branchId.slice(0,8) : 'all';
      const filename = `payments-${branchStr}-${startStr}-${endStr}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      logger.error({ err }, 'Failed to export payments xlsx');
      res.status(500).json({ message: 'Failed to export payments' });
    }
  });

  // Pay-later receipts report (payments received by date)
  app.get("/api/reports/pay-later-receipts", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const filter: any = {};
      if (req.query.start) filter.start = new Date(req.query.start as string);
      if (req.query.end) filter.end = new Date(req.query.end as string);
      if (req.query.branchId) filter.branchId = req.query.branchId as string;
      const summary = await storage.getPayLaterReceiptsByDateRange(filter);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pay-later receipts" });
    }
  });

  // Pay-later orders summarized by order created date (revenue = sum of payments)
  app.get("/api/reports/pay-later-orders-by-date", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const filter: any = {};
      if (req.query.start) filter.start = new Date(req.query.start as string);
      if (req.query.end) filter.end = new Date(req.query.end as string);
      if (req.query.branchId) filter.branchId = req.query.branchId as string;
      const summary = await storage.getPayLaterOrderDateSummaryByRange(filter);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pay-later order-date summary" });
    }
  });

  // Financial report endpoint (cash sales, outstanding, cash and card receipts)
  app.get("/api/reports/financials", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const filter: any = {};
      if (req.query.start) filter.start = new Date(req.query.start as string);
      if (req.query.end) filter.end = new Date(req.query.end as string);
      if (req.query.branchId) filter.branchId = req.query.branchId as string;
      const report = await storage.getFinancialReport(filter);
      res.json(report);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch financial report" });
    }
  });

  // Pay-later aging by customer
  app.get("/api/reports/pay-later-aging", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const filter: any = {};
      if (req.query.start) filter.start = new Date(req.query.start as string);
      if (req.query.end) filter.end = new Date(req.query.end as string);
      if (req.query.branchId) filter.branchId = req.query.branchId as string;
      const aging = await storage.getPayLaterAgingByCustomer(filter);
      res.json(aging);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pay-later aging" });
    }
  });

  // Pay-later outstanding orders (per order)
  app.get("/api/reports/pay-later-outstanding-orders", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const filter: any = {};
      if (req.query.start) filter.start = new Date(req.query.start as string);
      if (req.query.end) filter.end = new Date(req.query.end as string);
      if (req.query.branchId) filter.branchId = req.query.branchId as string;
      const result = await storage.getOpenPayLaterOrders(filter);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch outstanding orders" });
    }
  });

  async function getReportSummary(user: UserWithBranch) {
    const branchId = user.branchId || undefined;
    const [transactions, orders, customersResult, payments, laundryServices] =
      await Promise.all([
        storage.getTransactions(branchId),
        storage.getOrders(branchId),
        storage.getCustomers(undefined, false, branchId),
        storage.getPayments(branchId),
        storage.getLaundryServices(user.id),
      ]);
    return {
      transactions,
      orders,
      customers: customersResult.items,
      payments,
      laundryServices,
    };
  }

  app.get("/api/report/summary", requireAuth, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const summary = await getReportSummary(user);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch report summary" });
    }
  });

  app.get("/api/report/summary/stream", requireAuth, async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const user = req.user as UserWithBranch;

    const sendSummary = async () => {
      try {
        const summary = await getReportSummary(user);
        res.write(`data: ${JSON.stringify(summary)}\n\n`);
      } catch (error) {
        // ignore errors
      }
    };

    const interval = setInterval(sendSummary, 30000);
    await sendSummary();

    req.on("close", () => {
      clearInterval(interval);
    });
  });

  // Reports routes
  app.get("/api/reports/orders", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const range = (req.query.range as string) || "daily";
      const user = req.user as UserWithBranch;
      const summary = await storage.getSalesSummary(range, user.branchId || undefined);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order reports" });
    }
  });

  app.get("/api/reports/top-services", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const range = (req.query.range as string) || "daily";
      const user = req.user as UserWithBranch;
      const services = await storage.getTopServices(range, user.branchId || undefined);
      res.json({ services });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch top services" });
    }
  });

  app.get("/api/reports/top-products", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const range = (req.query.range as string) || "daily";
      const user = req.user as UserWithBranch;
      const products = await storage.getTopProducts(range, user.branchId || undefined);
      res.json({ products });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch top products" });
    }
  });

  app.get("/api/reports/top-packages", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const range = (req.query.range as string) || "daily";
      const user = req.user as UserWithBranch;
      const packages = await storage.getTopPackages(range, user.branchId || undefined);
      res.json({ packages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch top packages" });
    }
  });

  app.get("/api/reports/package-usage", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { filter, error } = parseReportFilters(req, user);
      if (error) return res.status(400).json({ message: error });
      const customerId = req.query.customerId as string | undefined;
      const packageId = req.query.packageId as string | undefined;
      const rows = await storage.getPackageUsageReport({ ...filter, customerId, packageId });
      res.json({ usage: rows });
    } catch (e) {
      res.status(500).json({ message: 'Failed to fetch package usage' });
    }
  });

  app.get("/api/reports/package-assignments", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const status = (req.query.status as string) || "all";
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const list = await storage.getAssignedPackages(
        user.branchId || undefined,
        status === "active" || status === "expired" ? (status as any) : "all",
        limit,
      );
      res.json({ assignments: list });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch package assignments" });
    }
  });

  app.get("/api/reports/clothing-items", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const range = (req.query.range as string) || "daily";
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const user = req.user as UserWithBranch;
      const items = await storage.getClothingItemStats(
        range,
        user.branchId || undefined,
        limit,
      );
      res.json({ items });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch clothing item stats" });
    }
  });

  app.get("/api/reports/customer-insights", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { branchId: queryBranchId, limit } = req.query as Record<string, string>;
      const isSuperAdmin = user.role === "super_admin";
      const effectiveBranchId = isSuperAdmin ? queryBranchId || undefined : user.branchId || undefined;
      const parsedLimit = limit ? Math.max(1, Math.min(500, Number.parseInt(limit, 10) || 0)) : undefined;
      const insights = await storage.getCustomerInsights({
        branchId: effectiveBranchId,
        limit: parsedLimit,
      });
      res.json({ items: insights, total: insights.length });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer insights" });
    }
  });

  app.get("/api/customer-insights/:id/actions", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const rawId = await resolveUuidByPublicId(customers, req.params.id);
      const branchScope = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const customer = await storage.getCustomer(rawId, branchScope);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const plan = await storage.getCustomerEngagementPlan(rawId);
      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
          phoneNumber: customer.phoneNumber,
          email: customer.email,
          branchId: customer.branchId,
        },
        plan: plan || null,
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to load customer engagement plan");
      res.status(500).json({ message: "Failed to load customer engagement plan" });
    }
  });

  app.put("/api/customer-insights/:id/actions", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const rawId = await resolveUuidByPublicId(customers, req.params.id);
      const branchScope = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const customer = await storage.getCustomer(rawId, branchScope);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const schema = z
        .object({
          recommendedAction: z.string().trim().max(500).optional().nullable(),
          recommendedChannel: z.enum(["sms", "email"]).optional().nullable(),
          nextContactAt: z.string().datetime().optional().nullable(),
          lastOutcome: z.string().trim().max(500).optional().nullable(),
          planSource: z.enum(["auto", "manual"]).optional(),
          clearRateLimit: z.boolean().optional(),
        })
        .partial();

      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return res.status(400).json({ message: issue?.message || "Invalid payload" });
      }

      const data = parsed.data;
      const updates: CustomerEngagementPlanUpdateInput = {};
      if (typeof data.recommendedAction !== "undefined") {
        updates.recommendedAction = data.recommendedAction ? data.recommendedAction.trim() : null;
      }
      if (typeof data.recommendedChannel !== "undefined") {
        updates.recommendedChannel = data.recommendedChannel ?? null;
      }
      if (typeof data.nextContactAt !== "undefined") {
        if (data.nextContactAt === null) {
          updates.nextContactAt = null;
        } else {
          const parsedDate = new Date(data.nextContactAt);
          if (Number.isNaN(parsedDate.getTime())) {
            return res.status(400).json({ message: "Invalid nextContactAt" });
          }
          updates.nextContactAt = parsedDate;
        }
      }
      if (typeof data.lastOutcome !== "undefined") {
        updates.lastOutcome = data.lastOutcome ? data.lastOutcome.trim() : null;
      }
      if (typeof data.planSource !== "undefined") {
        updates.source = data.planSource;
      }
      if (data.clearRateLimit) {
        updates.rateLimitedUntil = null;
      }

      const metadata: Record<string, unknown> = {};
      if (typeof data.recommendedAction !== "undefined") {
        metadata.recommendedAction = data.recommendedAction;
      }
      if (typeof data.recommendedChannel !== "undefined") {
        metadata.recommendedChannel = data.recommendedChannel;
      }
      if (typeof data.nextContactAt !== "undefined") {
        metadata.nextContactAt = data.nextContactAt;
      }
      if (typeof data.lastOutcome !== "undefined") {
        metadata.lastOutcome = data.lastOutcome;
      }
      if (typeof data.planSource !== "undefined") {
        metadata.planSource = data.planSource;
      }

      const plan = await storage.updateCustomerEngagementPlan(rawId, updates, customer.branchId);
      res.json(plan ?? null);

      await eventBus.publish(
        createAnalyticsEvent({
          source: "api.customer-insights.plan",
          category: "campaign.interaction",
          name: "plan_updated",
          payload: {
            customerId: customer.id,
            branchId: customer.branchId ?? null,
            campaignId: plan?.id ?? undefined,
            channel: data.recommendedChannel ?? plan?.recommendedChannel ?? undefined,
            templateKey: undefined,
            status: "updated",
            reason: data.lastOutcome ?? plan?.lastOutcome ?? undefined,
            metadata: Object.keys(metadata).length ? metadata : undefined,
          },
          actor: {
            actorId: user.id,
            actorType: "user",
            actorName: getActorName(user),
          },
          context: {
            tenantId: customer.branchId ?? undefined,
          },
        }),
      );
    } catch (error) {
      logger.error({ err: error }, "Failed to update customer engagement plan");
      res.status(500).json({ message: "Failed to update customer engagement plan" });
    }
  });

  app.post("/api/customer-insights/actions/bulk-send", requireAdminOrSuperAdmin, async (req, res) => {
    const schema = z.object({
      customerIds: z.array(z.string().min(1)).min(1).max(MAX_BULK_CUSTOMER_ACTIONS),
      channel: z.enum(["sms", "email"]),
      message: z.string().trim().min(1).max(2000),
      subject: z.string().trim().max(150).optional(),
      templateKey: z.string().trim().max(120).optional(),
      rateLimitHours: z.number().min(1).max(168).optional(),
      nextContactAt: z.string().datetime().optional().nullable(),
    });

    try {
      const user = req.user as UserWithBranch;
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return res.status(400).json({ message: issue?.message || "Invalid payload" });
      }

      const { customerIds, channel, message, subject, templateKey, rateLimitHours, nextContactAt } = parsed.data;
      if (channel === "email" && (!subject || !subject.trim())) {
        return res.status(400).json({ message: "Email subject is required" });
      }

      const effectiveBranchId = user.role === "super_admin" ? undefined : user.branchId || undefined;
      const customersList = await storage.getCustomersByIds(customerIds, effectiveBranchId);
      const customerMap = new Map(customersList.map((customer) => [customer.id, customer]));
      const rateLimitMs = Math.max(1, Math.min(rateLimitHours ?? DEFAULT_CUSTOMER_OUTREACH_RATE_LIMIT_HOURS, 168)) *
        60 * 60 * 1000;
      const nextContactDate = typeof nextContactAt === "string" && nextContactAt
        ? (() => {
            const parsedDate = new Date(nextContactAt);
            return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
          })()
        : nextContactAt === null
        ? null
        : undefined;

      const results: Array<{
        customerId: string;
        status: "sent" | "skipped" | "failed";
        reason?: string;
      }> = [];
      const eventPromises: Array<Promise<void>> = [];

      for (const customerId of customerIds) {
        const customer = customerMap.get(customerId);
        if (!customer) {
          results.push({ customerId, status: "skipped", reason: "Customer not accessible" });
          continue;
        }

        const plan = await storage.getCustomerEngagementPlan(customerId);
        if (plan?.rateLimitedUntil) {
          const until = new Date(plan.rateLimitedUntil);
          if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
            results.push({
              customerId,
              status: "skipped",
              reason: `Rate limited until ${until.toISOString()}`,
            });
            continue;
          }
        }

        const personalizedMessage = message.replace(/\{name\}/gi, customer.name);
        const personalizedSubject = subject ? subject.replace(/\{name\}/gi, customer.name) : undefined;

        let status: "sent" | "skipped" | "failed" = "sent";
        let reason: string | undefined;

        try {
          if (channel === "sms") {
            if (!customer.phoneNumber) {
              status = "skipped";
              reason = "Missing phone number";
            } else {
              const sent = await notificationService.sendSMS(customer.phoneNumber, personalizedMessage);
              if (!sent) {
                status = "skipped";
                reason = "SMS notifications disabled";
              }
            }
          } else {
            if (!customer.email) {
              status = "skipped";
              reason = "Missing email address";
            } else {
              const htmlMessage = /<[^>]+>/.test(personalizedMessage)
                ? personalizedMessage
                : personalizedMessage.replace(/\n/g, "<br />");
              const sent = await notificationService.sendEmail(customer.email, personalizedSubject!, htmlMessage);
              if (!sent) {
                status = "skipped";
                reason = "Email notifications disabled";
              }
            }
          }
        } catch (error) {
          status = "failed";
          const err = error instanceof Error ? error.message : "Unknown error";
          reason = err;
          logger.error({ err: error, customerId }, "Failed to queue outreach notification");
        }

        const now = new Date();
        const planUpdates: CustomerEngagementPlanUpdateInput = {
          lastActionAt: now,
          lastActionChannel: channel,
          lastOutcome:
            status === "sent"
              ? `sent:${channel}${templateKey ? `:${templateKey}` : ""}`
              : status === "skipped"
              ? `skipped:${reason ?? "unknown"}`
              : `failed:${reason ?? "unknown"}`,
          source: "manual",
          rateLimitedUntil: new Date(now.getTime() + rateLimitMs),
        };

        if (!plan || plan.source === "auto") {
          planUpdates.recommendedAction = personalizedMessage;
          planUpdates.recommendedChannel = channel;
        }

        if (typeof nextContactDate !== "undefined") {
          planUpdates.nextContactAt = nextContactDate;
        }

        await storage.updateCustomerEngagementPlan(customerId, planUpdates, customer.branchId);

        results.push({ customerId, status, reason });

        eventPromises.push(
          eventBus.publish(
            createAnalyticsEvent({
              source: "api.customer-insights.bulk-send",
              category: "campaign.interaction",
              name: status === "sent" ? "outreach_completed" : "outreach_attempted",
              payload: {
                customerId,
                branchId: customer.branchId ?? null,
                campaignId: templateKey ?? undefined,
                channel,
                templateKey: templateKey ?? undefined,
                status,
                reason,
              },
              actor: {
                actorId: user.id,
                actorType: "user",
                actorName: getActorName(user),
              },
              context: {
                tenantId: customer.branchId ?? undefined,
              },
            }),
          ),
        );
      }

      await Promise.all(eventPromises);
      res.json({ results });
    } catch (error) {
      logger.error({ err: error }, "Failed to queue outreach notifications");
      res.status(500).json({ message: "Failed to queue outreach notifications" });
    }
  });

  // Expenses management (Admin/Super Admin)
  app.get("/api/expenses", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { start, end, branchId, q, limit, offset, page, pageSize } = req.query as any;
      const startDate = start ? new Date(start) : undefined;
      const endDate = end ? new Date(end) : undefined;
      const effectiveBranchId = user.role === "super_admin" ? (branchId as string | undefined) : user.branchId;
      if (!effectiveBranchId) return res.status(400).json({ message: "Branch is required" });
      const customization = await storage.getBranchCustomization(effectiveBranchId);
      if (!customization?.expensesEnabled) return res.status(403).json({ message: "Expenses feature is disabled for this branch" });
      const ps = pageSize ? parseInt(pageSize, 10) : (limit ? parseInt(limit, 10) : undefined);
      const pg = page ? parseInt(page, 10) : undefined;
      const off = typeof pg === 'number' && typeof ps === 'number' ? (pg - 1) * ps : (offset ? parseInt(offset, 10) : undefined);
      const search = q as string | undefined;
      const [items, all] = await Promise.all([
        storage.getExpenses(effectiveBranchId, startDate, endDate, search, ps, off),
        storage.getExpenses(effectiveBranchId, startDate, endDate, search),
      ]);
      res.setHeader('X-Total-Count', String(all.length));
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch expenses" });
    }
  });

  app.post("/api/expenses", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const body = req.body as any;
      const effectiveBranchId = user.role === "super_admin" ? (body.branchId || user.branchId) : user.branchId;
      if (!effectiveBranchId) return res.status(400).json({ message: "Branch is required" });
      const customization = await storage.getBranchCustomization(effectiveBranchId);
      if (!customization?.expensesEnabled) return res.status(403).json({ message: "Expenses feature is disabled for this branch" });
      const created = await storage.createExpense(body, user.id, effectiveBranchId);
      res.status(201).json(created);
    } catch (error) {
      res.status(500).json({ message: "Failed to create expense" });
    }
  });

  app.put("/api/expenses/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { id } = req.params;
      const effectiveBranchId = user.role === "super_admin" ? (req.body.branchId || user.branchId) : user.branchId;
      if (!effectiveBranchId) return res.status(400).json({ message: "Branch is required" });
      const customization = await storage.getBranchCustomization(effectiveBranchId);
      if (!customization?.expensesEnabled) return res.status(403).json({ message: "Expenses feature is disabled for this branch" });
      const updated = await storage.updateExpense(id, req.body, effectiveBranchId);
      if (!updated) return res.status(404).json({ message: "Expense not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update expense" });
    }
  });

  app.delete("/api/expenses/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { id } = req.params;
      const effectiveBranchId = user.role === "super_admin" ? (req.query.branchId as string | undefined) : user.branchId;
      if (!effectiveBranchId) return res.status(400).json({ message: "Branch is required" });
      const customization = await storage.getBranchCustomization(effectiveBranchId);
      if (!customization?.expensesEnabled) return res.status(403).json({ message: "Expenses feature is disabled for this branch" });
      const ok = await storage.deleteExpense(id, effectiveBranchId);
      if (!ok) return res.status(404).json({ message: "Expense not found" });
      res.json({ message: "Expense deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete expense" });
    }
  });

  // Bulk delete expenses
  app.delete("/api/expenses", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { ids } = req.body as { ids?: string[] };
      if (!ids || ids.length === 0) return res.status(400).json({ message: "No ids provided" });
      const effectiveBranchId = user.role === "super_admin" ? (req.query.branchId as string | undefined) : user.branchId;
      if (!effectiveBranchId) return res.status(400).json({ message: "Branch is required" });
      const customization = await storage.getBranchCustomization(effectiveBranchId);
      if (!customization?.expensesEnabled) return res.status(403).json({ message: "Expenses feature is disabled for this branch" });
      let deleted = 0;
      for (const id of ids) {
        const ok = await storage.deleteExpense(id, effectiveBranchId);
        if (ok) deleted++;
      }
      res.json({ message: `Deleted ${deleted} expenses` });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete expenses" });
    }
  });

  // Export expenses as CSV (server-side)
  app.get("/api/expenses/export", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { start, end, branchId, q } = req.query as any;
      const startDate = start ? new Date(start) : undefined;
      const endDate = end ? new Date(end) : undefined;
      const effectiveBranchId = user.role === "super_admin" ? (branchId as string | undefined) : user.branchId;
      if (!effectiveBranchId) return res.status(400).json({ message: "Branch is required" });
      const customization = await storage.getBranchCustomization(effectiveBranchId);
      if (!customization?.expensesEnabled) return res.status(403).json({ message: "Expenses feature is disabled for this branch" });

      const items = await storage.getExpenses(effectiveBranchId, startDate, endDate, q as string | undefined);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="expenses_${start || 'all'}_${end || 'all'}.csv"`);
      const header = ["category", "amount", "incurredAt", "notes", "paymentMethod"];
      res.write(header.join(",") + "\n");
      for (const r of items) {
        const row = [
          JSON.stringify((r as any).category ?? ""),
          JSON.stringify((r as any).amount ?? ""),
          JSON.stringify((r as any).incurredAt ? new Date((r as any).incurredAt).toISOString().slice(0,10) : ""),
          JSON.stringify((r as any).notes ?? ""),
          JSON.stringify((r as any).paymentMethod ?? ""),
        ];
        res.write(row.join(",") + "\n");
      }
      res.end();
    } catch (error) {
      res.status(500).json({ message: "Failed to export expenses" });
    }
  });

  // Export expenses as XLSX (server-side)
  app.get("/api/expenses/export.xlsx", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const { start, end, branchId, q } = req.query as any;
      const startDate = start ? new Date(start) : undefined;
      const endDate = end ? new Date(end) : undefined;
      const effectiveBranchId = user.role === "super_admin" ? (branchId as string | undefined) : user.branchId;
      if (!effectiveBranchId) return res.status(400).json({ message: "Branch is required" });
      const customization = await storage.getBranchCustomization(effectiveBranchId);
      if (!customization?.expensesEnabled) return res.status(403).json({ message: "Expenses feature is disabled for this branch" });

      const items = await storage.getExpenses(effectiveBranchId, startDate, endDate, q as string | undefined);
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Expenses");
      ws.columns = [
        { header: "Category", key: "category", width: 30 },
        { header: "Amount", key: "amount", width: 15 },
        { header: "Date", key: "incurredAt", width: 15 },
        { header: "Notes", key: "notes", width: 50 },
        { header: "Method", key: "paymentMethod", width: 16 },
      ];
      ws.addRows(
        items.map((r: any) => ({
          category: r.category || "",
          amount: Number(r.amount || 0),
          incurredAt: r.incurredAt ? new Date(r.incurredAt).toISOString().slice(0, 10) : "",
          notes: r.notes || "",
          paymentMethod: r.paymentMethod || "",
        }))
      );
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="expenses_${start || 'all'}_${end || 'all'}.xlsx"`
      );
      await wb.xlsx.write(res);
      res.end();
    } catch (error) {
      res.status(500).json({ message: "Failed to export expenses (xlsx)" });
    }
  });

  app.get("/api/reports/expenses", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const range = (req.query.range as string) || "monthly";
      const effectiveBranchId = user.role === "super_admin" ? (req.query.branchId as string | undefined) : user.branchId || undefined;
      if (!effectiveBranchId) return res.status(400).json({ message: "Branch is required" });
      const customization = await storage.getBranchCustomization(effectiveBranchId);
      if (!customization?.expensesEnabled) return res.status(403).json({ message: "Expenses feature is disabled for this branch" });
      const summary = await storage.getExpenseSummary(range, effectiveBranchId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch expense reports" });
    }
  });

  app.get("/api/order-logs", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const logs = await storage.getOrderLogs(status);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch order logs" });
    }
  });

  // Delivery Management API Routes

  // Branch Delivery Settings Routes
  // Customer Dashboard Settings routes
  app.get("/api/branches/:id/customer-dashboard-settings", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch settings" });
      }
      const settings = await storage.getCustomerDashboardSettings(id);
      res.json(settings || {});
    } catch (error) {
      logger.error("Error fetching customer dashboard settings:", error as any);
      res.status(500).json({ message: "Failed to fetch customer dashboard settings" });
    }
  });

  app.put("/api/branches/:id/customer-dashboard-settings", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branch settings" });
      }
      const settings = await storage.updateCustomerDashboardSettings(id, req.body);
      res.json(settings);
    } catch (error) {
      logger.error("Error updating customer dashboard settings:", error as any);
      res.status(500).json({ message: "Failed to update customer dashboard settings" });
    }
  });

  // Customer endpoints for dashboard settings and customization
  app.get("/customer/dashboard-settings", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) return res.status(401).json({ message: "Not authenticated" });
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const settings = await storage.getCustomerDashboardSettings(customer.branchId);
      res.json(settings || {});
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard settings" });
    }
  });

  app.get("/customer/customization", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) return res.status(401).json({ message: "Not authenticated" });
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const customization = await storage.getBranchCustomization(customer.branchId);
      res.json(customization || {});
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch branch customization" });
    }
  });

  // Ads management (admin)
  app.get("/api/branches/:id/ads", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch ads" });
      }
      const ads = await storage.getBranchAds(id);
      res.json(ads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ads" });
    }
  });

  app.post("/api/branches/:id/ads", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as UserWithBranch;
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branch ads" });
      }
      const ad = await storage.createBranchAd({ ...(req.body || {}), branchId: id });
      res.status(201).json(ad);
    } catch (error) {
      res.status(400).json({ message: "Failed to create ad" });
    }
  });

  app.put("/api/ads/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const ad = await storage.updateBranchAd(req.params.id, req.body || {});
      if (!ad) return res.status(404).json({ message: "Ad not found" });
      res.json(ad);
    } catch (error) {
      res.status(400).json({ message: "Failed to update ad" });
    }
  });

  app.delete("/api/ads/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const user = req.user as UserWithBranch;
      const ok = await storage.deleteBranchAd(req.params.id, user.role === "super_admin" ? undefined : user.branchId || undefined);
      if (!ok) return res.status(404).json({ message: "Ad not found" });
      res.json({ message: "Ad deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete ad" });
    }
  });

  // Upload ad image for a branch
  app.post(
    "/api/branches/:id/ads/upload-image",
    requireAdminOrSuperAdmin,
    uploadLogo.single("image"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const user = req.user as User;
        if (user.role !== "super_admin" && user.branchId !== id) {
          return res.status(403).json({ message: "Cannot modify other branch ads" });
        }
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ imageUrl });
      } catch (error) {
        logger.error("Error uploading ad image:", error as any);
        res.status(500).json({ message: "Failed to upload ad image" });
      }
    }
  );

  // Customer: fetch active ads for their branch
  app.get("/customer/ads", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) return res.status(401).json({ message: "Not authenticated" });
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const ads = await storage.getActiveAds(customer.branchId);
      res.json(ads);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ads" });
    }
  });

  // Customer: ad analytics endpoints
  app.post("/customer/ads/:id/impression", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      const adId = req.params.id;
      const ad = await db.select().from(branchAds).where(eq(branchAds.id, adId)).then(r => r[0]);
      if (!ad) return res.status(404).json({ message: "Ad not found" });
      await storage.recordAdImpression({
        adId,
        branchId: ad.branchId,
        customerId: customerId || null,
        cityId: req.body?.cityId || null,
        governorateId: req.body?.governorateId || null,
        lat: req.body?.lat || null,
        lng: req.body?.lng || null,
        language: req.body?.language || req.headers['accept-language'] || null,
        userAgent: req.headers['user-agent'] || null,
        referrer: req.headers['referer'] || null,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to record impression" });
    }
  });

  app.post("/customer/ads/:id/click", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      const adId = req.params.id;
      const ad = await db.select().from(branchAds).where(eq(branchAds.id, adId)).then(r => r[0]);
      if (!ad) return res.status(404).json({ message: "Ad not found" });
      await storage.recordAdClick({
        adId,
        branchId: ad.branchId,
        customerId: customerId || null,
        cityId: req.body?.cityId || null,
        governorateId: req.body?.governorateId || null,
        lat: req.body?.lat || null,
        lng: req.body?.lng || null,
        language: req.body?.language || req.headers['accept-language'] || null,
        userAgent: req.headers['user-agent'] || null,
        referrer: req.headers['referer'] || null,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to record click" });
    }
  });

  // Service Cities Routes
  app.get("/api/branches/:id/service-cities", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch service cities" });
      }
      
      const branch = await storage.getBranch(id);
      const cities = branch?.serviceCityIds || [];
      res.json(cities);
    } catch (error) {
      logger.error("Error fetching service cities:", error as any);
      res.status(500).json({ message: "Failed to fetch service cities" });
    }
  });

  // Allow updating service cities on the non-admin path used by client
  app.put("/api/branches/:id/service-cities", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branches" });
      }
      const { cityIds } = z.object({ cityIds: z.array(z.string()) }).parse(req.body);
      const updated = await storage.setBranchServiceCities(id, cityIds);
      res.json({ cityIds: updated });
    } catch (error) {
      logger.error("Error updating service cities:", error as any);
      res.status(400).json({ message: "Failed to update service cities" });
    }
  });

  // Delivery Items Routes
  // Delivery Packages Routes
  // Payment Methods Routes
  app.get("/api/branches/:id/payment-methods", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const user = req.user as User;
      
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot access other branch payment methods" });
      }
      
      const paymentMethods = await storage.getBranchPaymentMethods(id);
      res.json(paymentMethods);
    } catch (error) {
      logger.error("Error fetching payment methods:", error as any);
      res.status(500).json({ message: "Failed to fetch payment methods" });
    }
  });

  app.put("/api/branches/:id/payment-methods/:paymentMethod", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const { id, paymentMethod } = req.params;
      const { isEnabled, processingFee, minAmount, maxAmount } = req.body;
      const user = req.user as User;
      
      if (user.role !== "super_admin" && user.branchId !== id) {
        return res.status(403).json({ message: "Cannot modify other branch payment methods" });
      }
      
      const method = await storage.updateBranchPaymentMethod(id, paymentMethod as any, {
        isEnabled,
        processingFee,
        minAmount,
        maxAmount,
      });
      res.json(method);
    } catch (error) {
      logger.error("Error updating payment method:", error as any);
      res.status(500).json({ message: "Failed to update payment method" });
    }
  });

  return httpServer;
}
