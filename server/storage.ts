import {
  type ClothingItem, type InsertClothingItem,
  type LaundryService, type InsertLaundryService,
  type Transaction, type InsertTransaction,
  type User, type InsertUser, type UpsertUser, type UserWithBranch,
  type Category, type InsertCategory,
  type Branch, type InsertBranch,
    type Customer,
    type InsertCustomer,
    type CustomerAddress,
    type InsertCustomerAddress,
    type CustomerEngagementPlan,
    type InsertCustomerEngagementPlan,
    type Order, type InsertOrder,
    type OrderPrint,
  type Payment, type InsertPayment,
  type Product, type InsertProduct, type ItemType,
  type Package,
  type InsertPackage,
  type PackageItem,
  type PackageWithItems,
  type CustomerPackage,
  type CustomerPackageWithUsage,
  type LoyaltyHistory, type InsertLoyaltyHistory,
  type Notification, type InsertNotification,
  type SecuritySettings, type InsertSecuritySettings,
  type ItemServicePrice, type InsertItemServicePrice,
  type BulkUploadResult,
    clothingItems,
    laundryServices,
    itemServicePrices,
    transactions,
    users,
    categories,
    branches,
    customers,
    customerAddresses,
    customerEngagementPlans,
    orders,
    orderStatusHistory,
    orderPrints,
    payments,
    products,
    packages,
    packageItems,
    customerPackages,
    customerPackageItems,
    loyaltyHistory,
    notifications,
    securitySettings,
    cities,
    branchServiceCities,
  type City, type InsertCity,
  type OrderLog,
  type OrderTimelineEvent,
  coupons,
  couponUsage,
  couponClothingItems,
  couponServices,
  type Coupon,
  type InsertCoupon,
  type CouponUsage,
  type InsertCouponUsage,
  type CouponClothingItem,
  type InsertCouponClothingItem,
  type CouponService,
  type InsertCouponService,
  type BranchCustomization,
  type BranchCustomizationInsert,
  branchCustomizationTable,
  // Customer dashboard + ads
  customerDashboardSettings,
  branchAds,
  adImpressions,
  adClicks,
  type CustomerDashboardSettings,
  type InsertCustomerDashboardSettings,
  type BranchAd,
  type InsertBranchAd,
  // New customer ordering system types
  type CustomerSession, type InsertCustomerSession,
  type BranchDeliverySettings, type InsertBranchDeliverySettings,
  type BranchDeliveryItem, type InsertBranchDeliveryItem,
  type BranchDeliveryPackage, type InsertBranchDeliveryPackage,
  type BranchPaymentMethod, type InsertBranchPaymentMethod,
  type BranchQRCode, type InsertBranchQRCode,
  type DeliveryOrder, type InsertDeliveryOrder, type DeliveryStatus,
  type CityType, type DeliveryMode, type PaymentMethodType,
  customerSessions, branchDeliverySettings, branchDeliveryItems, branchDeliveryPackages, branchPaymentMethods, branchQRCodes, deliveryOrders,
  driverLocations,
  type DriverLocation,
  expenses, type Expense, type InsertExpense,
  orderStatusEnum,
  deliveryStatusEnum,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import {
  eq,
  sql,
  and,
  inArray,
  desc,
  or,
  ilike,
  ne,
  asc,
  gt,
  gte,
  lte,
  lt,
  isNull,
} from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  CATEGORY_SEEDS,
  mapClothingItemSeeds,
  mapLaundryServiceSeeds,
} from "./seed-data";
import { PRICE_MATRIX } from "./seed-prices";
import { haversineDistance } from "./utils/geolocation";

// Simple UUID v4-ish validator to guard raw SQL string interpolation
function assertUuid(id: string) {
  const re = /^[0-9a-fA-F-]{36}$/; // lenient but blocks quotes/injection chars
  if (!re.test(id)) {
    throw new Error("Invalid UUID format");
  }
}

const ORDER_STATUS_SET = new Set(orderStatusEnum);
const DELIVERY_STATUS_SET = new Set(deliveryStatusEnum);
const SYSTEM_ACTOR = "system";

const VALID_DELIVERY_STATUSES = [
  "pending",
  "dispatched",
  "in_transit",
  "delivered",
] as const;

const PAY_LATER_AGGREGATE = `
  SELECT order_id, SUM(amount) AS amount
  FROM payments
  GROUP BY order_id
`;

export const DEFAULT_CUSTOMER_OUTREACH_RATE_LIMIT_HOURS = 24;

const MS_IN_DAY = 24 * 60 * 60 * 1000;

export type ReportDateRangeFilter = {
  branchId?: string;
  start?: Date;
  end?: Date;
};

function buildOrderDateFilter(alias: string, filter: ReportDateRangeFilter): string {
  const clauses = [`${alias}.is_delivery_request = false`];
  if (filter.branchId) {
    assertUuid(filter.branchId);
    clauses.push(`${alias}.branch_id = '${filter.branchId.replace(/'/g, "''")}'`);
  }
  if (filter.start) {
    clauses.push(`${alias}.created_at >= '${filter.start.toISOString()}'`);
  }
  if (filter.end) {
    clauses.push(`${alias}.created_at <= '${filter.end.toISOString()}'`);
  }
  return `WHERE ${clauses.join(" AND ")}`;
}

const DRIVER_LOCATION_RETENTION_MINUTES = 60 * 24; // keep one day of history
const AVERAGE_DRIVER_SPEED_KMH = 35;

type DriverLocationSnapshot = {
  driverId: string;
  lat: number;
  lng: number;
  timestamp: Date;
};

type DeliveryTrackingSnapshot = {
  distanceKm: number | null;
  etaMinutes: number | null;
  driverLocation: DriverLocationSnapshot | null;
  deliveryLocation: { lat: number; lng: number } | null;
};

const CHURN_RECOMMENDATIONS: Record<
  CustomerChurnTier,
  { action: string; channel: CustomerEngagementChannel; cadenceDays: number }
> = {
  no_orders: {
    action: "Send welcome offer with sign-up incentive",
    channel: "sms",
    cadenceDays: 2,
  },
  new: {
    action: "Share onboarding tips and loyalty enrollment",
    channel: "email",
    cadenceDays: 7,
  },
  steady: {
    action: "Promote seasonal bundle to keep momentum",
    channel: "email",
    cadenceDays: 30,
  },
  loyal: {
    action: "Send VIP appreciation reward",
    channel: "email",
    cadenceDays: 45,
  },
  at_risk: {
    action: "Offer limited-time win-back discount",
    channel: "sms",
    cadenceDays: 7,
  },
  dormant: {
    action: "Schedule personal outreach with renewal incentive",
    channel: "sms",
    cadenceDays: 3,
  },
};

function computeChurnTier(lastOrderDate: string | null, orderCount: number): CustomerChurnTier {
  if (!orderCount) {
    return "no_orders";
  }
  if (!lastOrderDate) {
    return "new";
  }
  const parsed = new Date(lastOrderDate);
  if (Number.isNaN(parsed.getTime())) {
    return "new";
  }
  const diffDays = Math.floor((Date.now() - parsed.getTime()) / MS_IN_DAY);
  if (diffDays <= 30) {
    return orderCount >= 5 ? "loyal" : "new";
  }
  if (diffDays <= 60) {
    return "steady";
  }
  if (diffDays <= 90) {
    return "at_risk";
  }
  return "dormant";
}

function computeSuggestedNextContact(cadenceDays: number): Date | null {
  if (!Number.isFinite(cadenceDays) || cadenceDays <= 0) {
    return null;
  }
  return new Date(Date.now() + cadenceDays * MS_IN_DAY);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

const customerPasswordOtps = new Map<string, { otp: string; expires: Date }>();

export function generateCustomerPasswordOtp(phoneNumber: string) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  customerPasswordOtps.set(phoneNumber, {
    otp,
    expires: new Date(Date.now() + 5 * 60 * 1000),
  });
  return otp;
}

export function verifyCustomerPasswordOtp(phoneNumber: string, otp: string) {
  const record = customerPasswordOtps.get(phoneNumber);
  if (!record || record.otp !== otp || record.expires < new Date()) {
    return false;
  }
  customerPasswordOtps.delete(phoneNumber);
  return true;
}

export interface ParsedRow {
  itemEn: string;
  itemAr?: string;
  normalIron?: number;
  normalWash?: number;
  normalWashIron?: number;
  urgentIron?: number;
  urgentWash?: number;
  urgentWashIron?: number;
  imageUrl?: string;
}

export interface CustomerInsightBreakdown {
  month: string;
  total: number;
  orderCount: number;
}

export interface CustomerInsightServiceBreakdown {
  service: string;
  quantity: number;
  revenue: number;
}

export interface CustomerInsightClothingBreakdown {
  item: string;
  quantity: number;
  revenue: number;
}

export type CustomerChurnTier = "new" | "steady" | "loyal" | "at_risk" | "dormant" | "no_orders";

export type CustomerEngagementChannel = "sms" | "email" | "chat";

export interface CustomerInsight {
  customerId: string;
  branchId: string;
  name: string;
  phoneNumber: string;
  loyaltyPoints: number;
  balanceDue: number;
  totalSpend: number;
  lastOrderDate: string | null;
  orderCount: number;
  averageOrderValue: number;
  churnTier: CustomerChurnTier;
  preferredServices: string[];
  recommendedAction: string | null;
  recommendedChannel: CustomerEngagementChannel | null;
  nextContactAt: string | null;
  lastActionAt: string | null;
  lastActionChannel: CustomerEngagementChannel | null;
  lastOutcome: string | null;
  planSource: "auto" | "manual";
  rateLimitedUntil: string | null;
  suggestedAction: string;
  suggestedChannel: CustomerEngagementChannel;
  suggestedNextContactAt: string | null;
  monthlySpend: CustomerInsightBreakdown[];
  topServices: CustomerInsightServiceBreakdown[];
  topClothing: CustomerInsightClothingBreakdown[];
}

export type CustomerEngagementPlanUpdateInput = Partial<{
  churnTier: CustomerChurnTier;
  preferredServices: string[];
  recommendedAction: string | null;
  recommendedChannel: CustomerEngagementChannel | null;
  nextContactAt: Date | null;
  lastActionAt: Date | null;
  lastActionChannel: CustomerEngagementChannel | null;
  lastOutcome: string | null;
  source: "auto" | "manual";
  rateLimitedUntil: Date | null;
}>;

export interface CustomerInsightOptions {
  branchId?: string;
  limit?: number;
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<UserWithBranch | undefined>;
  getUserByUsername(username: string): Promise<UserWithBranch | undefined>;
  createUser(user: InsertUser): Promise<UserWithBranch>;
  upsertUser(user: UpsertUser): Promise<UserWithBranch>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<UserWithBranch | undefined>;
  updateUserProfile(
    id: string,
    user: Partial<Pick<InsertUser, "firstName" | "lastName" | "email">>,
  ): Promise<UserWithBranch | undefined>;
  updateUserPassword(id: string, password: string): Promise<UserWithBranch | undefined>;
  updateUserBranch(id: string, branchId: string | null): Promise<UserWithBranch | undefined>;
  getUsers(): Promise<UserWithBranch[]>;
  
  // Category operations
  getCategories(userId: string): Promise<Category[]>;
  getCategoriesByType(type: string, userId: string): Promise<Category[]>;
  getCategory(id: string, userId: string): Promise<Category | undefined>;
  createCategory(
    category: Omit<InsertCategory, "userId">,
    userId: string,
  ): Promise<Category>;
  updateCategory(
    id: string,
    category: Partial<Omit<InsertCategory, "userId">>,
    userId: string,
  ): Promise<Category | undefined>;
  deleteCategory(id: string, userId: string): Promise<boolean>;

  // Branch operations
  getBranches(): Promise<(Branch & { serviceCityIds?: string[] })[]>;
  getBranch(id: string): Promise<(Branch & { serviceCityIds?: string[] }) | undefined>;
  getBranchByCode(code: string): Promise<(Branch & { serviceCityIds?: string[] }) | undefined>;
  createBranch(branch: InsertBranch, serviceCityIds?: string[]): Promise<Branch>;
  updateBranch(
    id: string,
    branch: Partial<InsertBranch>,
    serviceCityIds?: string[],
  ): Promise<(Branch & { serviceCityIds?: string[] }) | undefined>;
  setBranchServiceCities(branchId: string, cityIds: string[]): Promise<string[]>;
  getCities(): Promise<City[]>;
  replaceCities(cities: InsertCity[]): Promise<void>;
  deleteBranch(id: string): Promise<boolean>;

  // Products
  getProducts(
    branchId?: string,
    search?: string,
    limit?: number,
    offset?: number,
    itemType?: ItemType,
  ): Promise<{ items: Product[]; total: number }>;
  getProductsByCategory(
    categoryId: string,
    branchId?: string,
    search?: string,
    limit?: number,
    offset?: number,
    itemType?: ItemType,
  ): Promise<{ items: Product[]; total: number }>;
  getProduct(id: string, branchId?: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct & { branchId: string }): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>, branchId: string): Promise<Product | undefined>;
  getProductCategories(branchId: string): Promise<Category[]>;

  // Clothing Items
  getClothingItems(userId: string): Promise<ClothingItem[]>;
  getClothingItemsByCategory(categoryId: string, userId: string): Promise<ClothingItem[]>;
  getClothingItem(id: string, userId: string): Promise<ClothingItem | undefined>;
  createClothingItem(item: InsertClothingItem & { userId: string }): Promise<ClothingItem>;
  updateClothingItem(id: string, item: Partial<InsertClothingItem>, userId: string): Promise<ClothingItem | undefined>;
  deleteClothingItem(id: string, userId: string): Promise<boolean>;

  // Laundry Services
  getLaundryServices(userId: string): Promise<LaundryService[]>;
  getLaundryServicesByCategory(categoryId: string, userId: string): Promise<LaundryService[]>;
  getLaundryService(id: string, userId: string): Promise<LaundryService | undefined>;
  createLaundryService(service: InsertLaundryService & { userId: string }): Promise<LaundryService>;
  updateLaundryService(id: string, service: Partial<InsertLaundryService>, userId: string): Promise<LaundryService | undefined>;
  deleteLaundryService(id: string, userId: string): Promise<boolean>;

  // Item-service prices
  getServicesForClothingItem(
    clothingItemId: string,
    userId: string,
    branchId: string,
    categoryId?: string,
  ): Promise<(LaundryService & { itemPrice: string })[]>;
  createItemServicePrice(data: InsertItemServicePrice): Promise<ItemServicePrice>;
  updateItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    branchId: string,
    price: string,
  ): Promise<ItemServicePrice | undefined>;
  deleteItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    branchId: string,
  ): Promise<boolean>;
  getItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    userId: string,
    branchId: string,
  ): Promise<number | undefined>;

  // Bulk catalog
  getCatalogForExport(userId: string): Promise<ParsedRow[]>;
  bulkUpsertUserCatalog(
    userId: string,
    rows: ParsedRow[],
  ): Promise<BulkUploadResult>;
  bulkUpsertBranchCatalog(branchId: string, rows: ParsedRow[]): Promise<BulkUploadResult>;
  bulkUpsertProducts(branchId: string, products: any[]): Promise<{ created: number; updated: number; errors: string[] }>;
  syncPackagesWithNewItems(branchId: string, newClothingItemIds: string[], newServiceIds: string[]): Promise<void>;
  
  // Transactions
  createTransaction(transaction: InsertTransaction & { branchId: string }): Promise<Transaction>;
  getTransactions(
    branchId?: string,
    start?: Date,
    end?: Date,
    limit?: number,
    offset?: number
  ): Promise<Transaction[]>;
  getTransaction(id: string, branchId?: string): Promise<Transaction | undefined>;

  // Packages
  getPackages(branchId: string): Promise<PackageWithItems[]>;
  getPackage(id: string, branchId: string): Promise<PackageWithItems | undefined>;
  createPackage(pkg: InsertPackage): Promise<PackageWithItems>;
  updatePackage(
    id: string,
    pkg: Partial<InsertPackage>,
    branchId: string,
  ): Promise<PackageWithItems | undefined>;
  deletePackage(id: string, branchId: string): Promise<boolean>;
  getCustomerPackagesWithUsage(customerId: string): Promise<CustomerPackageWithUsage[]>;
  assignPackageToCustomer(
    packageId: string,
    customerId: string,
    balance: number,
    startsAt: Date,
    expiresAt: Date | null,
  ): Promise<CustomerPackage>;
  updateCustomerPackageBalance(
    customerPackageId: string,
    change: number,
    serviceId?: string,
    clothingItemId?: string,
  ): Promise<CustomerPackage | undefined>;

  // Customers
  getCustomers(
    search?: string,
    includeInactive?: boolean,
    branchId?: string,
    limit?: number,
    offset?: number,
  ): Promise<{ items: Customer[]; total: number }>;
  getCustomersByIds(ids: string[], branchId?: string): Promise<Customer[]>;
  getCustomer(id: string, branchId?: string): Promise<Customer | undefined>;
  getCustomerByPhone(phoneNumber: string, branchId?: string): Promise<Customer | undefined>;
  getCustomerByNickname(nickname: string, branchId?: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer, branchId: string): Promise<Customer>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>, branchId?: string): Promise<Customer | undefined>;
  updateCustomerPassword(id: string, passwordHash: string): Promise<Customer | undefined>;
  deleteCustomer(id: string, branchId?: string): Promise<boolean>;
  updateCustomerBalance(id: string, balanceChange: number, branchId?: string): Promise<Customer | undefined>;

  // Coupons
  getCoupons(branchId?: string): Promise<Coupon[]>;
  getCoupon(id: string, branchId?: string): Promise<Coupon | undefined>;
  getCouponByCode(code: string, branchId?: string): Promise<Coupon | undefined>;
  createCoupon(coupon: InsertCoupon, branchId: string, createdBy: string, clothingItemIds?: string[], serviceIds?: string[]): Promise<Coupon>;
  updateCoupon(id: string, coupon: Partial<InsertCoupon>, branchId?: string, clothingItemIds?: string[], serviceIds?: string[]): Promise<Coupon | undefined>;
  deleteCoupon(id: string, branchId?: string): Promise<boolean>;
  applyCoupon(couponId: string, discountApplied: number, orderId?: string, customerId?: string): Promise<CouponUsage>;
  validateCoupon(code: string, branchId: string, cartItems: any[]): Promise<{ valid: boolean; coupon?: Coupon; discount?: number; message?: string; applicableItems?: any[] }>;
  getCouponClothingItems(couponId: string): Promise<CouponClothingItem[]>;
  getCouponServices(couponId: string): Promise<CouponService[]>;

  // Branch customization methods
  getBranchCustomization(branchId: string): Promise<BranchCustomization | null>;
  updateBranchCustomization(branchId: string, customization: Partial<BranchCustomizationInsert>): Promise<BranchCustomization>;
  createBranchCustomization(customization: BranchCustomizationInsert): Promise<BranchCustomization>;

  // Order status management
  updateOrderStatus(
    orderId: string,
    status: string,
    options?: { actor?: string; notes?: string },
  ): Promise<Order | undefined>;
  getOrdersByBranch(branchId: string, options?: { status?: string; limit?: number }): Promise<Order[]>;

  // Customer addresses
  getCustomerAddresses(customerId: string): Promise<CustomerAddress[]>;
  getCustomerInsights(options?: CustomerInsightOptions): Promise<CustomerInsight[]>;
  getCustomerEngagementPlan(customerId: string): Promise<CustomerEngagementPlan | undefined>;
  updateCustomerEngagementPlan(
    customerId: string,
    updates: CustomerEngagementPlanUpdateInput,
    branchId?: string,
  ): Promise<CustomerEngagementPlan | undefined>;
  createCustomerAddress(address: InsertCustomerAddress): Promise<CustomerAddress>;
  updateCustomerAddress(
    id: string,
    address: Partial<InsertCustomerAddress>,
    customerId: string,
  ): Promise<CustomerAddress | undefined>;
  deleteCustomerAddress(id: string, customerId: string): Promise<boolean>;

  // Orders
  getOrders(
    branchId?: string,
    sortBy?: "createdAt" | "balanceDue",
    sortOrder?: "asc" | "desc",
  ): Promise<(Order & { customerNickname: string | null; balanceDue: string | null })[]>;
  getOrder(id: string, branchId?: string): Promise<Order | undefined>;
  getOrdersByCustomer(
    customerId: string,
    branchId?: string,
  ): Promise<(Order & { paid: string; remaining: string })[]>;
  getOrdersByStatus(
    status: string,
    branchId?: string,
    sortBy?: "createdAt" | "balanceDue",
    sortOrder?: "asc" | "desc",
  ): Promise<(Order & { customerNickname: string | null; balanceDue: string | null })[]>;
  createOrder(order: InsertOrder & { branchId: string }): Promise<Order>;
  updateOrder(id: string, order: Partial<Omit<Order, 'id' | 'orderNumber' | 'createdAt'>>): Promise<Order | undefined>;
  getDeliveryOrderRequests(branchId?: string): Promise<(Order & { delivery: DeliveryOrder })[]>;
  acceptDeliveryOrderRequest(id: string, actor?: string): Promise<Order | undefined>;

  // Delivery orders
  getDeliveryOrders(branchId?: string, status?: DeliveryStatus): Promise<(DeliveryOrder & { order: Order })[]>;
  getDeliveryOrdersByDriver(driverId: string, branchId?: string): Promise<(DeliveryOrder & { order: Order })[]>;
  assignDeliveryOrder(orderId: string, driverId: string): Promise<(DeliveryOrder & { order: Order }) | undefined>;
  getDeliveryOrdersByStatus(status: string, branchId?: string): Promise<(DeliveryOrder & { order: Order })[]>;
  updateDeliveryStatus(
    orderId: string,
    status: DeliveryStatus,
    actor?: string,
  ): Promise<(DeliveryOrder & { order: Order }) | undefined>;

  updateDriverLocation(driverId: string, lat: number, lng: number): Promise<DriverLocationSnapshot>;
  getLatestDriverLocations(driverIds?: string[]): Promise<DriverLocationSnapshot[]>;
  getLatestDriverLocation(driverId: string): Promise<DriverLocationSnapshot | undefined>;
  getDriverLocationHistory(
    driverId: string,
    options?: { limit?: number; sinceMinutes?: number },
  ): Promise<DriverLocationSnapshot[]>;
  getDeliveryTrackingSnapshot(orderId: string): Promise<DeliveryTrackingSnapshot | null>;

    // Order print history
    recordOrderPrint(orderId: string, printedBy: string): Promise<OrderPrint>;
  getOrderPrintHistory(orderId: string): Promise<OrderPrint[]>;

  // Payments
  getPayments(branchId?: string): Promise<Payment[]>;
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentsByCustomer(customerId: string, branchId?: string): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;

  // Order logs
  getOrderLogs(status?: string): Promise<OrderLog[]>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;

  // Security settings
  getSecuritySettings(): Promise<SecuritySettings | undefined>;
  updateSecuritySettings(settings: InsertSecuritySettings): Promise<SecuritySettings>;

  // Loyalty history
  getLoyaltyHistory(customerId: string): Promise<LoyaltyHistory[]>;
  createLoyaltyHistory(entry: InsertLoyaltyHistory): Promise<LoyaltyHistory>;

  // Reports
  getOrderStats(range: string, branchId?: string): Promise<{ period: string; count: number; revenue: number }[]>;
  getTopServices(range: string, branchId?: string): Promise<{ service: string; count: number; revenue: number }[]>;
  getTopProducts(range: string, branchId?: string): Promise<{ product: string; count: number; revenue: number }[]>;
  getTopPackages(range: string, branchId?: string): Promise<{ pkg: string; count: number; revenue: number }[]>;
  getServiceBreakdown(filter: ReportDateRangeFilter): Promise<{ service: string; count: number; revenue: number }[]>;
  getClothingBreakdown(filter: ReportDateRangeFilter): Promise<{ item: string; count: number; revenue: number }[]>;
  getPaymentMethodBreakdown(filter: ReportDateRangeFilter): Promise<{ method: string; count: number; revenue: number }[]>;
  getRevenueSummaryByDateRange(filter: ReportDateRangeFilter): Promise<{
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    daily: { date: string; orders: number; revenue: number }[];
  }>;
  getClothingItemStats(
    range: string,
    branchId?: string,
    limit?: number,
  ): Promise<{ item: string; count: number; revenue: number }[]>;
  getSalesSummary(range: string, branchId?: string): Promise<{
    totalOrders: number;
    totalRevenue: number;
    stats: { period: string; count: number; revenue: number }[];
  }>;

  // Customer Sessions (for mobile app authentication)
  createCustomerSession(session: InsertCustomerSession): Promise<CustomerSession>;
  getCustomerSession(sid: string): Promise<CustomerSession | undefined>;
  updateCustomerSession(sid: string, data: any): Promise<CustomerSession | undefined>;
  deleteCustomerSession(sid: string): Promise<boolean>;
  cleanupExpiredCustomerSessions(): Promise<number>;

  // Branch Delivery Settings
  getBranchDeliverySettings(branchId: string): Promise<BranchDeliverySettings | undefined>;
  createBranchDeliverySettings(settings: InsertBranchDeliverySettings): Promise<BranchDeliverySettings>;
  updateBranchDeliverySettings(branchId: string, settings: Partial<InsertBranchDeliverySettings>): Promise<BranchDeliverySettings | undefined>;
  deleteBranchDeliverySettings(branchId: string): Promise<boolean>;

  // Branch Delivery Items
  getBranchDeliveryItems(branchId: string): Promise<BranchDeliveryItem[]>;
  getBranchDeliveryItem(branchId: string, clothingItemId: string, serviceId: string): Promise<BranchDeliveryItem | undefined>;
  createBranchDeliveryItem(item: InsertBranchDeliveryItem): Promise<BranchDeliveryItem>;
  updateBranchDeliveryItem(branchId: string, clothingItemId: string, serviceId: string, updates: Partial<InsertBranchDeliveryItem>): Promise<BranchDeliveryItem | undefined>;
  deleteBranchDeliveryItem(branchId: string, clothingItemId: string, serviceId: string): Promise<boolean>;
  setBranchDeliveryItems(branchId: string, items: InsertBranchDeliveryItem[]): Promise<BranchDeliveryItem[]>;

  // Branch Delivery Packages
  getBranchDeliveryPackages(branchId: string): Promise<BranchDeliveryPackage[]>;
  getBranchDeliveryPackage(branchId: string, packageId: string): Promise<BranchDeliveryPackage | undefined>;
  createBranchDeliveryPackage(pkg: InsertBranchDeliveryPackage): Promise<BranchDeliveryPackage>;
  updateBranchDeliveryPackage(branchId: string, packageId: string, updates: Partial<InsertBranchDeliveryPackage>): Promise<BranchDeliveryPackage | undefined>;
  deleteBranchDeliveryPackage(branchId: string, packageId: string): Promise<boolean>;
  setBranchDeliveryPackages(branchId: string, packages: InsertBranchDeliveryPackage[]): Promise<BranchDeliveryPackage[]>;

  // Branch Payment Methods
  getBranchPaymentMethods(branchId: string): Promise<BranchPaymentMethod[]>;
  getBranchPaymentMethod(branchId: string, paymentMethod: PaymentMethodType): Promise<BranchPaymentMethod | undefined>;
  createBranchPaymentMethod(method: InsertBranchPaymentMethod): Promise<BranchPaymentMethod>;
  updateBranchPaymentMethod(branchId: string, paymentMethod: PaymentMethodType, updates: Partial<InsertBranchPaymentMethod>): Promise<BranchPaymentMethod | undefined>;
  deleteBranchPaymentMethod(branchId: string, paymentMethod: PaymentMethodType): Promise<boolean>;
  setBranchPaymentMethods(branchId: string, methods: InsertBranchPaymentMethod[]): Promise<BranchPaymentMethod[]>;

  // Branch QR Codes
  getBranchQRCodes(branchId: string): Promise<BranchQRCode[]>;
  getActiveBranchQRCode(branchId: string): Promise<BranchQRCode | undefined>;
  getBranchQRCodeByCode(qrCode: string): Promise<BranchQRCode | undefined>;
  createBranchQRCode(qr: InsertBranchQRCode): Promise<BranchQRCode>;
  deactivateBranchQRCode(id: string, deactivatedBy: string): Promise<BranchQRCode | undefined>;
  regenerateBranchQRCode(branchId: string, createdBy: string): Promise<BranchQRCode>;

  // Enhanced City Management
  getCitiesByType(type: CityType): Promise<City[]>;
  getCityHierarchy(): Promise<(City & { children?: City[] })[]>;
  updateCityHierarchy(cities: InsertCity[]): Promise<City[]>;

  // Enhanced Delivery Orders (extending existing delivery order methods)
  createDeliveryOrder(deliveryOrder: InsertDeliveryOrder): Promise<DeliveryOrder>;
  updateDeliveryOrder(id: string, updates: Partial<InsertDeliveryOrder>): Promise<DeliveryOrder | undefined>;
  getDeliveryOrdersByCustomer(customerId: string, branchId?: string): Promise<(DeliveryOrder & { order: Order })[]>;

  // Customer dashboard settings and ads
  getCustomerDashboardSettings(branchId: string): Promise<CustomerDashboardSettings | undefined>;
  updateCustomerDashboardSettings(branchId: string, settings: Partial<InsertCustomerDashboardSettings>): Promise<CustomerDashboardSettings>;
  getBranchAds(branchId: string): Promise<BranchAd[]>;
  createBranchAd(ad: InsertBranchAd): Promise<BranchAd>;
  updateBranchAd(id: string, ad: Partial<InsertBranchAd>): Promise<BranchAd | undefined>;
  deleteBranchAd(id: string, branchId?: string): Promise<boolean>;
  getActiveAds(branchId: string): Promise<BranchAd[]>;
  recordAdImpression(data: any): Promise<void>;
  recordAdClick(data: any): Promise<void>;

  // Expenses
  getExpenses(branchId?: string, start?: Date, end?: Date, search?: string, limit?: number, offset?: number): Promise<Expense[]>;
  createExpense(expense: Omit<InsertExpense, "branchId" | "createdBy"> & { branchId?: string }, createdBy: string, branchId: string): Promise<Expense>;
  getExpenseSummary(range?: string, branchId?: string): Promise<{ byMonth: { month: string; total: number }[]; byCategory: { category: string; total: number }[] }>;
  updateExpense(id: string, updates: Partial<InsertExpense>, branchId?: string): Promise<Expense | undefined>;
  deleteExpense(id: string, branchId?: string): Promise<boolean>;
}

export class MemStorage {
  private products: Map<string, Product>;
  private clothingItems: Map<string, ClothingItem>;
  private laundryServices: Map<string, LaundryService>;
  private itemServicePrices: Map<string, Map<string, ItemServicePrice>>;
  private transactions: Map<string, Transaction>;
  private users: Map<string, User>;
  private categories: Map<string, Category>;
  private branches: Map<string, Branch>;
  private branchServiceCities: Map<string, string[]>;
  private cities: Map<string, City>;
  private packages: Map<string, Package>;
  private packageItems: Map<string, PackageItem[]>;
  private customerPackages: Map<string, CustomerPackage>;
  private customerPackageItems: Map<
    string,
    {
      serviceId: string;
      clothingItemId: string;
      balance: number;
      totalCredits: number;
    }[]
  >;
  private loyaltyHistory: LoyaltyHistory[];
  private notifications: Notification[];
  private orderPrints: OrderPrint[];
  private securitySettings: SecuritySettings;

  constructor() {
    this.products = new Map();
    this.clothingItems = new Map();
    this.laundryServices = new Map();
    this.itemServicePrices = new Map();
    this.transactions = new Map();
    this.users = new Map();
    this.categories = new Map();
    this.branches = new Map();
    this.branchServiceCities = new Map();
    this.cities = new Map();
    this.packages = new Map();
    this.packageItems = new Map();
    this.customerPackages = new Map();
    this.customerPackageItems = new Map();
    this.loyaltyHistory = [];
    this.notifications = [];
    this.orderPrints = [];
    this.securitySettings = {
      id: "default",
      sessionTimeout: 15,
      twoFactorRequired: false,
      passwordPolicy: "",
      updatedAt: new Date(),
    };
    this.initializeData();
  }

  private initializeData() {
    // Initialize products
    const initialProducts: InsertProduct[] = [
      {
        name: "Cola",
        description: "Refreshing soda drink",
        categoryId: "beverages",
        price: "1.99",
        stock: 50,
        imageUrl: "https://images.unsplash.com/photo-1580910051074-7bc38a51a79f?auto=format&fit=crop&w=300&h=200",
        itemType: "everyday",
      },
      {
        name: "Potato Chips",
        description: "Crispy salted chips",
        categoryId: "snacks",
        price: "2.49",
        stock: 40,
        imageUrl: "https://images.unsplash.com/photo-1585238342029-5a9b9e8e7044?auto=format&fit=crop&w=300&h=200",
        itemType: "everyday",
      },
      {
        name: "Wireless Earbuds",
        description: "Bluetooth in-ear headphones",
        categoryId: "electronics",
        price: "59.99",
        stock: 25,
        imageUrl: "https://images.unsplash.com/photo-1585386959984-a41552231685?auto=format&fit=crop&w=300&h=200",
        itemType: "everyday",
      },
      {
        name: "Instant Noodles",
        description: "Quick and tasty meal",
        categoryId: "food",
        price: "0.99",
        stock: 80,
        imageUrl: "https://images.unsplash.com/photo-1617196033361-c2d0cf79ab8f?auto=format&fit=crop&w=300&h=200",
        itemType: "everyday",
      },
      {
        name: "Dish Soap",
        description: "Lemon scented detergent",
        categoryId: "household",
        price: "3.49",
        stock: 60,
        imageUrl: "https://images.unsplash.com/photo-1602161414263-5a8d5449475a?auto=format&fit=crop&w=300&h=200",
        itemType: "everyday",
      }
    ];

    initialProducts.forEach(product => {
      this.createProduct({ ...product, branchId: "default" });
    });

    // Initialize clothing items
    const initialClothingItems: InsertClothingItem[] = [
      {
        name: "Pants",
        description: "Regular trousers",
        categoryId: "pants",
        imageUrl: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
      },
      {
        name: "Dishdasha",
        description: "Traditional long robe",
        categoryId: "traditional",
        imageUrl: "https://images.unsplash.com/photo-1594069037019-f3ab4b0e6a21?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
      },
      {
        name: "Shirt",
        description: "Dress shirt or casual shirt",
        categoryId: "shirts",
        imageUrl: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
      },
      {
        name: "Dress",
        description: "Ladies dress",
        categoryId: "dresses",
        imageUrl: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
      },
      {
        name: "Suit Jacket",
        description: "Formal jacket",
        categoryId: "formal",
        imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
      },
      {
        name: "Bed Sheets",
        description: "Full set of bed linens",
        categoryId: "linens",
        imageUrl: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&h=200"
      }
    ];

    // Initialize laundry services
    const initialLaundryServices: InsertLaundryService[] = [
      {
        name: "Wash & Fold",
        description: "Basic washing and folding service",
        price: "3.00",
        categoryId: "basic"
      },
      {
        name: "Dry Cleaning",
        description: "Professional dry cleaning",
        price: "8.00",
        categoryId: "premium"
      },
      {
        name: "Iron & Press",
        description: "Professional ironing and pressing",
        price: "4.50",
        categoryId: "basic"
      },
      {
        name: "Stain Removal",
        description: "Specialized stain treatment",
        price: "6.00",
        categoryId: "specialty"
      },
      {
        name: "Express Service",
        description: "Same day service",
        price: "12.00",
        categoryId: "express"
      },
      {
        name: "Delicate Care",
        description: "Special care for delicate items",
        price: "10.00",
        categoryId: "specialty"
      }
    ];

    const defaultUser = "mem-user";
    initialClothingItems.forEach(item => {
      this.createClothingItem({ ...item, userId: defaultUser });
    });

    initialLaundryServices.forEach(service => {
      this.createLaundryService({ ...service, userId: defaultUser });
    });
  }

  // Product methods
  async getProducts(
    branchId?: string,
    search?: string,
    limit?: number,
    offset?: number,
    itemType?: ItemType,
  ): Promise<{ items: Product[]; total: number }> {
    let items = Array.from(this.products.values()).filter(
      p => (!branchId || p.branchId === branchId) && (!itemType || p.itemType === itemType),
    );
    if (search) {
      const term = search.toLowerCase();
      items = items.filter(
        p =>
          p.name.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term),
      );
    }
    const total = items.length;
    const start = offset ?? 0;
    const end = limit != null ? start + limit : undefined;
    items = items.slice(start, end);
    return { items, total };
  }

  async getProductsByCategory(
    categoryId: string,
    branchId?: string,
    search?: string,
    limit?: number,
    offset?: number,
    itemType?: ItemType,
  ): Promise<{ items: Product[]; total: number }> {
    if (categoryId === "all") {
      return this.getProducts(branchId, search, limit, offset, itemType);
    }
    let items = Array.from(this.products.values()).filter(product => {
      if (product.categoryId !== categoryId) return false;
      if (branchId && product.branchId !== branchId) return false;
      if (itemType && product.itemType !== itemType) return false;
      return true;
    });
    if (search) {
      const term = search.toLowerCase();
      items = items.filter(
        p =>
          p.name.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term),
      );
    }
    const total = items.length;
    const start = offset ?? 0;
    const end = limit != null ? start + limit : undefined;
    items = items.slice(start, end);
    return { items, total };
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async createProduct(product: InsertProduct & { branchId: string }): Promise<Product> {
    const id = randomUUID();
    const newProduct: Product = {
      publicId: 0 as any,
      id,
      name: product.name,
      description: product.description || null,
      categoryId: product.categoryId || null,
      price: product.price,
      stock: product.stock ?? 0,
      imageUrl: product.imageUrl || null,
      clothingItemId: product.clothingItemId || null,
      branchId: product.branchId,
      itemType: product.itemType ?? "everyday",
    };
    this.products.set(id, newProduct);
    return newProduct;
  }

  async updateProduct(
    id: string,
    product: Partial<InsertProduct>,
    branchId: string,
  ): Promise<Product | undefined> {
    const existing = this.products.get(id);
    if (!existing || existing.branchId !== branchId) return undefined;

    const updated: Product = {
      ...existing,
      name: product.name ?? existing.name,
      description: product.description ?? existing.description,
      categoryId: product.categoryId ?? existing.categoryId,
      price: product.price ?? existing.price,
      stock: product.stock ?? existing.stock,
      imageUrl: product.imageUrl ?? existing.imageUrl,
      clothingItemId:
        product.clothingItemId !== undefined
          ? product.clothingItemId || null
          : existing.clothingItemId,
      branchId: existing.branchId,
      itemType: product.itemType ?? existing.itemType,
    };
    this.products.set(id, updated);
    return updated;
  }

  async getProductCategories(branchId: string): Promise<Category[]> {
    const ids = new Set<string>();
    for (const product of this.products.values()) {
      if (product.branchId === branchId && product.categoryId) {
        ids.add(product.categoryId);
      }
    }
    return Array.from(ids)
      .map((id) => this.categories.get(id))
      .filter((c): c is Category => Boolean(c));
  }

  // Clothing Items methods
  async getClothingItems(): Promise<ClothingItem[]> {
    return Array.from(this.clothingItems.values());
  }

  async getClothingItemsByCategory(categoryId: string): Promise<ClothingItem[]> {
    if (categoryId === "all") {
      return this.getClothingItems();
    }
    return Array.from(this.clothingItems.values()).filter(item => item.categoryId === categoryId);
  }

  async getClothingItem(id: string): Promise<ClothingItem | undefined> {
    return this.clothingItems.get(id);
  }

  async createClothingItem(item: InsertClothingItem & { userId: string }): Promise<ClothingItem> {
    const id = randomUUID();
    const newItem: ClothingItem = {
      publicId: 0 as any,
      id,
      name: item.name,
      nameAr: (item as any).nameAr ?? null,
      description: item.description || null,
      descriptionAr: (item as any).descriptionAr ?? null,
      categoryId: item.categoryId,
      imageUrl: item.imageUrl || null,
      userId: item.userId,
      branchId: null as any,
    };
    this.clothingItems.set(id, newItem);

    // Initialize item-service prices with default values for all existing services
    const map = new Map<string, ItemServicePrice>();
    for (const service of Array.from(this.laundryServices.values())) {
      map.set(service.id, {
        clothingItemId: id,
        branchId: "default",
        serviceId: service.id,
        price: "0.00",
      });
    }
    if (map.size > 0) {
      this.itemServicePrices.set(`${id}:default`, map);
    }

    return newItem;
  }

  async updateClothingItem(id: string, item: Partial<InsertClothingItem>): Promise<ClothingItem | undefined> {
    const existing = this.clothingItems.get(id);
    if (!existing) return undefined;

    const updated: ClothingItem = {
      ...existing,
      name: item.name ?? existing.name,
      description: item.description ?? existing.description,
      categoryId: item.categoryId ?? existing.categoryId,
      imageUrl: item.imageUrl ?? existing.imageUrl
    };
    this.clothingItems.set(id, updated);
    return updated;
  }

  async deleteClothingItem(id: string): Promise<boolean> {
    return this.clothingItems.delete(id);
  }

  // Laundry Services methods
  async getLaundryServices(): Promise<LaundryService[]> {
    return Array.from(this.laundryServices.values());
  }

  async getLaundryServicesByCategory(categoryId: string): Promise<LaundryService[]> {
    if (categoryId === "all") {
      return this.getLaundryServices();
    }
    return Array.from(this.laundryServices.values()).filter(service => service.categoryId === categoryId);
  }

  async getLaundryService(id: string): Promise<LaundryService | undefined> {
    return this.laundryServices.get(id);
  }

  async createLaundryService(service: InsertLaundryService & { userId: string }): Promise<LaundryService> {
    const id = randomUUID();
    const newService: LaundryService = {
      publicId: 0 as any,
      id,
      name: service.name,
      nameAr: (service as any).nameAr ?? null,
      description: service.description || null,
      descriptionAr: (service as any).descriptionAr ?? null,
      price: service.price,
      categoryId: service.categoryId,
      userId: service.userId,
      branchId: null as any,
    };
    this.laundryServices.set(id, newService);
    return newService;
  }

  async updateLaundryService(id: string, service: Partial<InsertLaundryService>): Promise<LaundryService | undefined> {
    const existing = this.laundryServices.get(id);
    if (!existing) return undefined;

    const updated: LaundryService = {
      ...existing,
      name: service.name ?? existing.name,
      nameAr: (service as any).nameAr ?? existing.nameAr ?? null,
      description: service.description ?? existing.description,
      descriptionAr: (service as any).descriptionAr ?? existing.descriptionAr ?? null,
      price: service.price ?? existing.price,
      categoryId: service.categoryId ?? existing.categoryId
    };
    this.laundryServices.set(id, updated);
    return updated;
  }

  async deleteLaundryService(id: string): Promise<boolean> {
    return this.laundryServices.delete(id);
  }

  async getServicesForClothingItem(
    clothingItemId: string,
    _userId: string,
    branchId: string,
    categoryId?: string,
  ): Promise<(LaundryService & { itemPrice: string })[]> {
    const serviceMap = this.itemServicePrices.get(`${clothingItemId}:${branchId}`);
    if (!serviceMap || serviceMap.size === 0) return [];
    const services: (LaundryService & { itemPrice: string })[] = [];
    for (const [serviceId, rec] of serviceMap.entries()) {
      const service = this.laundryServices.get(serviceId);
      if (!service) continue;
      if (categoryId && service.categoryId !== categoryId) continue;
      services.push({ ...service, itemPrice: rec.price });
    }
    return services;
  }

  async createItemServicePrice(data: InsertItemServicePrice): Promise<ItemServicePrice> {
    const key = `${data.clothingItemId}:${data.branchId!}`;
    const map = this.itemServicePrices.get(key) ?? new Map();
    const record: ItemServicePrice = {
      ...data,
      branchId: data.branchId!,
      price: data.price.toString(),
    } as ItemServicePrice;
    map.set(data.serviceId, record);
    this.itemServicePrices.set(key, map);
    return record;
  }

  async updateItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    branchId: string,
    price: string,
  ): Promise<ItemServicePrice | undefined> {
    const map = this.itemServicePrices.get(`${clothingItemId}:${branchId}`);
    if (!map) return undefined;
    const existing = map.get(serviceId);
    if (!existing) return undefined;
    const updated = { ...existing, price };
    map.set(serviceId, updated);
    return updated;
  }

  async deleteItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    branchId: string,
  ): Promise<boolean> {
    const map = this.itemServicePrices.get(`${clothingItemId}:${branchId}`);
    if (!map) return false;
    const deleted = map.delete(serviceId);
    if (map.size === 0) this.itemServicePrices.delete(`${clothingItemId}:${branchId}`);
    return deleted;
  }

  async getItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    _userId: string,
    branchId: string,
  ): Promise<number | undefined> {
    const map = this.itemServicePrices.get(`${clothingItemId}:${branchId}`);
    const record = map?.get(serviceId);
    if (record) return parseFloat(record.price);
    const svc = this.laundryServices.get(serviceId);
    return svc ? parseFloat(svc.price) : undefined;
  }

  async getCatalogForExport(userId: string): Promise<ParsedRow[]> {
    const serviceIds: Record<string, string> = {};
    for (const s of this.laundryServices.values()) {
      if (s.userId === userId) serviceIds[s.name] = s.id;
    }
    const rows: ParsedRow[] = [];
    for (const item of this.clothingItems.values()) {
      if (item.userId !== userId) continue;
      const map = this.itemServicePrices.get(`${item.id}:default`);
      const getPrice = (name: string) => {
        const id = serviceIds[name];
        if (!id) return undefined;
        const rec = map?.get(id);
        return rec ? parseFloat(rec.price) : undefined;
      };
      rows.push({
        itemEn: item.name,
        itemAr: undefined,
        normalIron: getPrice("Normal Iron"),
        normalWash: getPrice("Normal Wash"),
        normalWashIron: getPrice("Normal Wash & Iron"),
        urgentIron: getPrice("Urgent Iron"),
        urgentWash: getPrice("Urgent Wash"),
        urgentWashIron: getPrice("Urgent Wash & Iron"),
        imageUrl: item.imageUrl ?? undefined,
      });
    }
    return rows;
  }

  async createTransaction(insertTransaction: InsertTransaction & { branchId: string }): Promise<Transaction> {
    const id = randomUUID();
    const transaction: Transaction = {
      ...insertTransaction,
      orderId: insertTransaction.orderId ?? null,
      id,
      createdAt: new Date()
    };
    this.transactions.set(id, transaction);
    return transaction;
  }

  async getTransactions(
    branchId?: string,
    start?: Date,
    end?: Date,
    limit?: number,
    offset?: number
  ): Promise<Transaction[]> {
    let txs = Array.from(this.transactions.values()).filter(
      (t) => !branchId || t.branchId === branchId
    );
    if (start) {
      txs = txs.filter((t) => new Date(t.createdAt) >= start);
    }
    if (end) {
      txs = txs.filter((t) => new Date(t.createdAt) <= end);
    }
    txs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (typeof offset === "number") {
      txs = txs.slice(offset);
    }
    if (typeof limit === "number") {
      txs = txs.slice(0, limit);
    }
    return txs;
  }

  async getTransaction(id: string, branchId?: string): Promise<Transaction | undefined> {
    const tx = this.transactions.get(id);
    if (!tx) return undefined;
    if (branchId && tx.branchId !== branchId) return undefined;
    return tx;
  }

  async getPackages(branchId: string): Promise<PackageWithItems[]> {
    return Array.from(this.packages.values())
      .filter((p) => p.branchId === branchId)
      .map((p) => ({
        ...p,
        packageItems: this.packageItems.get(p.id) || [],
      }));
  }

  async getPackage(
    id: string,
    branchId: string,
  ): Promise<PackageWithItems | undefined> {
    const pkg = this.packages.get(id);
    if (!pkg || pkg.branchId !== branchId) return undefined;
    return { ...pkg, packageItems: this.packageItems.get(id) || [] };
  }

  async createPackage(pkg: InsertPackage): Promise<PackageWithItems> {
    const { packageItems, ...data } = pkg;
    const id = randomUUID();
    const now = new Date();
    const newPkg: Package = {
      publicId: 0 as any,
      id,
      nameEn: data.nameEn,
      nameAr: data.nameAr ?? null,
      descriptionEn: data.descriptionEn ?? null,
      descriptionAr: data.descriptionAr ?? null,
      price: data.price,
      maxItems: data.maxItems ?? null,
      expiryDays: data.expiryDays ?? null,
      bonusCredits: data.bonusCredits ?? null,
      branchId: data.branchId,
      createdAt: now,
      updatedAt: now,
    };
    this.packages.set(id, newPkg);
    let items: PackageItem[] = [];
    if (packageItems && packageItems.length > 0) {
      items = packageItems.map((pi) => ({
        id: randomUUID(),
        packageId: id,
        clothingItemId: pi.clothingItemId,
        categoryId: pi.categoryId ?? null,
        serviceId: pi.serviceId,
        credits: pi.credits,
        paidCredits: pi.paidCredits ?? 0,
      }));
      this.packageItems.set(id, items);
    } else {
      this.packageItems.set(id, []);
    }
    return { ...newPkg, packageItems: items };
  }

  async updatePackage(
    id: string,
    pkg: Partial<InsertPackage>,
    branchId: string,
  ): Promise<PackageWithItems | undefined> {
    const existing = this.packages.get(id);
    if (!existing || existing.branchId !== branchId) return undefined;
    const { packageItems: items, branchId: _b, ...data } = pkg as any;
    const updated: Package = {
      ...existing,
      ...data,
      nameAr: data.nameAr ?? existing.nameAr,
      descriptionEn: data.descriptionEn ?? existing.descriptionEn,
      descriptionAr: data.descriptionAr ?? existing.descriptionAr,
      maxItems: data.maxItems ?? existing.maxItems,
      expiryDays: data.expiryDays ?? existing.expiryDays,
      bonusCredits: data.bonusCredits ?? existing.bonusCredits,
      updatedAt: new Date(),
    };
    this.packages.set(id, updated);
      if (items) {
        const mapped = items.map((pi: any) => ({
          id: randomUUID(),
          packageId: id,
          clothingItemId: pi.clothingItemId,
          categoryId: pi.categoryId ?? null,
          serviceId: pi.serviceId,
          credits: pi.credits,
          paidCredits: pi.paidCredits ?? 0,
        }));
        this.packageItems.set(id, mapped);
      }
    return { ...updated, packageItems: this.packageItems.get(id) || [] };
  }

  async deletePackage(id: string, branchId: string): Promise<boolean> {
    const existing = this.packages.get(id);
    if (!existing || existing.branchId !== branchId) return false;
    this.packageItems.delete(id);
    return this.packages.delete(id);
  }

  async assignPackageToCustomer(
    packageId: string,
    customerId: string,
    _balance: number,
    startsAt: Date,
    expiresAt: Date | null,
  ): Promise<CustomerPackage> {
    const items = this.packageItems.get(packageId) || [];
    const totalBalance = items.reduce((sum, i) => sum + i.credits, 0);
    const record: CustomerPackage = {
      id: randomUUID(),
      packageId,
      customerId,
      balance: totalBalance,
      startsAt,
      expiresAt: expiresAt ?? null,
      createdAt: new Date(),
    } as CustomerPackage;
    this.customerPackages.set(record.id, record);
    this.customerPackageItems.set(
      record.id,
      items.map((i) => ({
        serviceId: i.serviceId!,
        clothingItemId: i.clothingItemId!,
        balance: i.credits,
        totalCredits: i.credits,
      })),
    );
    return record;
  }

  async updateCustomerPackageBalance(
    customerPackageId: string,
    change: number,
    serviceId?: string,
    clothingItemId?: string,
  ): Promise<CustomerPackage | undefined> {
    const cp = this.customerPackages.get(customerPackageId);
    if (!cp) return undefined;
    cp.balance += change;
    this.customerPackages.set(customerPackageId, cp);
    if (serviceId) {
      const items = this.customerPackageItems.get(customerPackageId) || [];
      const item = items.find(
        (i) => i.serviceId === serviceId && i.clothingItemId === clothingItemId,
      );
      if (item) {
        item.balance += change;
      }
      this.customerPackageItems.set(customerPackageId, items);
    }
    return cp;
  }

  async getCustomerPackagesWithUsage(customerId: string): Promise<CustomerPackageWithUsage[]> {
    const result: {
      id: string;
      packageId: string;
      nameEn: string;
      nameAr: string | null;
      balance: number;
      totalCredits: number;
      items?: {
        serviceId: string;
        serviceName?: string;
        clothingItemId: string;
        clothingItemName?: string;
        balance: number;
        totalCredits: number;
      }[];
      startsAt: Date;
      expiresAt: Date | null;
    }[] = [];
    for (const cp of this.customerPackages.values()) {
      if (cp.customerId === customerId) {
        const pkg = this.packages.get(cp.packageId);
        const pkgItemsRaw = this.customerPackageItems.get(cp.id) || [];
        const pkgItems = pkgItemsRaw.map((i) => {
          const svc = this.laundryServices.get(i.serviceId);
          const cli = this.clothingItems.get(i.clothingItemId);
          return {
            serviceId: i.serviceId,
            serviceName: svc?.name,
            serviceNameAr: (svc as any)?.nameAr,
            clothingItemId: i.clothingItemId,
            clothingItemName: cli?.name,
            clothingItemNameAr: (cli as any)?.nameAr,
            balance: i.balance,
            totalCredits: i.totalCredits,
          };
        });
        const total = pkgItems.reduce((sum, i) => sum + i.totalCredits, 0);
        const balance = pkgItems.length
          ? pkgItems.reduce((sum, i) => sum + i.balance, 0)
          : cp.balance;
        result.push({
          id: cp.id,
          packageId: cp.packageId,
          nameEn: pkg?.nameEn || "",
          nameAr: pkg?.nameAr || null,
          balance,
          totalCredits: total,
          items: pkgItems,
          startsAt: cp.startsAt,
          expiresAt: cp.expiresAt ?? null,
        });
      }
    }
    return result;
  }

  async recordOrderPrint(orderId: string, printedBy: string): Promise<OrderPrint> {
    const next = this.orderPrints.filter(p => p.orderId === orderId).length + 1;
    const record: OrderPrint = {
      branchId: null as any,
      orderId,
      printedAt: new Date(),
      printedBy,
      printNumber: next,
    };
    this.orderPrints.push(record);
    return record;
  }

  async getOrderPrintHistory(orderId: string): Promise<OrderPrint[]> {
    return this.orderPrints.filter(p => p.orderId === orderId);
  }

  async getLoyaltyHistory(customerId: string): Promise<LoyaltyHistory[]> {
    return this.loyaltyHistory.filter(h => h.customerId === customerId);
  }

  async createLoyaltyHistory(entry: InsertLoyaltyHistory): Promise<LoyaltyHistory> {
    const record: LoyaltyHistory = {
      ...entry,
      id: randomUUID(),
      description: entry.description ?? null,
      createdAt: new Date(),
    };
    this.loyaltyHistory.push(record);
    return record;
  }

  async createNotification(entry: InsertNotification): Promise<Notification> {
    const record: Notification = {
      ...entry,
      id: randomUUID(),
      branchId: null as any,
      sentAt: new Date(),
    };
    this.notifications.push(record);
    return record;
  }

  async getSecuritySettings(): Promise<SecuritySettings | undefined> {
    return this.securitySettings;
  }

  async updateSecuritySettings(settings: InsertSecuritySettings): Promise<SecuritySettings> {
    this.securitySettings = {
      ...this.securitySettings,
      ...settings,
      updatedAt: new Date(),
    };
    return this.securitySettings;
  }

  private buildUserWithBranch(user: User | undefined): UserWithBranch | undefined {
    if (!user) return undefined;
    const branch = user.branchId ? this.branches.get(user.branchId) ?? null : null;
    return { ...user, branch };
  }

  // User methods (stub for MemStorage - not used in production)
  async getUser(id: string): Promise<UserWithBranch | undefined> {
    return this.buildUserWithBranch(this.users.get(id));
  }

  async getUserByUsername(username: string): Promise<UserWithBranch | undefined> {
    const user = Array.from(this.users.values()).find(u => u.username === username);
    return this.buildUserWithBranch(user);
  }

  async createUser(user: InsertUser): Promise<UserWithBranch> {
    const exists = Array.from(this.users.values()).some(u => u.username === user.username);
    if (exists) {
      throw new Error("Unique constraint violation: username already exists");
    }
    const id = randomUUID();
    const now = new Date();
    const passwordHash = await bcrypt.hash(user.passwordHash, 10);
    const record: User = {
      publicId: 0 as any,
      id,
      username: user.username,
      email: user.email ?? null,
      passwordHash,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      branchId: user.branchId ?? null as any,
      role: user.role ?? "user",
      isActive: user.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, record);
    return (await this.getUser(id))!;
  }

  async upsertUser(user: UpsertUser): Promise<UserWithBranch> {
    const existing = Array.from(this.users.values()).find(u => u.username === user.username);
    if (existing) {
      const updated: User = {
        ...existing,
        firstName: user.firstName ?? existing.firstName ?? null,
        lastName: user.lastName ?? existing.lastName ?? null,
        email: user.email ?? existing.email ?? null,
        branchId: user.branchId ?? existing.branchId ?? null,
        role: user.role ?? existing.role,
        isActive: user.isActive ?? existing.isActive,
        updatedAt: new Date(),
      };
      if (user.passwordHash !== undefined && user.passwordHash !== existing.passwordHash) {
        updated.passwordHash = user.passwordHash;
      }
      this.users.set(updated.id, updated);
      return (await this.getUser(updated.id))!;
    }
    if (!user.passwordHash) {
      throw new Error("passwordHash must be provided for new users");
    }
    const id = user.id ?? randomUUID();
    const now = new Date();
    const record: User = {
      publicId: 0 as any,
      id,
      username: user.username,
      email: user.email ?? null,
      passwordHash: user.passwordHash,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      branchId: user.branchId ?? null as any,
      role: user.role ?? "user",
      isActive: user.isActive ?? true,
      createdAt: user.createdAt ?? now,
      updatedAt: user.updatedAt ?? now,
    };
    this.users.set(id, record);
    return (await this.getUser(id))!;
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<UserWithBranch | undefined> {
    const existing = this.users.get(id);
    if (!existing) return undefined;
    const updated: User = { ...existing };
    if (user.username && user.username !== existing.username) {
      const duplicate = Array.from(this.users.values()).some(
        u => u.username === user.username && u.id !== id,
      );
      if (duplicate) {
        throw new Error("Unique constraint violation: username already exists");
      }
      updated.username = user.username;
    }
    if (user.passwordHash !== undefined) {
      if (user.passwordHash) {
        updated.passwordHash = await bcrypt.hash(user.passwordHash, 10);
      }
    }
    if (user.email !== undefined) updated.email = user.email ?? null;
    if (user.firstName !== undefined) updated.firstName = user.firstName ?? null;
    if (user.lastName !== undefined) updated.lastName = user.lastName ?? null;
    if (user.branchId !== undefined) updated.branchId = user.branchId ?? null as any;
    if (user.role !== undefined) updated.role = user.role;
    if (user.isActive !== undefined) updated.isActive = user.isActive;
    updated.updatedAt = new Date();
    this.users.set(id, updated);
    return this.buildUserWithBranch(updated);
  }

  async updateUserProfile(
    id: string,
    user: Partial<Pick<InsertUser, "firstName" | "lastName" | "email">>,
  ): Promise<UserWithBranch | undefined> {
    return this.updateUser(id, user as Partial<InsertUser>);
  }

  async updateUserPassword(id: string, password: string): Promise<UserWithBranch | undefined> {
    if (!password) return this.getUser(id);
    return this.updateUser(id, { passwordHash: password });
  }

  async updateUserBranch(id: string, branchId: string | null): Promise<UserWithBranch | undefined> {
    return this.updateUser(id, { branchId: branchId ?? null });
  }

  async getUsers(): Promise<UserWithBranch[]> {
    return Array.from(this.users.values()).map(user => this.buildUserWithBranch(user)!);
  }

  // Category methods (stub for MemStorage - not used in production)
  async getCategories(userId: string): Promise<Category[]> {
    return Array.from(this.categories.values()).filter(c => c.userId === userId);
  }

  async getCategoriesByType(type: string, userId: string): Promise<Category[]> {
    return Array.from(this.categories.values()).filter(
      c => c.userId === userId && c.type === type,
    );
  }

  async getCategory(id: string, userId: string): Promise<Category | undefined> {
    const category = this.categories.get(id);
    if (!category || category.userId !== userId) return undefined;
    return category;
  }

  async createCategory(
    category: Omit<InsertCategory, "userId">,
    userId: string,
  ): Promise<Category> {
    const duplicate = Array.from(this.categories.values()).some(
      c => c.userId === userId && c.name === category.name,
    );
    if (duplicate) {
      throw new Error("Unique constraint violation: category name already exists for user");
    }
    const id = randomUUID();
    const now = new Date();
    const user = this.users.get(userId);
    const record: Category = {
      publicId: 0 as any,
      id,
      name: category.name,
      nameAr: category.nameAr ?? null,
      type: category.type,
      description: category.description ?? null,
      descriptionAr: ("descriptionAr" in category ? category.descriptionAr ?? null : null),
      color: category.color ?? null,
      icon: category.icon ?? null,
      isActive: category.isActive ?? true,
      createdAt: now,
      updatedAt: now,
      userId,
      branchId: user?.branchId ?? null as any,
    };
    this.categories.set(id, record);
    return record;
  }

  async updateCategory(
    id: string,
    category: Partial<Omit<InsertCategory, "userId">>,
    userId: string,
  ): Promise<Category | undefined> {
    const existing = this.categories.get(id);
    if (!existing || existing.userId !== userId) return undefined;
    if (category.name && category.name !== existing.name) {
      const duplicate = Array.from(this.categories.values()).some(
        c => c.userId === userId && c.name === category.name && c.id !== id,
      );
      if (duplicate) {
        throw new Error("Unique constraint violation: category name already exists for user");
      }
      existing.name = category.name;
    }
    if (category.nameAr !== undefined) existing.nameAr = category.nameAr ?? null;
    if (category.type !== undefined) existing.type = category.type;
    if (category.description !== undefined) existing.description = category.description ?? null;
    if ("descriptionAr" in category && category.descriptionAr !== undefined) {
      existing.descriptionAr = category.descriptionAr ?? null;
    }
    if (category.color !== undefined) existing.color = category.color ?? null;
    if (category.icon !== undefined) existing.icon = category.icon ?? null;
    if (category.isActive !== undefined) existing.isActive = category.isActive;
    existing.updatedAt = new Date();
    this.categories.set(id, existing);
    return existing;
  }

  async deleteCategory(id: string, userId: string): Promise<boolean> {
    const existing = this.categories.get(id);
    if (!existing || existing.userId !== userId) return false;
    return this.categories.delete(id);
  }

  // Branch methods (stub for MemStorage - not used in production)
  async getBranches(): Promise<(Branch & { serviceCityIds?: string[] })[]> {
    return Array.from(this.branches.values()).map(branch => ({
      ...branch,
      serviceCityIds: [...(this.branchServiceCities.get(branch.id) ?? [])],
    }));
  }

  async getBranch(id: string): Promise<(Branch & { serviceCityIds?: string[] }) | undefined> {
    const branch = this.branches.get(id);
    if (!branch) return undefined;
    return { ...branch, serviceCityIds: [...(this.branchServiceCities.get(id) ?? [])] };
  }

  async getBranchByCode(code: string): Promise<(Branch & { serviceCityIds?: string[] }) | undefined> {
    const branch = Array.from(this.branches.values()).find(b => b.code === code);
    if (!branch) return undefined;
    return { ...branch, serviceCityIds: [...(this.branchServiceCities.get(branch.id) ?? [])] };
  }

  async createBranch(branch: InsertBranch, serviceCityIds: string[] = []): Promise<Branch> {
    const duplicate = Array.from(this.branches.values()).some(b => b.code === branch.code);
    if (duplicate) {
      throw new Error("Unique constraint violation: branch code already exists");
    }
    const id = randomUUID();
    const record: Branch = {
      publicId: 0 as any,
      id,
      name: branch.name,
      nameAr: branch.nameAr ?? null,
      address: branch.address ?? null,
      addressAr: branch.addressAr ?? null,
      phone: branch.phone ?? null,
      addressInputMode: branch.addressInputMode ?? "mapbox",
      logoUrl: branch.logoUrl ?? null,
      whatsappQrUrl: branch.whatsappQrUrl ?? null,
      tagline: branch.tagline ?? null,
      taglineAr: branch.taglineAr ?? null,
      code: branch.code,
      deliveryEnabled: branch.deliveryEnabled ?? true,
    } as Branch;
    (record as any).nextOrderNumber = (branch as any).nextOrderNumber ?? 1;
    this.branches.set(id, record);
    this.branchServiceCities.set(id, [...serviceCityIds]);
    return record;
  }

  async updateBranch(
    id: string,
    branch: Partial<InsertBranch>,
    serviceCityIds?: string[],
  ): Promise<(Branch & { serviceCityIds?: string[] }) | undefined> {
    const existing = this.branches.get(id);
    if (!existing) return undefined;
    if (branch.code && branch.code !== existing.code) {
      const duplicate = Array.from(this.branches.values()).some(
        b => b.code === branch.code && b.id !== id,
      );
      if (duplicate) {
        throw new Error("Unique constraint violation: branch code already exists");
      }
      existing.code = branch.code;
    }
    if (branch.name !== undefined) existing.name = branch.name;
    if (branch.nameAr !== undefined) existing.nameAr = branch.nameAr ?? null;
    if (branch.address !== undefined) existing.address = branch.address ?? null;
    if (branch.addressAr !== undefined) existing.addressAr = branch.addressAr ?? null;
    if (branch.phone !== undefined) existing.phone = branch.phone ?? null;
    if (branch.addressInputMode !== undefined) existing.addressInputMode = branch.addressInputMode;
    if (branch.logoUrl !== undefined) existing.logoUrl = branch.logoUrl ?? null;
    if (branch.whatsappQrUrl !== undefined) existing.whatsappQrUrl = branch.whatsappQrUrl ?? null;
    if (branch.tagline !== undefined) existing.tagline = branch.tagline ?? null;
    if (branch.taglineAr !== undefined) existing.taglineAr = branch.taglineAr ?? null;
    const nextOrderNumber = (branch as any).nextOrderNumber;
    if (nextOrderNumber !== undefined) (existing as any).nextOrderNumber = nextOrderNumber;
    if (branch.deliveryEnabled !== undefined) existing.deliveryEnabled = branch.deliveryEnabled;
    this.branches.set(id, existing);
    if (serviceCityIds) {
      this.branchServiceCities.set(id, [...serviceCityIds]);
    }
    return { ...existing, serviceCityIds: [...(this.branchServiceCities.get(id) ?? [])] };
  }

  async setBranchServiceCities(branchId: string, cityIds: string[]): Promise<string[]> {
    this.branchServiceCities.set(branchId, [...cityIds]);
    return [...cityIds];
  }

  async getCities(): Promise<City[]> {
    return Array.from(this.cities.values());
  }

  async replaceCities(cities: InsertCity[]): Promise<void> {
    this.cities.clear();
    const now = new Date();
    for (const city of cities) {
      const id = (city as any).id ?? randomUUID();
      const record: City = {
        id,
        nameEn: city.nameEn,
        nameAr: city.nameAr,
        type: city.type ?? "area",
        parentId: city.parentId ?? null,
        isActive: city.isActive ?? true,
        displayOrder: city.displayOrder ?? 0,
        updatedAt: now,
        createdAt: now,
      };
      this.cities.set(id, record);
    }
  }

  async deleteBranch(id: string): Promise<boolean> {
    const deleted = this.branches.delete(id);
    this.branchServiceCities.delete(id);
    for (const user of this.users.values()) {
      if (user.branchId === id) {
        user.branchId = null as any;
      }
    }
    return deleted;
  }
}

export class DatabaseStorage {
  private async withTenant<T>(branchId: string | undefined, fn: (tx: any) => Promise<T>): Promise<T> {
    // Always run in a transaction; set app.branch_id if provided
    return await db.transaction(async (tx) => {
      if (branchId) {
        // Use set_config to support parameter binding in Postgres
        await tx.execute(sql`SELECT set_config('app.branch_id', ${branchId}, true)`);
      }
      return await fn(tx);
    });
  }

  private async recordStatusEvent(
    tx: any,
    orderId: string,
    status: string,
    actor?: string | null,
    occurredAt?: Date | string | null,
  ): Promise<void> {
    const occurredDate =
      occurredAt instanceof Date
        ? occurredAt
        : occurredAt
        ? new Date(occurredAt)
        : new Date();

    await tx.insert(orderStatusHistory).values({
      orderId,
      status,
      actor: actor ?? null,
      occurredAt: occurredDate,
    });
  }
  // User methods
  async getUser(id: string): Promise<UserWithBranch | undefined> {
    const [result] = await db
      .select({ user: users, branch: branches })
      .from(users)
      .leftJoin(branches, eq(users.branchId, branches.id))
      .where(eq(users.id, id));
    if (!result) return undefined;
    return { ...result.user, branch: result.branch };
  }

  async getUserByUsername(username: string): Promise<UserWithBranch | undefined> {
    const [result] = await db
      .select({ user: users, branch: branches })
      .from(users)
      .leftJoin(branches, eq(users.branchId, branches.id))
      .where(eq(users.username, username));
    if (!result) return undefined;
    return { ...result.user, branch: result.branch };
  }

  private async initializeUserCatalog(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ branchId: users.branchId })
        .from(users)
        .where(eq(users.id, userId));
      const branchId = user?.branchId;
      const allCategories = CATEGORY_SEEDS.map((c) => ({ ...c, userId }));
      await tx.insert(categories).values(allCategories).onConflictDoNothing();

      const categoryRows = await tx
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.userId, userId),
            inArray(
              categories.name,
              CATEGORY_SEEDS.map((c) => c.name),
            ),
          ),
        );
      const categoryMap = Object.fromEntries(categoryRows.map((c) => [c.name, c.id]));

      const clothingSeeds = mapClothingItemSeeds(categoryMap).map((i) => ({
        ...i,
        userId,
      }));
      await tx
        .insert(clothingItems)
        .values(clothingSeeds as (InsertClothingItem & { userId: string })[])
        .onConflictDoNothing();

      const serviceSeeds = mapLaundryServiceSeeds(categoryMap).map((s) => ({
        ...s,
        userId,
      }));
      await tx.insert(laundryServices).values(serviceSeeds).onConflictDoNothing();

      const clothingRows = await tx
        .select()
        .from(clothingItems)
        .where(eq(clothingItems.userId, userId));
      const serviceRowsDb = await tx
        .select()
        .from(laundryServices)
        .where(eq(laundryServices.userId, userId));
      const clothingMap = Object.fromEntries(clothingRows.map((c) => [c.name, c.id]));
      const serviceMap = Object.fromEntries(serviceRowsDb.map((s) => [s.name, s.id]));

      // Only create price rows if branchId is available
      if (branchId) {
        const priceRows = PRICE_MATRIX.flatMap((item) =>
          Object.entries(item.prices).map(([serviceName, price]) => ({
            clothingItemId: clothingMap[item.name],
            serviceId: serviceMap[serviceName],
            branchId,
            price: price.toFixed(2),
          })),
        );

        await tx.insert(itemServicePrices).values(priceRows).onConflictDoNothing();
      }
    });
  }

  async createUser(userData: InsertUser): Promise<UserWithBranch> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(userData.passwordHash, saltRounds);

    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        passwordHash: hashedPassword,
      })
      .returning();
    await this.initializeUserCatalog(user.id);
    return (await this.getUser(user.id))!;
  }

  async upsertUser(userData: UpsertUser): Promise<UserWithBranch> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.username,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return (await this.getUser(user.id))!;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<UserWithBranch | undefined> {
    const updateData = { ...userData } as Partial<InsertUser>;

    if ("passwordHash" in updateData) {
      if (typeof updateData.passwordHash !== "string") {
        throw new Error("passwordHash must be a non-empty string");
      }
      if (updateData.passwordHash) {
        const saltRounds = 10;
        updateData.passwordHash = await bcrypt.hash(updateData.passwordHash, saltRounds);
      } else {
        delete updateData.passwordHash;
      }
    }

    const [updated] = await db
      .update(users)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!updated) return undefined;
    return await this.getUser(updated.id);
  }

  async updateUserProfile(
    id: string,
    data: Partial<Pick<InsertUser, "firstName" | "lastName" | "email">>,
  ): Promise<UserWithBranch | undefined> {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!updated) return undefined;
    return await this.getUser(updated.id);
  }

  async updateUserPassword(id: string, password: string): Promise<UserWithBranch | undefined> {
    const hashed = await bcrypt.hash(password, 10);
    const [updated] = await db
      .update(users)
      .set({ passwordHash: hashed, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!updated) return undefined;
    return await this.getUser(updated.id);
  }

  async updateUserBranch(id: string, branchId: string | null): Promise<UserWithBranch | undefined> {
    const [updated] = await db
      .update(users)
      .set({ branchId, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!updated) return undefined;
    return await this.getUser(updated.id);
  }

  async getUsers(): Promise<UserWithBranch[]> {
    const results = await db
      .select({ user: users, branch: branches })
      .from(users)
      .leftJoin(branches, eq(users.branchId, branches.id));
    return results.map((r) => ({ ...r.user, branch: r.branch }));
  }

  // Category methods
  async getCategories(userId: string): Promise<Category[]> {
    return await db.select().from(categories).where(eq(categories.userId, userId));
  }

  async getCategoriesByType(type: string, userId: string): Promise<Category[]> {
    return await db
      .select()
      .from(categories)
      .where(and(eq(categories.type, type), eq(categories.userId, userId)));
  }

  async getCategory(id: string, userId: string): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
    return category || undefined;
  }

  async createCategory(
    categoryData: Omit<InsertCategory, "userId">,
    userId: string,
  ): Promise<Category> {
    const { name, type, description, isActive } = categoryData;
    const [user] = await db.select({ branchId: users.branchId }).from(users).where(eq(users.id, userId));
    const [category] = await db
      .insert(categories)
      .values({ name, type, description, isActive, userId, branchId: user?.branchId || null as any })
      .returning();
    return category;
  }

  async updateCategory(
    id: string,
    categoryData: Partial<Omit<InsertCategory, "userId">>,
    userId: string,
  ): Promise<Category | undefined> {
    const { name, type, description, isActive } = categoryData;
    const [updated] = await db
      .update(categories)
      .set({ name, type, description, isActive, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteCategory(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Branch methods
  async getBranches(): Promise<(Branch & { serviceCityIds?: string[] })[]> {
    const branchList = await db.select().from(branches);
    const cityRows = await db.select().from(branchServiceCities);
    const cityMap: Record<string, string[]> = {};
    for (const row of cityRows) {
      if (!cityMap[row.branchId]) cityMap[row.branchId] = [];
      cityMap[row.branchId].push(row.cityId);
    }
    return branchList.map((b) => ({ ...b, serviceCityIds: cityMap[b.id] || [] }));
  }

  async getBranch(id: string): Promise<(Branch & { serviceCityIds?: string[] }) | undefined> {
    const [branch] = await db.select().from(branches).where(eq(branches.id, id));
    if (!branch) return undefined;
    const cityRows = await db
      .select()
      .from(branchServiceCities)
      .where(eq(branchServiceCities.branchId, id));
    return { ...branch, serviceCityIds: cityRows.map((a) => a.cityId) };
  }

  async getBranchByCode(code: string): Promise<(Branch & { serviceCityIds?: string[] }) | undefined> {
    const [branch] = await db.select().from(branches).where(eq(branches.code, code));
    if (!branch) return undefined;
    const cityRows = await db
      .select()
      .from(branchServiceCities)
      .where(eq(branchServiceCities.branchId, branch.id));
    return { ...branch, serviceCityIds: cityRows.map((a) => a.cityId) };
  }

  async createBranch(branchData: InsertBranch, serviceCityIds: string[] = []): Promise<Branch> {
    const [branch] = await db
      .insert(branches)
      .values({
        ...branchData,
        tagline: branchData.tagline ?? null,
        logoUrl: branchData.logoUrl ?? null,
        addressInputMode: branchData.addressInputMode ?? "mapbox",
        deliveryEnabled: branchData.deliveryEnabled ?? true,
      })
      .returning();
    if (serviceCityIds.length) {
      await db
        .insert(branchServiceCities)
        .values(serviceCityIds.map((cityId) => ({ branchId: branch.id, cityId })))
        .onConflictDoNothing();
    }
    return branch;
  }

  async updateBranch(
    id: string,
    branchData: Partial<InsertBranch>,
    serviceCityIds?: string[],
  ): Promise<Branch | undefined> {
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(branchData)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }
    if (branchData.tagline !== undefined) {
      updateData.tagline = branchData.tagline ?? null;
    }
    if (branchData.logoUrl !== undefined) {
      updateData.logoUrl = branchData.logoUrl ?? null;
    }
    const [updated] = await db
      .update(branches)
      .set(updateData)
      .where(eq(branches.id, id))
      .returning();
    if (!updated) return undefined;
    if (serviceCityIds) {
      await db.delete(branchServiceCities).where(eq(branchServiceCities.branchId, id));
      if (serviceCityIds.length) {
        await db
          .insert(branchServiceCities)
          .values(serviceCityIds.map((cityId) => ({ branchId: id, cityId })))
          .onConflictDoNothing();
      }
    }
    const cityRows = await db
      .select()
      .from(branchServiceCities)
      .where(eq(branchServiceCities.branchId, id));
    return { ...updated, serviceCityIds: cityRows.map((a) => a.cityId) } as Branch & {
      serviceCityIds: string[];
    };
  }

  async setBranchServiceCities(branchId: string, cityIds: string[]): Promise<string[]> {
    await db.delete(branchServiceCities).where(eq(branchServiceCities.branchId, branchId));
    if (cityIds.length) {
      await db
        .insert(branchServiceCities)
        .values(cityIds.map((cityId) => ({ branchId, cityId })))
        .onConflictDoNothing();
    }
    const rows = await db
      .select()
      .from(branchServiceCities)
      .where(eq(branchServiceCities.branchId, branchId));
    return rows.map((r) => r.cityId);
  }

  async getCities(): Promise<City[]> {
    return await db.select().from(cities).orderBy(cities.nameEn);
  }

  async replaceCities(list: InsertCity[]): Promise<void> {
    await db.delete(cities);
    if (list.length) {
      await db
        .insert(cities)
        .values(list.map((c) => ({ ...c, updatedAt: new Date() })));
    }
  }

  async deleteBranch(id: string): Promise<boolean> {
    const result = await db.delete(branches).where(eq(branches.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Product methods
  async getProducts(
    branchId?: string,
    search?: string,
    limit?: number,
    offset?: number,
    itemType?: ItemType,
  ): Promise<{ items: Product[]; total: number }> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [] as any[];
      if (branchId) conditions.push(eq(products.branchId, branchId));
      if (itemType) conditions.push(eq(products.itemType, itemType));
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(ilike(products.name, pattern), ilike(products.description, pattern)) as any,
        );
      }
      const where = conditions.length ? (and(...conditions) as any) : undefined;
      let query = tx.select().from(products).$dynamic();
      if (where) query = query.where(where);
      if (typeof limit === "number") query = query.limit(limit);
      if (typeof offset === "number") query = query.offset(offset);
      const items = await query;

      let countQuery = tx
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .$dynamic();
      if (where) countQuery = countQuery.where(where);
      const [{ count }] = await countQuery;
      return { items, total: Number(count) };
    });
  }

  async getProductsByCategory(
    categoryId: string,
    branchId?: string,
    search?: string,
    limit?: number,
    offset?: number,
    itemType?: ItemType,
  ): Promise<{ items: Product[]; total: number }> {
    if (categoryId === "all") {
      return this.getProducts(branchId, search, limit, offset, itemType);
    }
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [eq(products.categoryId, categoryId)];
      if (branchId) conditions.push(eq(products.branchId, branchId));
      if (itemType) conditions.push(eq(products.itemType, itemType));
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(ilike(products.name, pattern), ilike(products.description, pattern)) as any,
        );
      }
      const where = conditions.length ? and(...conditions) : undefined;
      let query = tx.select().from(products).$dynamic();
      if (where) query = query.where(where);
      if (typeof limit === "number") query = query.limit(limit);
      if (typeof offset === "number") query = query.offset(offset);
      const items = await query;

      const countQuery = tx
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .$dynamic();
      const [{ count }] = where ? await countQuery.where(where) : await countQuery;
      return { items, total: Number(count) };
    });
  }

  async getProduct(id: string, branchId?: string): Promise<Product | undefined> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [eq(products.id, id)];
      if (branchId) conditions.push(eq(products.branchId, branchId));
      const [product] = await tx.select().from(products).where(and(...conditions));
      return product || undefined;
    });
  }

  async createProduct(productData: InsertProduct & { branchId: string }): Promise<Product> {
    return await this.withTenant(productData.branchId, async (tx) => {
      const [product] = await tx
        .insert(products)
        .values(productData)
        .returning();
      return product;
    });
  }

  async updateProduct(
    id: string,
    productData: Partial<InsertProduct>,
    branchId: string,
  ): Promise<Product | undefined> {
    const [updated] = await (await this.withTenant(branchId, async (tx) => tx
      .update(products)
      .set(productData)
      .where(and(eq(products.id, id), eq(products.branchId, branchId)))
      .returning())) as any;
    return updated || undefined;
  }

  async getProductCategories(branchId: string): Promise<Category[]> {
    const rows = await (await this.withTenant(branchId, async (tx) => tx
      .select({ category: categories })
      .from(categories)
      .innerJoin(products, eq(products.categoryId, categories.id))
      .where(and(eq(products.branchId, branchId), eq(categories.type, "product")))
      .groupBy(categories.id))) as any;
    return (rows as any[]).map((r: any) => r.category);
  }

  // Clothing Items methods
  async getClothingItems(userId: string): Promise<ClothingItem[]> {
    return await db.select().from(clothingItems).where(eq(clothingItems.userId, userId));
  }

  async getClothingItemsByCategory(categoryId: string, userId: string): Promise<ClothingItem[]> {
    if (categoryId === "all") {
      return this.getClothingItems(userId);
    }
    return await db
      .select()
      .from(clothingItems)
      .where(and(eq(clothingItems.categoryId, categoryId), eq(clothingItems.userId, userId)));
  }

  async getClothingItem(id: string, userId: string): Promise<ClothingItem | undefined> {
    const [item] = await db
      .select()
      .from(clothingItems)
      .where(and(eq(clothingItems.id, id), eq(clothingItems.userId, userId)));
    return item || undefined;
  }

  async createClothingItem(item: InsertClothingItem & { userId: string }): Promise<ClothingItem> {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ branchId: users.branchId })
        .from(users)
        .where(eq(users.id, item.userId));
      const [newItem] = await tx
        .insert(clothingItems)
        .values({ ...item, branchId: user?.branchId || null as any })
        .returning();
      const services = await tx
        .select()
        .from(laundryServices)
        .where(eq(laundryServices.userId, item.userId));
      if (services.length > 0) {
        const branchId = user?.branchId || "default";
        const priceRows = services.map((s) => ({
          clothingItemId: newItem.id,
          serviceId: s.id,
          branchId,
          price: "0.00",
        }));
        await tx.insert(itemServicePrices).values(priceRows).onConflictDoNothing();
      }
      return newItem;
    });
  }

  async updateClothingItem(
    id: string,
    item: Partial<InsertClothingItem>,
    userId: string,
  ): Promise<ClothingItem | undefined> {
    const [updated] = await db
      .update(clothingItems)
      .set(item)
      .where(and(eq(clothingItems.id, id), eq(clothingItems.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteClothingItem(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(clothingItems)
      .where(and(eq(clothingItems.id, id), eq(clothingItems.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Laundry Services methods
  async getLaundryServices(userId: string): Promise<LaundryService[]> {
    return await db.select().from(laundryServices).where(eq(laundryServices.userId, userId));
  }

  async getLaundryServicesByCategory(categoryId: string, userId: string): Promise<LaundryService[]> {
    if (categoryId === "all") {
      return this.getLaundryServices(userId);
    }
    return await db
      .select()
      .from(laundryServices)
      .where(and(eq(laundryServices.categoryId, categoryId), eq(laundryServices.userId, userId)));
  }

  async getLaundryService(id: string, userId: string): Promise<LaundryService | undefined> {
    const [service] = await db
      .select()
      .from(laundryServices)
      .where(and(eq(laundryServices.id, id), eq(laundryServices.userId, userId)));
    return service || undefined;
  }

  async createLaundryService(service: InsertLaundryService & { userId: string }): Promise<LaundryService> {
    const [user] = await db.select({ branchId: users.branchId }).from(users).where(eq(users.id, service.userId));
    const [newService] = await db
      .insert(laundryServices)
      .values({ ...service, branchId: user?.branchId || null as any })
      .returning();
    return newService;
  }

  async updateLaundryService(
    id: string,
    service: Partial<InsertLaundryService>,
    userId: string,
  ): Promise<LaundryService | undefined> {
    const [updated] = await db
      .update(laundryServices)
      .set(service)
      .where(and(eq(laundryServices.id, id), eq(laundryServices.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteLaundryService(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(laundryServices)
      .where(and(eq(laundryServices.id, id), eq(laundryServices.userId, userId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getServicesForClothingItem(
    clothingItemId: string,
    userId: string,
    branchId: string,
    categoryId?: string,
  ): Promise<(LaundryService & { itemPrice: string })[]> {
    const conditions: any[] = [
      eq(laundryServices.userId, userId),
      eq(clothingItems.userId, userId),
      eq(itemServicePrices.clothingItemId, clothingItemId),
      eq(itemServicePrices.branchId, branchId),
    ];
    if (categoryId && categoryId !== "all") {
      conditions.push(eq(laundryServices.categoryId, categoryId));
    }

    const rows = await db
      .select({
        publicId: laundryServices.publicId,
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
      .innerJoin(clothingItems, eq(clothingItems.id, clothingItemId))
      .where(and(...conditions));

    return rows;
  }

  async createItemServicePrice(data: InsertItemServicePrice): Promise<ItemServicePrice> {
    const [row] = await db
      .insert(itemServicePrices)
      .values({
        ...data,
        branchId: data.branchId!,
        price: data.price.toString(),
      })
      .onConflictDoUpdate({
        target: [
          itemServicePrices.clothingItemId,
          itemServicePrices.serviceId,
          itemServicePrices.branchId,
        ],
        set: { price: data.price.toString() },
      })
      .returning();
    return row;
  }

  async updateItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    branchId: string,
    price: string,
  ): Promise<ItemServicePrice | undefined> {
    const [row] = await db
      .update(itemServicePrices)
      .set({ price })
      .where(
        and(
          eq(itemServicePrices.clothingItemId, clothingItemId),
          eq(itemServicePrices.serviceId, serviceId),
          eq(itemServicePrices.branchId, branchId),
        ),
      )
      .returning();
    return row || undefined;
  }

  async deleteItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    branchId: string,
  ): Promise<boolean> {
    const result = await db
      .delete(itemServicePrices)
      .where(
        and(
          eq(itemServicePrices.clothingItemId, clothingItemId),
          eq(itemServicePrices.serviceId, serviceId),
          eq(itemServicePrices.branchId, branchId),
        ),
      );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getItemServicePrice(
    clothingItemId: string,
    serviceId: string,
    _userId: string,
    branchId: string,
  ): Promise<number | undefined> {
    const [priceRow] = await db
      .select({ price: itemServicePrices.price })
      .from(itemServicePrices)
      .where(
        and(
          eq(itemServicePrices.clothingItemId, clothingItemId),
          eq(itemServicePrices.serviceId, serviceId),
          eq(itemServicePrices.branchId, branchId),
        ),
      )
      .limit(1);
    if (priceRow) return parseFloat(priceRow.price);
    const [svc] = await db
      .select({ price: laundryServices.price })
      .from(laundryServices)
      .where(eq(laundryServices.id, serviceId))
      .limit(1);
    return svc ? parseFloat(svc.price) : undefined;
  }

  async getCatalogForExport(userId: string): Promise<ParsedRow[]> {
    const [user] = await db
      .select({ branchId: users.branchId })
      .from(users)
      .where(eq(users.id, userId));
    const branchId = user?.branchId || "default";

    const items = await db
      .select({
        id: clothingItems.id,
        name: clothingItems.name,
        imageUrl: clothingItems.imageUrl,
      })
      .from(clothingItems)
      .where(eq(clothingItems.userId, userId));

    if (items.length === 0) return [];

    const itemIds = items.map((i) => i.id);
    const services = await db
      .select({
        clothingItemId: itemServicePrices.clothingItemId,
        serviceName: laundryServices.name,
        price: itemServicePrices.price,
      })
      .from(itemServicePrices)
      .innerJoin(
        laundryServices,
        eq(itemServicePrices.serviceId, laundryServices.id),
      )
      .where(
        and(
          inArray(itemServicePrices.clothingItemId, itemIds),
          eq(itemServicePrices.branchId, branchId),
          eq(laundryServices.userId, userId),
          inArray(laundryServices.name, [
            "Normal Iron",
            "Normal Wash",
            "Normal Wash & Iron",
            "Urgent Iron",
            "Urgent Wash",
            "Urgent Wash & Iron",
          ]),
        ),
      );

    const priceMap = new Map<string, Map<string, string>>();
    for (const row of services) {
      if (!priceMap.has(row.clothingItemId)) {
        priceMap.set(row.clothingItemId, new Map());
      }
      priceMap.get(row.clothingItemId)!.set(row.serviceName, row.price);
    }

    return items.map((item) => {
      const map = priceMap.get(item.id) || new Map();
      const get = (name: string) => {
        const val = map.get(name);
        return val ? parseFloat(val) : undefined;
      };
      return {
        itemEn: item.name,
        itemAr: undefined,
        normalIron: get("Normal Iron"),
        normalWash: get("Normal Wash"),
        normalWashIron: get("Normal Wash & Iron"),
        urgentIron: get("Urgent Iron"),
        urgentWash: get("Urgent Wash"),
        urgentWashIron: get("Urgent Wash & Iron"),
        imageUrl: item.imageUrl ?? undefined,
      };
    });
  }

  async bulkUpsertUserCatalog(
    userId: string,
    rows: ParsedRow[],
  ): Promise<BulkUploadResult> {
    let created = 0;
    let updated = 0;
    let clothingItemsCreated = 0;
    let clothingItemsUpdated = 0;
    let branchId = "";

    await db.transaction(async (tx) => {
      const [user] = await tx
        .select({ branchId: users.branchId })
        .from(users)
        .where(eq(users.id, userId));
      if (!user?.branchId) throw new Error(`No branchId for user ${userId}`);
      branchId = user.branchId;

      const existingCategories = await tx
        .select()
        .from(categories)
        .where(eq(categories.userId, userId));
      const catMap = new Map(existingCategories.map((c) => [c.name, c.id]));

      const requiredCategories = [
        { name: "Normal Iron", type: "service" },
        { name: "Normal Wash", type: "service" },
        { name: "Normal Wash & Iron", type: "service" },
        { name: "Urgent Iron", type: "service" },
        { name: "Urgent Wash", type: "service" },
        { name: "Urgent Wash & Iron", type: "service" },
        { name: "Clothing Items", type: "clothing" },
      ];

      for (const cat of requiredCategories) {
        if (!catMap.has(cat.name)) {
          const [inserted] = await tx
            .insert(categories)
            .values({
              name: cat.name,
              type: cat.type,
              isActive: true,
              userId,
            })
            .returning();
          catMap.set(cat.name, inserted.id);
        }
      }

      // Ensure base laundry services exist and capture their IDs
      const serviceNames = [
        "Normal Iron",
        "Normal Wash",
        "Normal Wash & Iron",
        "Urgent Iron",
        "Urgent Wash",
        "Urgent Wash & Iron",
      ];
      const serviceIdMap = new Map<string, string>();
      const serviceArabicMap: Record<string, string> = {
        "Normal Iron": "كي عادي",
        "Normal Wash": "غسيل عادي",
        "Normal Wash & Iron": "غسيل وكي عادي",
        "Urgent Iron": "كي مستعجل",
        "Urgent Wash": "غسيل مستعجل",
        "Urgent Wash & Iron": "غسيل وكي مستعجل",
      };
      for (const name of serviceNames) {
        const categoryId = catMap.get(name)!;
        const [existing] = await tx
          .select()
          .from(laundryServices)
          .where(
            and(
              eq(laundryServices.userId, userId),
              eq(laundryServices.categoryId, categoryId),
              eq(laundryServices.name, name),
            ),
          );
        if (existing) {
          // Backfill Arabic name if missing
          if (!existing.nameAr && serviceArabicMap[name]) {
            const [updated] = await tx
              .update(laundryServices)
              .set({ nameAr: serviceArabicMap[name] })
              .where(eq(laundryServices.id, existing.id))
              .returning();
            serviceIdMap.set(name, updated.id);
          } else {
            serviceIdMap.set(name, existing.id);
          }
        } else {
          const [inserted] = await tx
            .insert(laundryServices)
            .values({
              name,
              nameAr: serviceArabicMap[name] || null,
              price: "0.00",
              categoryId,
              userId,
            })
            .returning();
          serviceIdMap.set(name, inserted.id);
        }
      }

      for (const row of rows) {
        const clothingCategoryId = catMap.get("Clothing Items")!;

        // Prefer an existing branch-scoped item with the same name (shared across users in a branch)
        const [existingBranchItem] = await tx
          .select()
          .from(clothingItems)
          .where(
            and(
              eq(clothingItems.name, row.itemEn),
              eq(clothingItems.branchId, branchId),
            ),
          );

        let clothingItemId: string;
        if (existingBranchItem) {
          clothingItemId = existingBranchItem.id;
          // Update bilingual fields/image if provided
          const updatePayload: any = {};
          if (row.imageUrl) updatePayload.imageUrl = row.imageUrl;
          if (row.itemAr) updatePayload.nameAr = row.itemAr;
          if (Object.keys(updatePayload).length > 0) {
            await tx
              .update(clothingItems)
              .set(updatePayload)
              .where(eq(clothingItems.id, existingBranchItem.id));
          }
        } else {
          // Fall back to user's own item by name
          const [existingItem] = await tx
            .select()
            .from(clothingItems)
            .where(
              and(
                eq(clothingItems.userId, userId),
                eq(clothingItems.name, row.itemEn),
              ),
            );

          if (existingItem) {
            clothingItemId = existingItem.id;
            const updatePayload: any = { imageUrl: row.imageUrl };
            if (row.itemAr) updatePayload.nameAr = row.itemAr;
            // If this item isn't yet branch-scoped, try to stamp the branch
            if (!existingItem.branchId) {
              // Double-check no conflict exists for this branch+name
              const [conflict] = await tx
                .select({ id: clothingItems.id })
                .from(clothingItems)
                .where(
                  and(
                    eq(clothingItems.name, row.itemEn),
                    eq(clothingItems.branchId, branchId),
                  ),
                );
              if (!conflict) {
                updatePayload.branchId = branchId;
              } else {
                // Reuse the conflicting (canonical) item instead
                clothingItemId = conflict.id;
              }
            }
            await tx
              .update(clothingItems)
              .set(updatePayload)
              .where(eq(clothingItems.id, clothingItemId));
            clothingItemsUpdated++;
          } else {
            // Create a new branch-scoped item for this user
            const [insertedItem] = await tx
              .insert(clothingItems)
              .values({
                name: row.itemEn,
                nameAr: row.itemAr || null,
                imageUrl: row.imageUrl,
                categoryId: clothingCategoryId,
                userId,
                branchId,
              })
              .returning();
            clothingItemId = insertedItem.id;
            clothingItemsCreated++;
          }
        }

        const services: Record<string, number | undefined> = {
          "Normal Iron": row.normalIron,
          "Normal Wash": row.normalWash,
          "Normal Wash & Iron": row.normalWashIron,
          "Urgent Iron": row.urgentIron,
          "Urgent Wash": row.urgentWash,
          "Urgent Wash & Iron": row.urgentWashIron,
        };

        for (const [serviceName, serviceId] of Array.from(serviceIdMap.entries())) {
          const price = services[serviceName];
          const priceStr =
            price != null && !isNaN(price) ? price.toFixed(2) : "0.00";
          const [existingPrice] = await tx
            .select()
            .from(itemServicePrices)
            .where(
              and(
                eq(itemServicePrices.clothingItemId, clothingItemId),
                eq(itemServicePrices.serviceId, serviceId),
                eq(itemServicePrices.branchId, branchId),
              ),
            );
          if (existingPrice) {
            if (price != null && !isNaN(price)) {
              await tx
                .update(itemServicePrices)
                .set({ price: priceStr })
                .where(
                  and(
                    eq(itemServicePrices.clothingItemId, clothingItemId),
                    eq(itemServicePrices.serviceId, serviceId),
                    eq(itemServicePrices.branchId, branchId),
                  ),
                );
              updated++;
            }
          } else {
            await tx
              .insert(itemServicePrices)
              .values({
                clothingItemId,
                serviceId,
                branchId,
                price: priceStr,
              });
            created++;
          }
        }
      }
    });

    console.debug("bulkUpsertUserCatalog results", {
      userId,
      branchId,
      created,
      updated,
      clothingItemsCreated,
      clothingItemsUpdated,
    });

    return {
      processed: rows.length,
      created,
      updated,
      branchId,
      clothingItemsCreated,
      clothingItemsUpdated,
    };
  }

  async bulkUpsertBranchCatalog(
    branchId: string,
    rows: ParsedRow[],
  ): Promise<BulkUploadResult> {
    const branchUsers = await db
      .select()
      .from(users)
      .where(eq(users.branchId, branchId));
    if (branchUsers.length === 0) {
      return {
        processed: 0,
        created: 0,
        updated: 0,
        branchId,
        clothingItemsCreated: 0,
        clothingItemsUpdated: 0,
      };
    }

    let created = 0;
    let updated = 0;
    let clothingItemsCreated = 0;
    let clothingItemsUpdated = 0;
    const userResults: { userId: string; created: number; updated: number }[] = [];
    for (const user of branchUsers) {
      const result = await this.bulkUpsertUserCatalog(user.id, rows);
      userResults.push({
        userId: user.id,
        created: result.created,
        updated: result.updated,
      });
      created += result.created;
      updated += result.updated;
      clothingItemsCreated += result.clothingItemsCreated;
      clothingItemsUpdated += result.clothingItemsUpdated;
    }
    return {
      processed: rows.length,
      created,
      updated,
      branchId,
      clothingItemsCreated,
      clothingItemsUpdated,
      userResults,
    };
  }

  async bulkUpsertProducts(branchId: string, productRows: any[]): Promise<{ created: number; updated: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of productRows) {
      try {
        // Find or create category if specified
        let categoryId = null;
        if (row.category) {
          const branchUsers = await db.select().from(users).where(eq(users.branchId, branchId)).limit(1);
          if (branchUsers.length > 0) {
            const userId = branchUsers[0].id;
            let category = await db.select()
              .from(categories)
              .where(and(eq(categories.name, row.category), eq(categories.userId, userId)))
              .limit(1);
            
            if (category.length === 0) {
              // Create new category
              const [newCategory] = await db.insert(categories)
                .values({
                  name: row.category,
                  type: "product",
                  userId: userId,
                })
                .returning();
              categoryId = newCategory.id;
            } else {
              categoryId = category[0].id;
            }
          }
        }

        // Check if product already exists (by name within the branch)
        const existingProduct = await db.select()
          .from(products)
          .where(and(eq(products.name, row.nameEn), eq(products.branchId, branchId)))
          .limit(1);

        if (existingProduct.length > 0) {
          // Update existing product
          await db.update(products)
            .set({
              description: row.description,
              categoryId: categoryId,
              price: row.price?.toString(),
              stock: row.stock || 0,
              itemType: row.itemType || "everyday",
              imageUrl: row.imageUrl,
            })
            .where(eq(products.id, existingProduct[0].id));
          updated++;
        } else {
          // Create new product
          await db.insert(products)
            .values({
              name: row.nameEn,
              description: row.description,
              categoryId: categoryId,
              price: row.price?.toString() || "0",
              stock: row.stock || 0,
              itemType: row.itemType || "everyday",
              imageUrl: row.imageUrl,
              branchId: branchId,
            });
          created++;
        }
      } catch (error: any) {
        errors.push(`Failed to process product "${row.nameEn}": ${error.message}`);
      }
    }

    return { created, updated, errors };
  }

  async syncPackagesWithNewItems(branchId: string, newClothingItemIds: string[], newServiceIds: string[]): Promise<void> {
    if (newClothingItemIds.length === 0 && newServiceIds.length === 0) {
      return; // Nothing to sync
    }

    // Get all packages for this branch
    const branchPackages = await db.select()
      .from(packages)
      .where(eq(packages.branchId, branchId));

    for (const pkg of branchPackages) {
      // Add new clothing items with services to this package
      for (const clothingItemId of newClothingItemIds) {
        for (const serviceId of newServiceIds) {
          // Check if this combination already exists
          const existing = await db.select()
            .from(packageItems)
            .where(and(
              eq(packageItems.packageId, pkg.id),
              eq(packageItems.clothingItemId, clothingItemId),
              eq(packageItems.serviceId, serviceId)
            ))
            .limit(1);

          if (existing.length === 0) {
            // Add with default credits (1 credit per item)
            await db.insert(packageItems)
              .values({
                packageId: pkg.id,
                clothingItemId: clothingItemId,
                serviceId: serviceId,
                credits: 1,
                paidCredits: 0,
              });
          }
        }
      }
    }

    console.log(`Synced packages with ${newClothingItemIds.length} new clothing items and ${newServiceIds.length} new services for branch ${branchId}`);
  }

  // Transactions methods
  async createTransaction(transaction: InsertTransaction & { branchId: string }): Promise<Transaction> {
    const [newTransaction] = await db
      .insert(transactions)
      .values({ ...transaction, orderId: transaction.orderId ?? null })
      .returning();
    return newTransaction;
  }

  async getTransactions(
    branchId?: string,
    start?: Date,
    end?: Date,
    limit?: number,
    offset?: number
  ): Promise<Transaction[]> {
    const conditions = [] as any[];
    if (branchId) {
      conditions.push(eq(transactions.branchId, branchId));
    }
    if (start) {
      conditions.push(gte(transactions.createdAt, start));
    }
    if (end) {
      conditions.push(lte(transactions.createdAt, end));
    }
    let query: any = db.select().from(transactions).orderBy(desc(transactions.createdAt));
    if (conditions.length) {
      query = query.where(and(...conditions));
    }
    if (typeof limit === "number") {
      query = query.limit(limit);
    }
    if (typeof offset === "number") {
      query = query.offset(offset);
    }
    return await query;
  }

  async getTransaction(id: string, branchId?: string): Promise<Transaction | undefined> {
    const conditions = [eq(transactions.id, id)];
    if (branchId) conditions.push(eq(transactions.branchId, branchId));
    const [transaction] = await db.select().from(transactions).where(and(...conditions));
    return transaction || undefined;
  }

  // Package methods
  async getPackages(branchId: string): Promise<PackageWithItems[]> {
    const pkgs = await db
      .select()
      .from(packages)
      .where(eq(packages.branchId, branchId));
    const items = await db
      .select({
        id: packageItems.id,
        packageId: packageItems.packageId,
        clothingItemId: packageItems.clothingItemId,
        categoryId: packageItems.categoryId,
        serviceId: packageItems.serviceId,
        credits: packageItems.credits,
        paidCredits: packageItems.paidCredits,
      })
      .from(packageItems)
      .where(inArray(packageItems.packageId, pkgs.map((p) => p.id)));
    const map = new Map<string, PackageItem[]>();
    for (const item of items) {
      const arr = map.get(item.packageId) || [];
      arr.push(item);
      map.set(item.packageId, arr);
    }
    return pkgs.map((p) => ({ ...p, packageItems: map.get(p.id) || [] }));
  }

  async getPackage(
    id: string,
    branchId: string,
  ): Promise<PackageWithItems | undefined> {
    const [pkg] = await db
      .select()
      .from(packages)
      .where(and(eq(packages.id, id), eq(packages.branchId, branchId)));
    if (!pkg) return undefined;
    const items = await db
      .select({
        id: packageItems.id,
        packageId: packageItems.packageId,
        clothingItemId: packageItems.clothingItemId,
        categoryId: packageItems.categoryId,
        serviceId: packageItems.serviceId,
        credits: packageItems.credits,
        paidCredits: packageItems.paidCredits,
      })
      .from(packageItems)
      .where(eq(packageItems.packageId, id));
    return { ...pkg, packageItems: items };
  }

  async createPackage(pkgData: InsertPackage): Promise<PackageWithItems> {
    const { packageItems: items, ...data } = pkgData;
    const [pkg] = await db.insert(packages).values(data).returning();
    let inserted: PackageItem[] = [];
    if (items && items.length > 0) {
      inserted = await db
        .insert(packageItems)
        .values(
          items.map((i) => ({
            packageId: pkg.id,
            clothingItemId: i.clothingItemId,
            categoryId: i.categoryId ?? null,
            serviceId: i.serviceId,
            credits: i.credits,
            paidCredits: i.paidCredits ?? 0,
          })),
        )
        .returning();
    }
    return { ...pkg, packageItems: inserted };
  }

  async updatePackage(
    id: string,
    pkgData: Partial<InsertPackage>,
    branchId: string,
  ): Promise<PackageWithItems | undefined> {
    const { packageItems: items, branchId: _b, ...data } = pkgData as any;
    const [pkg] = await db
      .update(packages)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(packages.id, id), eq(packages.branchId, branchId)))
      .returning();
    if (!pkg) return undefined;
    if (items) {
      await db.delete(packageItems).where(eq(packageItems.packageId, id));
      if (items.length > 0) {
        await db.insert(packageItems).values(
          items.map((i: any) => ({
            packageId: id,
            clothingItemId: i.clothingItemId,
            categoryId: i.categoryId ?? null,
            serviceId: i.serviceId,
            credits: i.credits,
            paidCredits: i.paidCredits ?? 0,
          })),
        );
      }
    }
    const currentItems = await db
      .select()
      .from(packageItems)
      .where(eq(packageItems.packageId, id));
    return { ...pkg, packageItems: currentItems };
  }

  async deletePackage(id: string, branchId: string): Promise<boolean> {
    await db.delete(packageItems).where(eq(packageItems.packageId, id));
    const [deleted] = await db
      .delete(packages)
      .where(and(eq(packages.id, id), eq(packages.branchId, branchId)))
      .returning();
    return !!deleted;
  }

  async getCustomerPackagesWithUsage(customerId: string): Promise<CustomerPackageWithUsage[]> {
    const { rows }: any = await db.execute(sql`
      SELECT cp.id, cp.package_id, cp.balance, cp.starts_at, cp.expires_at, p.name_en, p.name_ar,
             cpi.service_id, cpi.clothing_item_id, cpi.balance AS item_balance, cpi.total_credits,
             ls.name AS service_name, ci.name AS clothing_item_name
      FROM customer_packages cp
      JOIN packages p ON cp.package_id = p.id
      LEFT JOIN customer_package_items cpi ON cpi.customer_package_id = cp.id
      LEFT JOIN laundry_services ls ON cpi.service_id = ls.id
      LEFT JOIN clothing_items ci ON cpi.clothing_item_id = ci.id
      WHERE cp.customer_id = ${customerId}
    `);
    const map = new Map<string, any>();
    for (const r of rows) {
      if (!map.has(r.id)) {
        map.set(r.id, {
          id: r.id,
          packageId: r.package_id,
          balance: Number(r.balance),
          nameEn: r.name_en,
          nameAr: r.name_ar,
          totalCredits: 0,
          items: new Map<string, any>(),
          startsAt: r.starts_at,
          expiresAt: r.expires_at,
        });
      }
      if (r.service_id) {
        const pkg = map.get(r.id);
        const key = `${r.service_id}:${r.clothing_item_id || ''}`;
        if (!pkg.items.has(key)) {
          pkg.items.set(key, {
            serviceId: r.service_id,
            serviceName: r.service_name,
            clothingItemId: r.clothing_item_id,
            clothingItemName: r.clothing_item_name,
            balance: 0,
            totalCredits: 0,
          });
        }
        const item = pkg.items.get(key);
        item.balance += Number(r.item_balance);
        item.totalCredits += Number(r.total_credits);
        pkg.totalCredits += Number(r.total_credits);
      }
    }
    const result: any[] = [];
    for (const pkg of map.values()) {
      const items = Array.from(pkg.items.values());
      const balance = items.length
        ? items.reduce((sum: number, i: any) => sum + i.balance, 0)
        : pkg.balance;
      result.push({
        id: pkg.id,
        packageId: pkg.packageId,
        balance,
        nameEn: pkg.nameEn,
        nameAr: pkg.nameAr,
        totalCredits: pkg.totalCredits,
        items,
        startsAt: pkg.startsAt,
        expiresAt: pkg.expiresAt,
      });
    }
    return result;
  }

  async assignPackageToCustomer(
    packageId: string,
    customerId: string,
    _balance: number,
    startsAt: Date,
    expiresAt: Date | null,
  ): Promise<CustomerPackage> {
    const pkgItems = await db
      .select()
      .from(packageItems)
      .where(eq(packageItems.packageId, packageId));
    const totalBalance = pkgItems.reduce((sum, i) => sum + i.credits, 0);
    const [record] = await db
      .insert(customerPackages)
      .values({ packageId, customerId, balance: totalBalance, startsAt, expiresAt })
      .returning();
    if (pkgItems.length) {
      await db.insert(customerPackageItems).values(
        pkgItems.map((i) => ({
          customerPackageId: record.id,
          serviceId: i.serviceId!,
          clothingItemId: i.clothingItemId!,
          balance: i.credits,
          totalCredits: i.credits,
        })),
      );
    }
    return record;
  }

  async updateCustomerPackageBalance(
    customerPackageId: string,
    change: number,
    serviceId?: string,
    clothingItemId?: string,
  ): Promise<CustomerPackage | undefined> {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(customerPackages)
        .set({ balance: sql`${customerPackages.balance} + ${change}` })
        .where(eq(customerPackages.id, customerPackageId))
        .returning();
      if (serviceId && clothingItemId) {
        await tx
          .update(customerPackageItems)
          .set({ balance: sql`${customerPackageItems.balance} + ${change}` })
          .where(
            and(
              eq(customerPackageItems.customerPackageId, customerPackageId),
              eq(customerPackageItems.serviceId, serviceId),
              eq(customerPackageItems.clothingItemId, clothingItemId),
            ),
          );
      }
      return updated || undefined;
    });
  }
  // Customer methods
  async getCustomers(
    search?: string,
    includeInactive = false,
    branchId?: string,
    limit?: number,
    offset?: number,
  ): Promise<{ items: Customer[]; total: number }> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [] as any[];
      if (search) {
        const term = `%${search}%`;
        conditions.push(
          or(
            ilike(customers.name, term),
            ilike(customers.phoneNumber, term),
            ilike(customers.email, term),
            ilike(customers.nickname, term),
          ),
        );
      }
      if (branchId) {
        conditions.push(eq(customers.branchId, branchId));
      }
      if (!includeInactive) {
        conditions.push(eq(customers.isActive, true));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      let query = tx.select().from(customers).$dynamic();
      if (where) query = query.where(where);
      if (typeof limit === "number") query = query.limit(limit);
      if (typeof offset === "number") query = query.offset(offset);
      const items = await query;

      let countQuery = tx
        .select({ count: sql<number>`count(*)` })
        .from(customers)
        .$dynamic();
      if (where) countQuery = countQuery.where(where);
      const [{ count }] = await countQuery;
      return { items, total: Number(count) };
    });
  }

  async getCustomersByIds(ids: string[], branchId?: string): Promise<Customer[]> {
    if (!ids.length) return [];
    const uniqueIds = Array.from(new Set(ids));
    for (const id of uniqueIds) {
      assertUuid(id);
    }
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [inArray(customers.id, uniqueIds)];
      if (branchId) {
        conditions.push(eq(customers.branchId, branchId));
      }
      return await tx
        .select()
        .from(customers)
        .where(conditions.length > 1 ? and(...conditions) : conditions[0]);
    });
  }

  async getCustomer(id: string, branchId?: string): Promise<Customer | undefined> {
    return await this.withTenant(branchId, async (tx) => {
      const where = branchId
        ? and(eq(customers.id, id), eq(customers.branchId, branchId))
        : eq(customers.id, id);
      const [customer] = await tx.select().from(customers).where(where);
      return customer || undefined;
    });
  }

  async getCustomerByPhone(phoneNumber: string, branchId?: string): Promise<Customer | undefined> {
    return await this.withTenant(branchId, async (tx) => {
      const where = branchId
        ? and(eq(customers.phoneNumber, phoneNumber), eq(customers.branchId, branchId))
        : eq(customers.phoneNumber, phoneNumber);
      const [customer] = await tx.select().from(customers).where(where);
      return customer || undefined;
    });
  }

  async getCustomerByNickname(nickname: string, branchId?: string): Promise<Customer | undefined> {
    return await this.withTenant(branchId, async (tx) => {
      const where = branchId
        ? and(eq(customers.nickname, nickname), eq(customers.branchId, branchId))
        : eq(customers.nickname, nickname);
      const [customer] = await tx.select().from(customers).where(where);
      return customer || undefined;
    });
  }

  async createCustomer(customerData: InsertCustomer, branchId: string): Promise<Customer> {
    return await this.withTenant(branchId, async (tx) => {
      const [customer] = await tx
        .insert(customers)
        .values({ ...customerData, branchId })
        .returning();
      return customer;
    });
  }

  async updateCustomer(id: string, customerData: Partial<InsertCustomer>, branchId?: string): Promise<Customer | undefined> {
    return await this.withTenant(branchId, async (tx) => {
      const where = branchId
        ? and(eq(customers.id, id), eq(customers.branchId, branchId))
        : eq(customers.id, id);
      const [updated] = await tx
        .update(customers)
        .set({ ...customerData, updatedAt: new Date() })
        .where(where)
        .returning();
      return updated || undefined;
    });
  }

  async updateCustomerPassword(
    id: string,
    passwordHash: string,
  ): Promise<Customer | undefined> {
    // Derive tenantId first to set RLS context safely
    const [c] = await db.select({ branchId: customers.branchId }).from(customers).where(eq(customers.id, id));
    const tenant = c?.branchId as string | undefined;
    return await this.withTenant(tenant, async (tx) => {
      const [updated] = await tx
        .update(customers)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(customers.id, id))
        .returning();
      return updated || undefined;
    });
  }

  async deleteCustomer(id: string, branchId?: string): Promise<boolean> {
    return await this.withTenant(branchId, async (tx) => {
      const where = branchId
        ? and(eq(customers.id, id), eq(customers.branchId, branchId))
        : eq(customers.id, id);
      const [updated] = await tx
        .update(customers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(where)
        .returning();
      return !!updated;
    });
  }

  async updateCustomerBalance(
    id: string,
    balanceChange: number,
    branchId?: string,
  ): Promise<Customer | undefined> {
    const customer = await this.getCustomer(id, branchId);
    if (!customer) return undefined;

    const newBalance = parseFloat(customer.balanceDue) + balanceChange;
    return await this.updateCustomer(id, { balanceDue: newBalance.toFixed(2) });
  }

  async getCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
    return await db
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, customerId));
  }

  async createCustomerAddress(addressData: InsertCustomerAddress): Promise<CustomerAddress> {
    return await db.transaction(async (tx) => {
      if (addressData.isDefault) {
        await tx
          .update(customerAddresses)
          .set({ isDefault: false })
          .where(eq(customerAddresses.customerId, addressData.customerId));
      }
      const [address] = await tx
        .insert(customerAddresses)
        .values({
          ...addressData,
          lat: addressData.lat !== undefined ? addressData.lat.toString() : undefined,
          lng: addressData.lng !== undefined ? addressData.lng.toString() : undefined,
        })
        .returning();
      return address;
    });
  }

  async updateCustomerAddress(
    id: string,
    addressData: Partial<InsertCustomerAddress>,
    customerId: string,
  ): Promise<CustomerAddress | undefined> {
    return await db.transaction(async (tx) => {
      if (addressData.isDefault) {
        await tx
          .update(customerAddresses)
          .set({ isDefault: false })
          .where(eq(customerAddresses.customerId, customerId));
      }
      const { lat, lng, ...rest } = addressData;
      const updateData: Record<string, any> = { ...rest };
      if (lat !== undefined) updateData.lat = lat.toString();
      if (lng !== undefined) updateData.lng = lng.toString();
      const [updated] = await tx
        .update(customerAddresses)
        .set(updateData)
        .where(
          and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customerId)),
        )
        .returning();
      return updated || undefined;
    });
  }

  async deleteCustomerAddress(id: string, customerId: string): Promise<boolean> {
    const result = await db
      .delete(customerAddresses)
      .where(and(eq(customerAddresses.id, id), eq(customerAddresses.customerId, customerId)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Order methods
  async getOrders(
    branchId?: string,
    sortBy: "createdAt" | "balanceDue" = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
  ): Promise<(Order & { customerNickname: string | null; balanceDue: string | null })[]> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [eq(orders.isDeliveryRequest, false)] as any[];
      if (branchId) conditions.push(eq(orders.branchId, branchId));

      let query = tx
        .select({
          order: orders,
          customerNickname: customers.nickname,
          balanceDue: customers.balanceDue,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .$dynamic();

      if (conditions.length) {
        query = query.where(and(...conditions));
      }

      const orderByClause =
        sortBy === "balanceDue"
          ? sortOrder === "asc"
            ? asc(customers.balanceDue)
            : desc(customers.balanceDue)
          : sortOrder === "asc"
          ? asc(orders.createdAt)
          : desc(orders.createdAt);

      const results = await query.orderBy(orderByClause);

      return (results as any[]).map((row: any) => {
        const { order, customerNickname, balanceDue } = row;
        return {
          ...order,
          customerNickname,
          balanceDue: balanceDue ?? "0",
        };
      });
    });
  }


  async getOrder(id: string, branchId?: string): Promise<Order | undefined> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [eq(orders.id, id)];
      if (branchId) conditions.push(eq(orders.branchId, branchId));
      const [order] = await tx.select().from(orders).where(and(...conditions));
      return order || undefined;
    });
  }

  async getOrdersByCustomer(
    customerId: string,
    branchId?: string,
  ): Promise<(Order & { paid: string; remaining: string })[]> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [eq(orders.customerId, customerId), eq(orders.isDeliveryRequest, false)];
      if (branchId) conditions.push(eq(orders.branchId, branchId));

      const results = await tx
        .select({
          order: orders,
          paid: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
        })
        .from(orders)
        .leftJoin(payments, eq(orders.id, payments.orderId))
        .where(and(...conditions))
        .groupBy(orders.id);

      return (results as any[]).map((row: any) => {
        const { order, paid } = row;
        const paidNum = Number(paid);
        const total = Number(order.total);
        const remaining = (total - paidNum).toFixed(2);
        return { ...order, paid: paidNum.toFixed(2), remaining };
      });
    });
  }

  async getOrdersByStatus(
    status: string,
    branchId?: string,
    sortBy: "createdAt" | "balanceDue" = "createdAt",
    sortOrder: "asc" | "desc" = "desc",
  ): Promise<(Order & { customerNickname: string | null; balanceDue: string | null })[]> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [eq(orders.status, status as any), eq(orders.isDeliveryRequest, false)];
      if (branchId) conditions.push(eq(orders.branchId, branchId));

      let query = tx
        .select({
          order: orders,
          customerNickname: customers.nickname,
          balanceDue: customers.balanceDue,
        })
        .from(orders)
        .leftJoin(customers, eq(orders.customerId, customers.id))
        .where(and(...conditions));

      const orderByClause =
        sortBy === "balanceDue"
          ? sortOrder === "asc"
            ? asc(customers.balanceDue)
            : desc(customers.balanceDue)
          : sortOrder === "asc"
          ? asc(orders.createdAt)
          : desc(orders.createdAt);

      const results = await query.orderBy(orderByClause);

      return (results as any[]).map((row: any) => {
        const { order, customerNickname, balanceDue } = row;
        return {
          ...order,
          customerNickname,
          balanceDue: balanceDue ?? "0",
        };
      });
    });
  }

  async createOrder(orderData: InsertOrder & { branchId: string }): Promise<Order> {
    return await db.transaction(async (tx) => {
      // Use set_config instead of SET LOCAL with a parameter
      await tx.execute(sql`SELECT set_config('app.branch_id', ${orderData.branchId}, true)`);
      const [branch] = await tx
        .select({ code: branches.code, next: branches.nextOrderNumber })
        .from(branches)
        .where(eq(branches.id, orderData.branchId))
        .for("update");

      if (!branch) throw new Error("Branch not found");

      const orderNumber = `${branch.code}-${String(branch.next).padStart(4, "0")}`;

      await tx
        .update(branches)
        .set({ nextOrderNumber: branch.next + 1 })
        .where(eq(branches.id, orderData.branchId));

      const [order] = await tx
        .insert(orders)
        .values({
          ...orderData,
          orderNumber,
          isDeliveryRequest: orderData.isDeliveryRequest ?? false,
        })
        .returning();
      if (order) {
        await this.recordStatusEvent(
          tx,
          order.id,
          `order:${order.status}`,
          orderData.sellerName || SYSTEM_ACTOR,
          order.createdAt ?? null,
        );
      }
      return order;
    });
  }

  async updateOrder(id: string, orderData: Partial<Omit<Order, 'id' | 'orderNumber' | 'createdAt'>>): Promise<Order | undefined> {
    const [updated] = await db
      .update(orders)
      .set({ ...orderData, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated || undefined;
  }







  async recordOrderPrint(orderId: string, printedBy: string): Promise<OrderPrint> {
    const [last] = await db
      .select({ printNumber: orderPrints.printNumber })
      .from(orderPrints)
      .where(eq(orderPrints.orderId, orderId))
      .orderBy(desc(orderPrints.printNumber))
      .limit(1);
    const next = last ? last.printNumber + 1 : 1;
    const [record] = await db
      .insert(orderPrints)
      .values({ orderId, printedBy, printNumber: next })
      .returning();
    return record;
  }

  async getOrderPrintHistory(orderId: string): Promise<OrderPrint[]> {
    return await db
      .select()
      .from(orderPrints)
      .where(eq(orderPrints.orderId, orderId))
      .orderBy(orderPrints.printNumber);
  }

  // Payment methods
  async getPayments(branchId?: string): Promise<Payment[]> {
    if (branchId) {
      return await this.withTenant(branchId, async (tx) => {
      // Include both order-linked payments AND package payments (orderId = null) for the branch
      const rows = await tx
        .select({ payment: payments })
        .from(payments)
        .leftJoin(orders, eq(payments.orderId, orders.id))
        .leftJoin(customers, eq(payments.customerId, customers.id))
        .where(
          or(
            eq(orders.branchId, branchId), // Order-linked payments
            and(isNull(payments.orderId), eq(customers.branchId, branchId)) // Package payments
          )
        );
      return rows.map((r: any) => r.payment);
      });
    }
    return await db.select().from(payments);
  }

  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async getPaymentsByCustomer(customerId: string, branchId?: string): Promise<Payment[]> {
    if (branchId) {
      // Include both order-linked payments AND package payments (orderId = null) for the customer's branch
      const rows = await db
        .select({ payment: payments })
        .from(payments)
        .leftJoin(orders, eq(payments.orderId, orders.id))
        .leftJoin(customers, eq(payments.customerId, customers.id))
        .where(
          and(
            eq(payments.customerId, customerId),
            or(
              eq(orders.branchId, branchId), // Order-linked payments
              and(isNull(payments.orderId), eq(customers.branchId, branchId)) // Package payments
            )
          )
        );
      return rows.map(r => r.payment);
    }
    return await db.select().from(payments).where(eq(payments.customerId, customerId));
  }

  async createPayment(paymentData: InsertPayment): Promise<Payment> {
    let branchId: string | undefined = (paymentData as any).branchId;
    if (!branchId) {
      if (paymentData.orderId) {
        const [o] = await db.select({ branchId: orders.branchId }).from(orders).where(eq(orders.id, paymentData.orderId));
        branchId = o?.branchId;
      }
      if (!branchId) {
        const [c] = await db.select({ branchId: customers.branchId }).from(customers).where(eq(customers.id, paymentData.customerId));
        branchId = c?.branchId;
      }
    }
    return await this.withTenant(branchId, async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({ ...paymentData, branchId: branchId! })
        .returning();
      return payment;
    });
  }

  async getOrderLogs(status?: string): Promise<OrderLog[]> {
    const baseQuery = db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: orders.customerName,
        status: orders.status,
        createdAt: orders.createdAt,
        promisedReadyDate: orders.promisedReadyDate,
        packageName: sql<string>`max(${packages.nameEn})`,
      })
      .from(orders)
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .leftJoin(
        customerPackages,
        and(
          eq(customerPackages.customerId, orders.customerId),
          lte(customerPackages.startsAt, orders.createdAt),
          or(
            isNull(customerPackages.expiresAt),
            gt(customerPackages.expiresAt, orders.createdAt),
          ),
        ),
      )
      .leftJoin(packages, eq(customerPackages.packageId, packages.id));

    const query = status
      ? baseQuery.where(eq(orders.status, status as any))
      : baseQuery;

    const rows = await query
      .groupBy(
        orders.id,
        orders.orderNumber,
        orders.customerName,
        orders.status,
        orders.createdAt,
        orders.promisedReadyDate,
      )
      .orderBy(desc(orders.createdAt));

    if (!rows.length) {
      return [];
    }

    const orderIds = rows.map((r) => r.id);
    const historyRows = await db
      .select({
        id: orderStatusHistory.id,
        orderId: orderStatusHistory.orderId,
        status: orderStatusHistory.status,
        actor: orderStatusHistory.actor,
        occurredAt: orderStatusHistory.occurredAt,
      })
      .from(orderStatusHistory)
      .where(inArray(orderStatusHistory.orderId, orderIds))
      .orderBy(asc(orderStatusHistory.orderId), asc(orderStatusHistory.occurredAt));

    const historyMap = new Map<string, OrderTimelineEvent[]>();

    for (const event of historyRows) {
      const [prefix, remainder] = event.status.includes(":")
        ? event.status.split(":", 2)
        : ["", event.status];
      let context: "order" | "delivery" = "order";
      let statusValue = remainder;

      if (prefix === "order" || prefix === "delivery") {
        context = prefix;
      } else if (ORDER_STATUS_SET.has(event.status as any)) {
        context = "order";
        statusValue = event.status;
      } else if (DELIVERY_STATUS_SET.has(event.status as any)) {
        context = "delivery";
        statusValue = event.status;
      } else {
        statusValue = event.status;
      }

      const timelineEvent: OrderTimelineEvent = {
        id: event.id,
        status: statusValue,
        actor: event.actor ?? null,
        timestamp: (event.occurredAt ?? new Date()).toISOString(),
        context,
      };

      const arr = historyMap.get(event.orderId) ?? [];
      arr.push(timelineEvent);
      historyMap.set(event.orderId, arr);
    }

    return rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      customerName: r.customerName,
      packageName: r.packageName,
      status: r.status,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      promisedReadyDate: r.promisedReadyDate ? r.promisedReadyDate.toISOString() : null,
      events: (historyMap.get(r.id) ?? []).sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    }));
  }

  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    let branchId: string | undefined = (notificationData as any).branchId;
    if (!branchId) {
      const [o] = await db.select({ branchId: orders.branchId }).from(orders).where(eq(orders.id, notificationData.orderId));
      branchId = o?.branchId;
    }
    const [record] = await db
      .insert(notifications)
      .values({ ...notificationData, branchId: branchId! })
      .returning();
    return record;
  }

  async getSecuritySettings(): Promise<SecuritySettings | undefined> {
    const [settings] = await db.select().from(securitySettings).limit(1);
    return settings || undefined;
  }

  async updateSecuritySettings(settingsData: InsertSecuritySettings): Promise<SecuritySettings> {
    const existing = await this.getSecuritySettings();
    if (existing) {
      const [updated] = await db
        .update(securitySettings)
        .set({ ...settingsData, updatedAt: new Date() })
        .where(eq(securitySettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(securitySettings)
      .values(settingsData)
      .returning();
    return created;
  }

  async getLoyaltyHistory(customerId: string): Promise<LoyaltyHistory[]> {
    return await db
      .select()
      .from(loyaltyHistory)
      .where(eq(loyaltyHistory.customerId, customerId));
  }

  async createLoyaltyHistory(entry: InsertLoyaltyHistory): Promise<LoyaltyHistory> {
    const [record] = await db
      .insert(loyaltyHistory)
      .values(entry)
      .returning();
    return record;
  }

  async getCustomerEngagementPlan(customerId: string): Promise<CustomerEngagementPlan | undefined> {
    assertUuid(customerId);
    const [plan] = await db
      .select()
      .from(customerEngagementPlans)
      .where(eq(customerEngagementPlans.customerId, customerId));
    return plan || undefined;
  }

  async updateCustomerEngagementPlan(
    customerId: string,
    updates: CustomerEngagementPlanUpdateInput,
    branchId?: string,
  ): Promise<CustomerEngagementPlan | undefined> {
    assertUuid(customerId);
    const sanitized: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof updates.churnTier !== "undefined") {
      sanitized.churnTier = updates.churnTier ?? "no_orders";
    }
    if (typeof updates.preferredServices !== "undefined") {
      sanitized.preferredServices = updates.preferredServices ?? [];
    }
    if (typeof updates.recommendedAction !== "undefined") {
      sanitized.recommendedAction = updates.recommendedAction ?? null;
    }
    if (typeof updates.recommendedChannel !== "undefined") {
      const channel = updates.recommendedChannel;
      sanitized.recommendedChannel =
        channel === "sms" || channel === "email" || channel === "chat" ? channel : null;
    }
    if (typeof updates.nextContactAt !== "undefined") {
      sanitized.nextContactAt = updates.nextContactAt ?? null;
    }
    if (typeof updates.lastActionAt !== "undefined") {
      sanitized.lastActionAt = updates.lastActionAt ?? null;
    }
    if (typeof updates.lastActionChannel !== "undefined") {
      const channel = updates.lastActionChannel;
      sanitized.lastActionChannel =
        channel === "sms" || channel === "email" || channel === "chat" ? channel : null;
    }
    if (typeof updates.lastOutcome !== "undefined") {
      sanitized.lastOutcome = updates.lastOutcome ?? null;
    }
    if (typeof updates.source !== "undefined") {
      sanitized.source = updates.source ?? "manual";
    }
    if (typeof updates.rateLimitedUntil !== "undefined") {
      sanitized.rateLimitedUntil = updates.rateLimitedUntil ?? null;
    }

    const [updated] = await db
      .update(customerEngagementPlans)
      .set(sanitized)
      .where(eq(customerEngagementPlans.customerId, customerId))
      .returning();

    if (updated) {
      return updated;
    }

    const targetBranchId = branchId ?? (await this.getCustomer(customerId))?.branchId;
    if (!targetBranchId) {
      throw new Error("Branch context is required to create engagement plan");
    }

    const insertValue: InsertCustomerEngagementPlan = {
      customerId,
      branchId: targetBranchId,
      churnTier: (sanitized.churnTier as CustomerChurnTier | undefined) ?? "no_orders",
      preferredServices: (sanitized.preferredServices as string[] | undefined) ?? [],
      recommendedAction: (sanitized.recommendedAction as string | null | undefined) ?? null,
      recommendedChannel:
        (sanitized.recommendedChannel as CustomerEngagementChannel | null | undefined) ?? null,
      nextContactAt: (sanitized.nextContactAt as Date | null | undefined) ?? null,
      lastActionAt: (sanitized.lastActionAt as Date | null | undefined) ?? null,
      lastActionChannel:
        (sanitized.lastActionChannel as CustomerEngagementChannel | null | undefined) ?? null,
      lastOutcome: (sanitized.lastOutcome as string | null | undefined) ?? null,
      source: (sanitized.source as "auto" | "manual" | undefined) ?? "manual",
      rateLimitedUntil: (sanitized.rateLimitedUntil as Date | null | undefined) ?? null,
    };

    const [created] = await db.insert(customerEngagementPlans).values(insertValue).returning();
    return created || undefined;
  }

  // Report methods
  async getCustomerInsights({ branchId, limit }: CustomerInsightOptions = {}): Promise<CustomerInsight[]> {
    const sanitizedBranchId = branchId ? (assertUuid(branchId), branchId.replace(/'/g, "''")) : undefined;
    const whereConditions = ["c.is_active = true"];
    const orderBranchFilter = sanitizedBranchId ? `AND o.branch_id = '${sanitizedBranchId}'` : "";
    const paymentBranchFilter = sanitizedBranchId ? `AND p.branch_id = '${sanitizedBranchId}'` : "";
    if (sanitizedBranchId) {
      whereConditions.push(`c.branch_id = '${sanitizedBranchId}'`);
    }
    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";
    const limitValue = typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : undefined;
    const limitClause = limitValue ? `LIMIT ${limitValue}` : "";

    const { rows: baseRows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      order_financials AS (
        SELECT
          o.customer_id,
          o.created_at,
          o.total::numeric AS total_value
        FROM orders o
        WHERE o.customer_id IS NOT NULL
          AND o.is_delivery_request = false
          AND o.payment_method <> 'pay_later'
          ${orderBranchFilter}
        UNION ALL
        SELECT
          o.customer_id,
          o.created_at,
          pl.amount::numeric AS total_value
        FROM orders o
        JOIN pay_later pl ON pl.order_id = o.id
        WHERE o.customer_id IS NOT NULL
          AND o.is_delivery_request = false
          AND o.payment_method = 'pay_later'
          ${orderBranchFilter}
      ),
      package_payments AS (
        SELECT customer_id, SUM(amount::numeric) AS total_amount
        FROM payments p
        WHERE p.customer_id IS NOT NULL
          AND p.order_id IS NULL
          ${paymentBranchFilter}
        GROUP BY customer_id
      )
      SELECT
        c.id AS customer_id,
        c.name,
        c.phone_number,
        c.loyalty_points,
        c.balance_due,
        c.branch_id AS branch_id,
        COALESCE(SUM(of.total_value), 0) + COALESCE(pp.total_amount, 0) AS total_spend,
        MAX(of.created_at) AS last_order_date,
        COUNT(of.total_value) AS order_count
      FROM customers c
      LEFT JOIN order_financials of ON of.customer_id = c.id
      LEFT JOIN package_payments pp ON pp.customer_id = c.id
      ${whereClause}
      GROUP BY c.id, c.name, c.phone_number, c.loyalty_points, c.balance_due, c.branch_id, pp.total_amount
      ORDER BY total_spend DESC
      ${limitClause};
    `));

    const insightsMap = new Map<string, CustomerInsight>();

    for (const row of baseRows) {
      const totalSpend = Number(row.total_spend ?? 0);
      const orderCount = Number(row.order_count ?? 0);
      const averageOrderValue = orderCount > 0 ? totalSpend / orderCount : 0;
      const lastOrderDate = row.last_order_date ? new Date(row.last_order_date).toISOString() : null;
      const insight: CustomerInsight = {
        customerId: row.customer_id,
        branchId: row.branch_id,
        name: row.name,
        phoneNumber: row.phone_number,
        loyaltyPoints: Number(row.loyalty_points ?? 0),
        balanceDue: Number(row.balance_due ?? 0),
        totalSpend: Math.round(totalSpend * 100) / 100,
        lastOrderDate,
        orderCount,
        averageOrderValue: orderCount > 0 ? Math.round(averageOrderValue * 100) / 100 : 0,
        churnTier: "no_orders",
        preferredServices: [],
        recommendedAction: null,
        recommendedChannel: null,
        nextContactAt: null,
        lastActionAt: null,
        lastActionChannel: null,
        lastOutcome: null,
        planSource: "auto",
        rateLimitedUntil: null,
        suggestedAction: CHURN_RECOMMENDATIONS.no_orders.action,
        suggestedChannel: CHURN_RECOMMENDATIONS.no_orders.channel,
        suggestedNextContactAt: null,
        monthlySpend: [],
        topServices: [],
        topClothing: [],
      };
      insightsMap.set(insight.customerId, insight);
    }

    if (!insightsMap.size) {
      return [];
    }

    const customerIds = Array.from(insightsMap.keys());
    const idList = customerIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
    const customerOrderFilter = `AND o.customer_id IN (${idList})`;
    const monthlyCustomerFilter = `WHERE of.customer_id IN (${idList})`;

    const { rows: monthlyRows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      order_financials AS (
        SELECT
          o.customer_id,
          o.created_at,
          o.total::numeric AS total_value
        FROM orders o
        WHERE o.customer_id IS NOT NULL
          AND o.is_delivery_request = false
          AND o.payment_method <> 'pay_later'
          ${orderBranchFilter}
        UNION ALL
        SELECT
          o.customer_id,
          o.created_at,
          pl.amount::numeric AS total_value
        FROM orders o
        JOIN pay_later pl ON pl.order_id = o.id
        WHERE o.customer_id IS NOT NULL
          AND o.is_delivery_request = false
          AND o.payment_method = 'pay_later'
          ${orderBranchFilter}
      )
      SELECT
        of.customer_id,
        TO_CHAR(date_trunc('month', of.created_at), 'YYYY-MM') AS month,
        SUM(of.total_value) AS total,
        COUNT(*) AS order_count
      FROM order_financials of
      ${monthlyCustomerFilter}
      GROUP BY of.customer_id, month;
    `));

    for (const row of monthlyRows) {
      const insight = insightsMap.get(row.customer_id);
      if (!insight) continue;
      insight.monthlySpend.push({
        month: row.month,
        total: Number(row.total ?? 0),
        orderCount: Number(row.order_count ?? 0),
      });
    }

    const { rows: serviceRows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT
          o.id,
          o.customer_id,
          o.items,
          o.payment_method,
          o.is_delivery_request,
          o.branch_id
        FROM orders o
        WHERE o.customer_id IS NOT NULL
          AND o.is_delivery_request = false
          ${orderBranchFilter}
          ${customerOrderFilter}
      ),
      non_pay_later AS (
        SELECT
          o.customer_id,
          jt.service,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method <> 'pay_later'
      ),
      pay_later_orders AS (
        SELECT
          o.customer_id,
          jt.service,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN pay_later p ON p.order_id = o.id
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method = 'pay_later'
      )
      SELECT
        customer_id,
        COALESCE(service, 'Unknown Service') AS service,
        SUM(quantity) AS quantity,
        SUM(total) AS revenue
      FROM (
        SELECT customer_id, service, quantity, total FROM non_pay_later
        UNION ALL
        SELECT customer_id, service, quantity, total FROM pay_later_orders
      ) s
      GROUP BY customer_id, service;
    `));

    for (const row of serviceRows) {
      const insight = insightsMap.get(row.customer_id);
      if (!insight) continue;
      insight.topServices.push({
        service: row.service,
        quantity: Number(row.quantity ?? 0),
        revenue: Number(row.revenue ?? 0),
      });
    }

    const { rows: clothingRows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT
          o.id,
          o.customer_id,
          o.items,
          o.payment_method,
          o.is_delivery_request,
          o.branch_id
        FROM orders o
        WHERE o.customer_id IS NOT NULL
          AND o.is_delivery_request = false
          ${orderBranchFilter}
          ${customerOrderFilter}
      ),
      non_pay_later AS (
        SELECT
          o.customer_id,
          CONCAT_WS(' - ', jt.clothingItem, jt.service) AS item,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          clothingItem text,
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method <> 'pay_later'
      ),
      pay_later_orders AS (
        SELECT
          o.customer_id,
          CONCAT_WS(' - ', jt.clothingItem, jt.service) AS item,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN pay_later p ON p.order_id = o.id
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          clothingItem text,
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method = 'pay_later'
      )
      SELECT
        customer_id,
        COALESCE(item, 'Unknown Item') AS item,
        SUM(quantity) AS quantity,
        SUM(total) AS revenue
      FROM (
        SELECT customer_id, item, quantity, total FROM non_pay_later
        UNION ALL
        SELECT customer_id, item, quantity, total FROM pay_later_orders
      ) s
      GROUP BY customer_id, item;
    `));

    for (const row of clothingRows) {
      const insight = insightsMap.get(row.customer_id);
      if (!insight) continue;
      insight.topClothing.push({
        item: row.item,
        quantity: Number(row.quantity ?? 0),
        revenue: Number(row.revenue ?? 0),
      });
    }

    for (const insight of insightsMap.values()) {
      insight.monthlySpend.sort((a, b) => a.month.localeCompare(b.month));
      insight.topServices.sort((a, b) => b.revenue - a.revenue);
      insight.topClothing.sort((a, b) => b.revenue - a.revenue);
      insight.topServices = insight.topServices.slice(0, 5);
      insight.topClothing = insight.topClothing.slice(0, 5);
      insight.preferredServices = insight.topServices.slice(0, 3).map((svc) => svc.service);
    }

    const existingPlans = customerIds.length
      ? await db
          .select()
          .from(customerEngagementPlans)
          .where(inArray(customerEngagementPlans.customerId, customerIds))
      : [];

    const planMap = new Map(existingPlans.map((plan) => [plan.customerId, plan]));
    const planInserts: InsertCustomerEngagementPlan[] = [];
    const planUpdates: { id: string; data: Partial<InsertCustomerEngagementPlan> & {
      recommendedAction?: string | null;
      recommendedChannel?: string | null;
      nextContactAt?: Date | null;
    } }[] = [];

    for (const insight of insightsMap.values()) {
      const churnTier = computeChurnTier(insight.lastOrderDate, insight.orderCount);
      insight.churnTier = churnTier;
      const recommendation = CHURN_RECOMMENDATIONS[churnTier] ?? CHURN_RECOMMENDATIONS.new;
      insight.suggestedAction = recommendation.action;
      insight.suggestedChannel = recommendation.channel;
      const suggestedNextContact = computeSuggestedNextContact(recommendation.cadenceDays);
      insight.suggestedNextContactAt = suggestedNextContact ? suggestedNextContact.toISOString() : null;

      const existingPlan = planMap.get(insight.customerId);
      if (!existingPlan) {
        planInserts.push({
          customerId: insight.customerId,
          branchId: insight.branchId,
          churnTier,
          preferredServices: insight.preferredServices,
          recommendedAction: recommendation.action,
          recommendedChannel: recommendation.channel,
          nextContactAt: suggestedNextContact ?? null,
        });
        insight.recommendedAction = recommendation.action;
        insight.recommendedChannel = recommendation.channel;
        insight.nextContactAt = suggestedNextContact ? suggestedNextContact.toISOString() : null;
        insight.planSource = "auto";
        continue;
      }

      const planSource = existingPlan.source === "manual" ? "manual" : "auto";
      insight.planSource = planSource;
      const planPreferred = Array.isArray(existingPlan.preferredServices)
        ? (existingPlan.preferredServices as string[])
        : [];
      const preferredChanged = !arraysEqual(planPreferred, insight.preferredServices);
      const normalizedChannel =
        existingPlan.recommendedChannel === "sms" ||
        existingPlan.recommendedChannel === "email" ||
        existingPlan.recommendedChannel === "chat"
          ? existingPlan.recommendedChannel
          : null;
      const planNextContact = existingPlan.nextContactAt ? new Date(existingPlan.nextContactAt) : null;
      const nextContactChanged = (() => {
        if (!suggestedNextContact && !planNextContact) return false;
        if (!suggestedNextContact && planNextContact && planSource === "auto") return true;
        if (suggestedNextContact && !planNextContact) return true;
        if (suggestedNextContact && planNextContact) {
          return Math.abs(planNextContact.getTime() - suggestedNextContact.getTime()) > MS_IN_DAY / 2;
        }
        return false;
      })();

      const updatePayload: Partial<InsertCustomerEngagementPlan> & {
        recommendedAction?: string | null;
        recommendedChannel?: string | null;
        nextContactAt?: Date | null;
      } = {};

      if (existingPlan.churnTier !== churnTier) {
        updatePayload.churnTier = churnTier;
      }
      if (preferredChanged) {
        updatePayload.preferredServices = insight.preferredServices;
      }
      if (planSource === "auto") {
        if (existingPlan.recommendedAction !== recommendation.action) {
          updatePayload.recommendedAction = recommendation.action;
        }
        if (normalizedChannel !== recommendation.channel) {
          updatePayload.recommendedChannel = recommendation.channel;
        }
        if (nextContactChanged) {
          updatePayload.nextContactAt = suggestedNextContact ?? null;
        }
      }

      if (Object.keys(updatePayload).length) {
        planUpdates.push({ id: existingPlan.id, data: updatePayload });
      }

      const resolvedAction = existingPlan.recommendedAction ?? (planSource === "auto" ? recommendation.action : null);
      insight.recommendedAction = resolvedAction;
      insight.recommendedChannel = normalizedChannel ?? (planSource === "auto" ? recommendation.channel : null);
      insight.nextContactAt = planNextContact
        ? planNextContact.toISOString()
        : suggestedNextContact
        ? suggestedNextContact.toISOString()
        : null;
      insight.lastActionAt = existingPlan.lastActionAt ? new Date(existingPlan.lastActionAt).toISOString() : null;
      insight.lastActionChannel =
        existingPlan.lastActionChannel === "sms" ||
        existingPlan.lastActionChannel === "email" ||
        existingPlan.lastActionChannel === "chat"
          ? existingPlan.lastActionChannel
          : null;
      insight.lastOutcome = existingPlan.lastOutcome ?? null;
      insight.rateLimitedUntil = existingPlan.rateLimitedUntil
        ? new Date(existingPlan.rateLimitedUntil).toISOString()
        : null;
    }

    if (planInserts.length) {
      await db.insert(customerEngagementPlans).values(planInserts).onConflictDoNothing();
    }

    if (planUpdates.length) {
      await Promise.all(
        planUpdates.map(({ id, data }) => {
          const sanitized: Record<string, unknown> = { updatedAt: new Date() };
          for (const [key, value] of Object.entries(data)) {
            if (typeof value !== "undefined") {
              sanitized[key] = value;
            }
          }
          return db
            .update(customerEngagementPlans)
            .set(sanitized)
            .where(eq(customerEngagementPlans.id, id));
        }),
      );
    }

    return Array.from(insightsMap.values());
  }

  async getRevenueSummaryByDateRange(filter: ReportDateRangeFilter = {}): Promise<{
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    daily: { date: string; orders: number; revenue: number }[];
  }> {
    const whereClause = buildOrderDateFilter("o", filter);
    const { rows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT
          o.id,
          o.created_at::date AS order_date,
          o.created_at,
          o.payment_method,
          o.total::numeric AS order_total
        FROM orders o
        ${whereClause}
      ),
      resolved AS (
        SELECT
          o.id,
          o.order_date,
          CASE
            WHEN o.payment_method = 'pay_later' THEN COALESCE(p.amount, 0)::numeric
            ELSE o.order_total
          END AS revenue
        FROM base_orders o
        LEFT JOIN pay_later p ON p.order_id = o.id
      )
      SELECT
        order_date,
        COUNT(*) AS orders,
        SUM(revenue) AS revenue
      FROM resolved
      GROUP BY order_date
      ORDER BY order_date;
    `));

    const daily = rows.map((row: any) => ({
      date: row.order_date instanceof Date ? row.order_date.toISOString().split("T")[0] : row.order_date,
      orders: Number(row.orders ?? 0),
      revenue: Number(row.revenue ?? 0),
    }));

    const totalOrders = daily.reduce((acc, row) => acc + row.orders, 0);
    const totalRevenue = daily.reduce((acc, row) => acc + row.revenue, 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    return { totalOrders, totalRevenue, averageOrderValue, daily };
  }

  async getPaymentMethodBreakdown(filter: ReportDateRangeFilter = {}): Promise<{
    method: string;
    count: number;
    revenue: number;
  }[]> {
    const whereClause = buildOrderDateFilter("o", filter);
    const { rows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT
          o.id,
          o.payment_method,
          o.total::numeric AS order_total
        FROM orders o
        ${whereClause}
      ),
      resolved AS (
        SELECT
          COALESCE(o.payment_method, 'unknown') AS payment_method,
          CASE
            WHEN o.payment_method = 'pay_later' THEN COALESCE(p.amount, 0)::numeric
            ELSE o.order_total
          END AS revenue
        FROM base_orders o
        LEFT JOIN pay_later p ON p.order_id = o.id
      )
      SELECT
        payment_method AS method,
        COUNT(*) AS count,
        SUM(revenue) AS revenue
      FROM resolved
      GROUP BY payment_method
      ORDER BY revenue DESC;
    `));

    return rows.map((row: any) => ({
      method: row.method,
      count: Number(row.count ?? 0),
      revenue: Number(row.revenue ?? 0),
    }));
  }

  async getServiceBreakdown(filter: ReportDateRangeFilter = {}): Promise<{
    service: string;
    count: number;
    revenue: number;
  }[]> {
    const whereClause = buildOrderDateFilter("o", filter);
    const { rows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT o.id,
               o.items,
               o.payment_method,
               o.created_at,
               o.branch_id
        FROM orders o
        ${whereClause}
      ),
      non_pay_later AS (
        SELECT
          COALESCE(jt.service, 'Unknown Service') AS service,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method <> 'pay_later'
      ),
      pay_later_orders AS (
        SELECT
          COALESCE(jt.service, 'Unknown Service') AS service,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN pay_later p ON p.order_id = o.id
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method = 'pay_later'
      )
      SELECT
        service,
        SUM(quantity) AS count,
        SUM(total) AS revenue
      FROM (
        SELECT service, quantity, total FROM non_pay_later
        UNION ALL
        SELECT service, quantity, total FROM pay_later_orders
      ) s
      GROUP BY service
      ORDER BY revenue DESC;
    `));

    return rows.map((row: any) => ({
      service: row.service,
      count: Number(row.count ?? 0),
      revenue: Number(row.revenue ?? 0),
    }));
  }

  async getClothingBreakdown(filter: ReportDateRangeFilter = {}): Promise<{
    item: string;
    count: number;
    revenue: number;
  }[]> {
    const whereClause = buildOrderDateFilter("o", filter);
    const { rows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT o.id,
               o.items,
               o.payment_method,
               o.created_at,
               o.branch_id
        FROM orders o
        ${whereClause}
      ),
      non_pay_later AS (
        SELECT
          COALESCE(CONCAT_WS(' - ', jt.clothingItem, jt.service), 'Unknown Item') AS item,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          clothingItem text,
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method <> 'pay_later'
      ),
      pay_later_orders AS (
        SELECT
          COALESCE(CONCAT_WS(' - ', jt.clothingItem, jt.service), 'Unknown Item') AS item,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN pay_later p ON p.order_id = o.id
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          clothingItem text,
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method = 'pay_later'
          AND o.is_delivery_request = false
      )
      SELECT
        item,
        SUM(quantity) AS count,
        SUM(total) AS revenue
      FROM (
        SELECT item, quantity, total FROM non_pay_later
        UNION ALL
        SELECT item, quantity, total FROM pay_later_orders
      ) s
      GROUP BY item
      ORDER BY revenue DESC;
    `));

    return rows.map((row: any) => ({
      item: row.item,
      count: Number(row.count ?? 0),
      revenue: Number(row.revenue ?? 0),
    }));
  }

  async getOrderStats(range: string, branchId?: string): Promise<{ period: string; count: number; revenue: number }[]> {
    const formatMap: Record<string, string> = {
      daily: "%Y-%m-%d",
      weekly: "%x-%v",
      monthly: "%Y-%m",
      yearly: "%Y",
    };
    const intervalMap: Record<string, string> = {
      daily: "1 DAY",
      weekly: "7 DAY",
      monthly: "1 MONTH",
      yearly: "1 YEAR",
    };
    const format = formatMap[range] ?? "%Y-%m-%d";
    const interval = intervalMap[range] ?? "1 DAY";

    const branchFilter = branchId ? (assertUuid(branchId), `AND o.branch_id = '${branchId.replace(/'/g, "''")}'`) : "";
    const { rows } = await db.execute<any>(sql.raw(`
      SELECT period,
             SUM(count) AS count,
             SUM(revenue) AS revenue
      FROM (
        SELECT
          DATE_FORMAT(o.created_at, '${format}') AS period,
          1 AS count,
          o.total AS revenue
        FROM orders o
        WHERE o.created_at >= NOW() - INTERVAL ${interval} ${branchFilter}
          AND o.payment_method <> 'pay_later'
          AND o.is_delivery_request = false

        UNION ALL

        SELECT
          DATE_FORMAT(o.created_at, '${format}') AS period,
          1 AS count,
          p.amount AS revenue
        FROM orders o
        JOIN (${PAY_LATER_AGGREGATE}) p ON p.order_id = o.id
        WHERE o.created_at >= NOW() - INTERVAL ${interval} ${branchFilter}
          AND o.payment_method = 'pay_later'
          AND o.is_delivery_request = false
      ) s
      GROUP BY period
      ORDER BY period;
    `));

    return rows.map((r: any) => ({
      period: r.period,
      count: Number(r.count),
      revenue: Number(r.revenue),
    }));
  }

  async getTopServices(range: string, branchId?: string): Promise<{ service: string; count: number; revenue: number }[]> {
    const intervalMap: Record<string, string> = {
      daily: "1 DAY",
      weekly: "7 DAY",
      monthly: "1 MONTH",
      yearly: "1 YEAR",
    };
    const interval = intervalMap[range] ?? "1 DAY";

    const branchFilter = branchId
      ? (assertUuid(branchId), `AND o.branch_id = '${branchId.replace(/'/g, "''")}'`)
      : "";
    const { rows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT o.id,
               o.items,
               o.payment_method,
               o.created_at,
               o.is_delivery_request,
               o.branch_id
        FROM orders o
        WHERE o.created_at >= NOW() - INTERVAL '${interval}'
          AND o.is_delivery_request = false
          ${branchFilter}
      ),
      non_pay_later AS (
        SELECT
          jt.service,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method <> 'pay_later'
      ),
      pay_later_orders AS (
        SELECT
          jt.service,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN pay_later p ON p.order_id = o.id
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method = 'pay_later'
          AND o.is_delivery_request = false
      )
      SELECT service,
             SUM(quantity) AS count,
             SUM(total) AS revenue
      FROM (
        SELECT service, quantity, total FROM non_pay_later
        UNION ALL
        SELECT service, quantity, total FROM pay_later_orders
      ) s
      GROUP BY service
      ORDER BY revenue DESC
      LIMIT 10;
    `));

    return rows.map((r: any) => ({
      service: r.service,
      count: Number(r.count),
      revenue: Number(r.revenue),
    }));
  }

  async getTopProducts(range: string, branchId?: string): Promise<{ product: string; count: number; revenue: number }[]> {
    const intervalMap: Record<string, string> = {
      daily: "1 DAY",
      weekly: "7 DAY",
      monthly: "1 MONTH",
      yearly: "1 YEAR",
    };
    const interval = intervalMap[range] ?? "1 DAY";

    const branchFilter = branchId
      ? (assertUuid(branchId), `AND o.branch_id = '${branchId.replace(/'/g, "''")}'`)
      : "";
    const { rows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT o.id,
               o.items,
               o.payment_method,
               o.created_at,
               o.is_delivery_request,
               o.branch_id
        FROM orders o
        WHERE o.created_at >= NOW() - INTERVAL '${interval}'
          AND o.is_delivery_request = false
          ${branchFilter}
      ),
      non_pay_later AS (
        SELECT
          jt.clothingItem AS product,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          clothingItem text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method <> 'pay_later'
      ),
      pay_later_orders AS (
        SELECT
          jt.clothingItem AS product,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN pay_later p ON p.order_id = o.id
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          clothingItem text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method = 'pay_later'
          AND o.is_delivery_request = false
      )
      SELECT product,
             SUM(quantity) AS count,
             SUM(total) AS revenue
      FROM (
        SELECT product, quantity, total FROM non_pay_later
        UNION ALL
        SELECT product, quantity, total FROM pay_later_orders
      ) s
      GROUP BY product
      ORDER BY count DESC
      LIMIT 10;
    `));

    return rows.map((r: any) => ({
      product: r.product,
      count: Number(r.count),
      revenue: Number(r.revenue),
    }));
  }

  async getTopPackages(range: string, branchId?: string): Promise<{ pkg: string; count: number; revenue: number }[]> {
    const intervalMap: Record<string, string> = {
      daily: "1 DAY",
      weekly: "7 DAY",
      monthly: "1 MONTH",
      yearly: "1 YEAR",
    };
    const interval = intervalMap[range] ?? "1 DAY";

    // For branch scoping: include order-linked payments for that branch OR package payments (orderId null) for customers of that branch
    const branchJoinFilter = branchId
      ? (assertUuid(branchId), `AND (o.branch_id = '${branchId.replace(/'/g, "''")}' OR (p.order_id IS NULL AND c.branch_id = '${branchId.replace(/'/g, "''")}'))`)
      : "";

    const { rows } = await db.execute<any>(sql.raw(`
      WITH filtered AS (
        SELECT p.*
        FROM payments p
        LEFT JOIN orders o ON p.order_id = o.id
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.created_at >= NOW() - INTERVAL ${interval}
          ${branchJoinFilter}
          AND p.notes ILIKE 'Package purchase:%'
      ),
      extracted AS (
        SELECT
          COALESCE(
            (
              SELECT name_en FROM packages pkg
              WHERE pkg.id = (
                SELECT (regexp_matches(p.notes, 'Package ID: ([0-9a-fA-F\-]{36})'))[1]
              )::uuid
            ),
            NULLIF(TRIM(BOTH ' ' FROM (SUBSTRING(p.notes FROM 'Package purchase: ([^\(]+)'))), '')
          ) AS package_name,
          p.amount::numeric AS revenue
        FROM filtered p
      )
      SELECT COALESCE(package_name, 'Unknown') AS pkg,
             COUNT(*) AS count,
             SUM(revenue) AS revenue
      FROM extracted
      GROUP BY COALESCE(package_name, 'Unknown')
      ORDER BY revenue DESC
      LIMIT 10;
    `));

    return rows.map((r: any) => ({
      pkg: r.pkg,
      count: Number(r.count),
      revenue: Number(r.revenue),
    }));
  }

  async getClothingItemStats(
    range: string,
    branchId?: string,
    limit = 10,
  ): Promise<{ item: string; count: number; revenue: number }[]> {
    const intervalMap: Record<string, string> = {
      daily: "1 DAY",
      weekly: "7 DAY",
      monthly: "1 MONTH",
      yearly: "1 YEAR",
    };
    const interval = intervalMap[range] ?? "1 DAY";

    const branchFilter = branchId
      ? (assertUuid(branchId), `AND o.branch_id = '${branchId.replace(/'/g, "''")}'`)
      : "";
    const { rows } = await db.execute<any>(sql.raw(`
      WITH pay_later AS (${PAY_LATER_AGGREGATE}),
      base_orders AS (
        SELECT o.id,
               o.items,
               o.payment_method,
               o.created_at,
               o.is_delivery_request,
               o.branch_id
        FROM orders o
        WHERE o.created_at >= NOW() - INTERVAL '${interval}'
          AND o.is_delivery_request = false
          ${branchFilter}
      ),
      non_pay_later AS (
        SELECT
          CONCAT_WS(' - ', jt.clothingItem, jt.service) AS item,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          clothingItem text,
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method <> 'pay_later'
      ),
      pay_later_orders AS (
        SELECT
          CONCAT_WS(' - ', jt.clothingItem, jt.service) AS item,
          jt.quantity,
          jt.total
        FROM base_orders o
        JOIN pay_later p ON p.order_id = o.id
        JOIN LATERAL jsonb_to_recordset(o.items::jsonb) AS jt(
          clothingItem text,
          service text,
          quantity int,
          total numeric
        ) ON TRUE
        WHERE o.payment_method = 'pay_later'
          AND o.is_delivery_request = false
      )
      SELECT item,
             SUM(quantity) AS count,
             SUM(total) AS revenue
      FROM (
        SELECT item, quantity, total FROM non_pay_later
        UNION ALL
        SELECT item, quantity, total FROM pay_later_orders
      ) s
      GROUP BY item
      ORDER BY revenue DESC
      LIMIT ${limit};
    `));

    return rows.map((r: any) => ({
      item: r.item,
      count: Number(r.count),
      revenue: Number(r.revenue),
    }));
  }

  async getSalesSummary(range: string, branchId?: string): Promise<{
    totalOrders: number;
    totalRevenue: number;
    stats: { period: string; count: number; revenue: number }[];
  }> {
    const stats = await this.getOrderStats(range, branchId);
    const totalOrders = stats.reduce((acc, r) => acc + r.count, 0);
    const totalRevenue = stats.reduce((acc, r) => acc + r.revenue, 0);
    return { totalOrders, totalRevenue, stats };
  }

  // Coupon methods
  async getCoupons(branchId?: string): Promise<Coupon[]> {
    return await this.withTenant(branchId, async (tx) => {
      if (branchId) {
        return await tx.select().from(coupons).where(eq(coupons.branchId, branchId));
      }
      return await tx.select().from(coupons);
    });
  }

  async getCoupon(id: string, branchId?: string): Promise<Coupon | undefined> {
    const conditions = [eq(coupons.id, id)];
    if (branchId) conditions.push(eq(coupons.branchId, branchId));
    
    const [coupon] = await (await this.withTenant(branchId, async (tx) => tx.select().from(coupons).where(and(...conditions)))) as any;
    return coupon || undefined;
  }

  async getCouponByCode(code: string, branchId?: string): Promise<Coupon | undefined> {
    const conditions = [eq(coupons.code, code)];
    if (branchId) conditions.push(eq(coupons.branchId, branchId));
    
    const [coupon] = await (await this.withTenant(branchId, async (tx) => tx.select().from(coupons).where(and(...conditions)))) as any;
    return coupon || undefined;
  }

  async createCoupon(coupon: InsertCoupon, branchId: string, createdBy: string, clothingItemIds?: string[], serviceIds?: string[]): Promise<Coupon> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.branch_id', ${branchId}, true)`);
      const [newCoupon] = await tx
        .insert(coupons)
        .values({ ...coupon, branchId, createdBy })
        .returning();

      // Add clothing item restrictions if specified
      if (clothingItemIds && clothingItemIds.length > 0) {
        const clothingItemValues = clothingItemIds.map(itemId => ({
          couponId: newCoupon.id,
          clothingItemId: itemId,
        }));
        await tx.insert(couponClothingItems).values(clothingItemValues);
      }

      // Add service restrictions if specified
      if (serviceIds && serviceIds.length > 0) {
        const serviceValues = serviceIds.map(serviceId => ({
          couponId: newCoupon.id,
          serviceId: serviceId,
        }));
        await tx.insert(couponServices).values(serviceValues);
      }

      return newCoupon;
    });
  }

  async updateCoupon(id: string, coupon: Partial<InsertCoupon>, branchId?: string, clothingItemIds?: string[], serviceIds?: string[]): Promise<Coupon | undefined> {
    return await db.transaction(async (tx) => {
      if (branchId) await tx.execute(sql`SELECT set_config('app.branch_id', ${branchId}, true)`);
      const conditions = [eq(coupons.id, id)];
      if (branchId) conditions.push(eq(coupons.branchId, branchId));
      
      const [updated] = await tx
        .update(coupons)
        .set({ ...coupon, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(and(...conditions))
        .returning();

      if (!updated) return undefined;

      // Update clothing item restrictions
      await tx.delete(couponClothingItems).where(eq(couponClothingItems.couponId, id));
      if (clothingItemIds && clothingItemIds.length > 0) {
        const clothingItemValues = clothingItemIds.map(itemId => ({
          couponId: id,
          clothingItemId: itemId,
        }));
        await tx.insert(couponClothingItems).values(clothingItemValues);
      }

      // Update service restrictions
      await tx.delete(couponServices).where(eq(couponServices.couponId, id));
      if (serviceIds && serviceIds.length > 0) {
        const serviceValues = serviceIds.map(serviceId => ({
          couponId: id,
          serviceId: serviceId,
        }));
        await tx.insert(couponServices).values(serviceValues);
      }

      return updated;
    });
  }

  async deleteCoupon(id: string, branchId?: string): Promise<boolean> {
    const conditions = [eq(coupons.id, id)];
    if (branchId) conditions.push(eq(coupons.branchId, branchId));
    
    const result = await this.withTenant(branchId, async (tx) => await tx.delete(coupons).where(and(...conditions)));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async applyCoupon(couponId: string, discountApplied: number, orderId?: string, customerId?: string): Promise<CouponUsage> {
    return await db.transaction(async (tx) => {
      // Increment coupon usage count
      await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(eq(coupons.id, couponId));

      // Record usage
      const [usage] = await tx
        .insert(couponUsage)
        .values({
          couponId,
          orderId,
          customerId,
          discountApplied: discountApplied.toString(),
        })
        .returning();

      return usage;
    });
  }

  async validateCoupon(code: string, branchId: string, cartItems: any[]): Promise<{ valid: boolean; coupon?: Coupon; discount?: number; message?: string; applicableItems?: any[] }> {
    const coupon = await this.getCouponByCode(code, branchId);
    
    if (!coupon) {
      return { valid: false, message: "Coupon code not found" };
    }

    if (!coupon.isActive) {
      return { valid: false, message: "Coupon is not active" };
    }

    const now = new Date();
    if (now < new Date(coupon.validFrom)) {
      return { valid: false, message: "Coupon is not yet valid" };
    }

    if (coupon.validUntil && now > new Date(coupon.validUntil)) {
      return { valid: false, message: "Coupon has expired" };
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return { valid: false, message: "Coupon usage limit reached" };
    }

    // Determine applicable items based on coupon type
    let applicableItems = cartItems;
    let orderTotal = cartItems.reduce((total, item) => total + item.total, 0);

    if (coupon.applicationType === "specific_items") {
      const couponItems = await this.getCouponClothingItems(coupon.id);
      const allowedItemIds = couponItems.map(ci => ci.clothingItemId);
      applicableItems = cartItems.filter(item => allowedItemIds.includes(item.clothingItem?.id));
      
      if (applicableItems.length === 0) {
        return { valid: false, message: "Coupon not applicable to any items in cart" };
      }
      orderTotal = applicableItems.reduce((total, item) => total + item.total, 0);
    } else if (coupon.applicationType === "specific_services") {
      const couponServices = await this.getCouponServices(coupon.id);
      const allowedServiceIds = couponServices.map(cs => cs.serviceId);
      applicableItems = cartItems.filter(item => allowedServiceIds.includes(item.service?.id));
      
      if (applicableItems.length === 0) {
        return { valid: false, message: "Coupon not applicable to any services in cart" };
      }
      orderTotal = applicableItems.reduce((total, item) => total + item.total, 0);
    }

    const minAmount = parseFloat(coupon.minimumAmount || "0");
    if (orderTotal < minAmount) {
      return { valid: false, message: `Minimum order amount is ${minAmount}` };
    }

    let discount = 0;
    const discountValue = parseFloat(coupon.discountValue);
    
    if (coupon.discountType === "percentage") {
      discount = (orderTotal * discountValue) / 100;
    } else {
      discount = discountValue;
    }

    // Apply maximum discount limit
    if (coupon.maximumDiscount) {
      const maxDiscount = parseFloat(coupon.maximumDiscount);
      discount = Math.min(discount, maxDiscount);
    }

    // Ensure discount doesn't exceed applicable total
    discount = Math.min(discount, orderTotal);

    return { valid: true, coupon, discount, applicableItems };
  }

  async getCouponClothingItems(couponId: string): Promise<CouponClothingItem[]> {
    return await db.select().from(couponClothingItems).where(eq(couponClothingItems.couponId, couponId));
  }

  async getCouponServices(couponId: string): Promise<CouponService[]> {
    return await db.select().from(couponServices).where(eq(couponServices.couponId, couponId));
  }

  // Branch QR Code methods
  async getBranchQRCodes(branchId: string): Promise<BranchQRCode[]> {
    return await this.withTenant(branchId, async (tx) => {
      return await tx
        .select()
        .from(branchQRCodes)
        .where(eq(branchQRCodes.branchId, branchId))
        .orderBy(desc(branchQRCodes.createdAt));
    });
  }

  async getActiveBranchQRCode(branchId: string): Promise<BranchQRCode | undefined> {
    const [qr] = await db
      .select()
      .from(branchQRCodes)
      .where(and(eq(branchQRCodes.branchId, branchId), eq(branchQRCodes.isActive, true)))
      .orderBy(desc(branchQRCodes.createdAt))
      .limit(1);
    return qr;
  }

  async getBranchQRCodeByCode(qrCode: string): Promise<BranchQRCode | undefined> {
    const [qr] = await db
      .select()
      .from(branchQRCodes)
      .where(eq(branchQRCodes.qrCode, qrCode))
      .limit(1);
    return qr;
  }

  async createBranchQRCode(qr: InsertBranchQRCode): Promise<BranchQRCode> {
    const [created] = await db.insert(branchQRCodes).values(qr).returning();
    return created;
  }

  async deactivateBranchQRCode(id: string, deactivatedBy: string): Promise<BranchQRCode | undefined> {
    const [updated] = await db
      .update(branchQRCodes)
      .set({
        isActive: false,
        deactivatedAt: sql`CURRENT_TIMESTAMP`,
        deactivatedBy,
      })
      .where(eq(branchQRCodes.id, id))
      .returning();
    return updated ?? undefined;
  }

  async regenerateBranchQRCode(branchId: string, createdBy: string): Promise<BranchQRCode> {
    return await db.transaction(async (tx) => {
      await tx
        .update(branchQRCodes)
        .set({
          isActive: false,
          deactivatedAt: sql`CURRENT_TIMESTAMP`,
          deactivatedBy: createdBy,
        })
        .where(and(eq(branchQRCodes.branchId, branchId), eq(branchQRCodes.isActive, true)));

      const [created] = await tx
        .insert(branchQRCodes)
        .values({
          branchId,
          qrCode: randomUUID().replace(/-/g, ""),
          isActive: true,
          createdBy,
        })
        .returning();

      return created;
    });
  }

  // Branch customization methods
  async getBranchCustomization(branchId: string): Promise<BranchCustomization | null> {
    const [result] = await db
      .select()
      .from(branchCustomizationTable)
      .where(eq(branchCustomizationTable.branchId, branchId));
    return result || null;
  }

  async updateBranchCustomization(branchId: string, customization: Partial<BranchCustomizationInsert>): Promise<BranchCustomization> {
    const existing = await this.getBranchCustomization(branchId);
    
    if (existing) {
      const { socialMediaLinks, ...restCustomization } = customization;
      const [updated] = await db
        .update(branchCustomizationTable)
        .set({ 
          ...restCustomization, 
          updatedAt: new Date(),
          ...(socialMediaLinks && {
            socialMediaLinks: {
              facebook: socialMediaLinks.facebook as string | undefined,
              instagram: socialMediaLinks.instagram as string | undefined,
              twitter: socialMediaLinks.twitter as string | undefined,
              whatsapp: socialMediaLinks.whatsapp as string | undefined,
            }
          })
        })
        .where(eq(branchCustomizationTable.branchId, branchId))
        .returning();
      return updated;
    } else {
      // Create new customization if none exists
      return await this.createBranchCustomization({
        branchId,
        ...customization,
      } as BranchCustomizationInsert);
    }
  }

  async createBranchCustomization(customization: BranchCustomizationInsert): Promise<BranchCustomization> {
    const [created] = await db
      .insert(branchCustomizationTable)
      .values(customization as any)
      .returning();
    return created;
  }

  // Branch Delivery Settings
  async getBranchDeliverySettings(branchId: string): Promise<BranchDeliverySettings | undefined> {
    const [existing] = await db
      .select()
      .from(branchDeliverySettings)
      .where(eq(branchDeliverySettings.branchId, branchId));
    if (existing) return existing as any;
    // Create default settings lazily if none exist
    const [created] = await db
      .insert(branchDeliverySettings)
      .values({ branchId, deliveryEnabled: false } as any)
      .onConflictDoNothing()
      .returning();
    return created as any;
  }

  async createBranchDeliverySettings(settings: InsertBranchDeliverySettings): Promise<BranchDeliverySettings> {
    const [created] = await db
      .insert(branchDeliverySettings)
      .values(settings as any)
      .returning();
    return created as any;
  }

  async updateBranchDeliverySettings(
    branchId: string,
    settings: Partial<InsertBranchDeliverySettings>,
  ): Promise<BranchDeliverySettings | undefined> {
    const [existing] = await db
      .select()
      .from(branchDeliverySettings)
      .where(eq(branchDeliverySettings.branchId, branchId));

    const updateData: any = { ...settings, updatedAt: new Date() };
    if (existing) {
      const [updated] = await db
        .update(branchDeliverySettings)
        .set(updateData)
        .where(eq(branchDeliverySettings.branchId, branchId))
        .returning();
      return updated as any;
    } else {
      const [created] = await db
        .insert(branchDeliverySettings)
        .values({ branchId, ...settings } as any)
        .returning();
      return created as any;
    }
  }

  // Order status management
  async updateOrderStatus(
    orderId: string,
    status: string,
    options: { actor?: string; notes?: string } = {},
  ): Promise<Order | undefined> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ status: orders.status, branchId: orders.branchId })
        .from(orders)
        .where(eq(orders.id, orderId));

      if (!existing) return undefined;

      if (existing.branchId) {
        await tx.execute(sql`SELECT set_config('app.branch_id', ${existing.branchId}, true)`);
      }

      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (options.notes) {
        updateData.notes = options.notes;
      }

      const [updated] = await tx
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, orderId))
        .returning();

      if (updated && existing.status !== status) {
        await this.recordStatusEvent(
          tx,
          orderId,
          `order:${status}`,
          options.actor || null,
        );
      }

      return updated || undefined;
    });
  }

  async getDeliveryOrderRequests(branchId?: string): Promise<(Order & { delivery: DeliveryOrder })[]> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [eq(orders.isDeliveryRequest, true)] as any[];
      if (branchId) conditions.push(eq(orders.branchId, branchId));

      const results = await tx
        .select({ order: orders, delivery: deliveryOrders })
        .from(orders)
        .innerJoin(deliveryOrders, eq(deliveryOrders.orderId, orders.id))
        .where(and(...conditions));

      return (results as any[]).map((row: any) => ({ ...row.order, delivery: row.delivery }));
    });
  }

  async acceptDeliveryOrderRequest(id: string, actor?: string): Promise<Order | undefined> {
    return await db.transaction(async (tx) => {
      if (typeof (tx as any).execute === 'function') {
        // Fetch branchId first, then set RLS context with set_config
        const [o] = await tx.select({ branchId: orders.branchId }).from(orders).where(eq(orders.id, id));
        if (o?.branchId) {
          await (tx as any).execute(sql`SELECT set_config('app.branch_id', ${o.branchId}, true)`);
        }
      }
      const [existingDelivery] = await tx
        .select({ status: deliveryOrders.deliveryStatus })
        .from(deliveryOrders)
        .where(eq(deliveryOrders.orderId, id));

      const [updated] = await tx
        .update(orders)
        .set({ isDeliveryRequest: false, updatedAt: new Date() })
        .where(eq(orders.id, id))
        .returning();

      if (!updated) return undefined;

      await tx
        .update(deliveryOrders)
        .set({ deliveryStatus: "accepted", updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(deliveryOrders.orderId, id))
        .returning();

      if (existingDelivery?.status !== "accepted") {
        await this.recordStatusEvent(
          tx,
          id,
          "delivery:accepted",
          actor || null,
        );
      }

      return updated;
    });
  }

  async getDeliveryOrders(
    branchId?: string,
    status?: DeliveryStatus,
  ): Promise<(DeliveryOrder & { order: Order })[]> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [eq(orders.isDeliveryRequest, false)] as any[];
      if (branchId) conditions.push(eq(orders.branchId, branchId));
      if (status) conditions.push(eq(deliveryOrders.deliveryStatus, status));

      const results = await tx
        .select({ order: orders, delivery: deliveryOrders })
        .from(deliveryOrders)
        .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
        .where(and(...conditions));

      return (results as any[]).map((row: any) => ({ ...row.delivery, order: row.order }));
    });
  }

  async getDeliveryOrdersByStatus(
    status: string,
    branchId?: string,
  ): Promise<(DeliveryOrder & { order: Order })[]> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [
        eq(deliveryOrders.deliveryStatus, status as any),
        eq(orders.isDeliveryRequest, false),
      ] as any[];
      if (branchId) conditions.push(eq(orders.branchId, branchId));

      const results = await tx
        .select({ order: orders, delivery: deliveryOrders })
        .from(deliveryOrders)
        .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
        .where(and(...conditions));

      return (results as any[]).map((row: any) => ({ ...row.delivery, order: row.order }));
    });
  }

  async getDeliveryOrdersByDriver(
    driverId: string,
    branchId?: string,
  ): Promise<(DeliveryOrder & { order: Order })[]> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions = [
        eq(deliveryOrders.driverId, driverId),
        eq(orders.isDeliveryRequest, false),
      ] as any[];
      if (branchId) conditions.push(eq(orders.branchId, branchId));

      const results = await tx
        .select({ order: orders, delivery: deliveryOrders })
        .from(deliveryOrders)
        .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
        .where(and(...conditions));

      return (results as any[]).map((row: any) => ({ ...row.delivery, order: row.order }));
    });
  }

  async assignDeliveryOrder(
    orderId: string,
    driverId: string,
  ): Promise<(DeliveryOrder & { order: Order }) | undefined> {
    return await db.transaction(async (tx) => {
      if (typeof (tx as any).execute === 'function') {
        const [o] = await tx.select({ branchId: orders.branchId }).from(orders).where(eq(orders.id, orderId));
        if (o?.branchId) {
          await (tx as any).execute(sql`SELECT set_config('app.branch_id', ${o.branchId}, true)`);
        }
      }
      const [existing] = await tx
        .select({ order: orders, delivery: deliveryOrders })
        .from(deliveryOrders)
        .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
        .where(
          and(
            eq(deliveryOrders.orderId, orderId),
            eq(orders.isDeliveryRequest, false),
          ),
        );
      if (!existing) return undefined;

      const [updated] = await tx
        .update(deliveryOrders)
        .set({ driverId, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(deliveryOrders.id, existing.delivery.id))
        .returning();

      return { ...updated, order: existing.order };
    });
  }

  async updateDeliveryStatus(
    orderId: string,
    status: DeliveryStatus,
    actor?: string,
  ): Promise<(DeliveryOrder & { order: Order }) | undefined> {
    return await db.transaction(async (tx) => {
      if (typeof (tx as any).execute === 'function') {
        const [o] = await tx.select({ branchId: orders.branchId }).from(orders).where(eq(orders.id, orderId));
        if (o?.branchId) {
          await (tx as any).execute(sql`SELECT set_config('app.branch_id', ${o.branchId}, true)`);
        }
      }
      const [existing] = await tx
        .select({ order: orders, delivery: deliveryOrders })
        .from(deliveryOrders)
        .innerJoin(orders, eq(deliveryOrders.orderId, orders.id))
        .where(
          and(
            eq(deliveryOrders.orderId, orderId),
            eq(orders.isDeliveryRequest, false),
          ),
        );
      if (!existing) return undefined;

      const [updated] = await tx
        .update(deliveryOrders)
        .set({ deliveryStatus: status, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(deliveryOrders.id, existing.delivery.id))
        .returning();

      if (updated && existing.delivery.deliveryStatus !== status) {
        await this.recordStatusEvent(
          tx,
          orderId,
          `delivery:${status}`,
          actor || null,
        );
      }

      return { ...updated, order: existing.order };
    });
  }

  async updateDriverLocation(driverId: string, lat: number, lng: number): Promise<DriverLocationSnapshot> {
    const recordedAt = new Date();
    const [row] = await db
      .insert(driverLocations)
      .values({
        driverId,
        lat: lat.toString(),
        lng: lng.toString(),
        recordedAt,
      })
      .onConflictDoUpdate({
        target: [driverLocations.driverId, driverLocations.recordedAt],
        set: {
          lat: lat.toString(),
          lng: lng.toString(),
        },
      })
      .returning({
        driverId: driverLocations.driverId,
        lat: driverLocations.lat,
        lng: driverLocations.lng,
        recordedAt: driverLocations.recordedAt,
      });

    const inserted =
      row ?? ({ driverId, lat: lat.toString(), lng: lng.toString(), recordedAt } as DriverLocation);

    const cutoff = new Date(Date.now() - DRIVER_LOCATION_RETENTION_MINUTES * 60 * 1000);
    await db.delete(driverLocations).where(lt(driverLocations.recordedAt, cutoff));

    return {
      driverId: inserted.driverId,
      lat: Number(inserted.lat),
      lng: Number(inserted.lng),
      timestamp: inserted.recordedAt,
    };
  }

  async getLatestDriverLocations(driverIds?: string[]): Promise<DriverLocationSnapshot[]> {
    if (driverIds && driverIds.length === 0) {
      return [];
    }

    const filter = driverIds?.length
      ? sql`WHERE driver_id IN (${sql.join(driverIds.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

    const result = await db.execute(
      sql`SELECT DISTINCT ON (driver_id)
        driver_id,
        lat,
        lng,
        recorded_at
      FROM driver_locations
      ${filter}
      ORDER BY driver_id, recorded_at DESC`,
    );

    return (result.rows as Array<{ driver_id: string; lat: string; lng: string; recorded_at: Date }>).map(
      (row) => ({
        driverId: row.driver_id,
        lat: Number(row.lat),
        lng: Number(row.lng),
        timestamp: row.recorded_at,
      }),
    );
  }

  async getLatestDriverLocation(driverId: string): Promise<DriverLocationSnapshot | undefined> {
    const result = await db.execute(
      sql`SELECT driver_id, lat, lng, recorded_at
      FROM driver_locations
      WHERE driver_id = ${driverId}
      ORDER BY recorded_at DESC
      LIMIT 1`,
    );

    const row = (result.rows as Array<{ driver_id: string; lat: string; lng: string; recorded_at: Date }>)[0];
    if (!row) return undefined;
    return {
      driverId: row.driver_id,
      lat: Number(row.lat),
      lng: Number(row.lng),
      timestamp: row.recorded_at,
    };
  }

  async getDriverLocationHistory(
    driverId: string,
    options: { limit?: number; sinceMinutes?: number } = {},
  ): Promise<DriverLocationSnapshot[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
    const conditions: any[] = [eq(driverLocations.driverId, driverId)];
    if (options.sinceMinutes && options.sinceMinutes > 0) {
      const since = new Date(Date.now() - options.sinceMinutes * 60 * 1000);
      conditions.push(gte(driverLocations.recordedAt, since));
    }

    const rows = await db
      .select({
        driverId: driverLocations.driverId,
        lat: driverLocations.lat,
        lng: driverLocations.lng,
        recordedAt: driverLocations.recordedAt,
      })
      .from(driverLocations)
      .where(and(...conditions))
      .orderBy(desc(driverLocations.recordedAt))
      .limit(limit);

    return rows.map((row) => ({
      driverId: row.driverId,
      lat: Number(row.lat),
      lng: Number(row.lng),
      timestamp: row.recordedAt,
    }));
  }

  async getDeliveryTrackingSnapshot(orderId: string): Promise<DeliveryTrackingSnapshot | null> {
    const [row] = await db
      .select({
        delivery: deliveryOrders,
        deliveryAddress: customerAddresses,
      })
      .from(deliveryOrders)
      .leftJoin(customerAddresses, eq(deliveryOrders.deliveryAddressId, customerAddresses.id))
      .where(eq(deliveryOrders.orderId, orderId))
      .limit(1);

    if (!row) {
      return null;
    }

    const delivery = row.delivery;
    const address = row.deliveryAddress;
    const deliveryLocation =
      address?.lat != null && address?.lng != null
        ? {
            lat: Number(address.lat),
            lng: Number(address.lng),
          }
        : null;

    let driverLocation: DriverLocationSnapshot | null = null;
    if (delivery.driverId) {
      driverLocation = (await this.getLatestDriverLocation(delivery.driverId)) ?? null;
    }

    let distanceKm: number | null = null;
    let etaMinutes: number | null = null;
    if (driverLocation && deliveryLocation) {
      distanceKm = haversineDistance(
        driverLocation.lat,
        driverLocation.lng,
        deliveryLocation.lat,
        deliveryLocation.lng,
      );
      distanceKm = Math.round(distanceKm * 100) / 100;
      etaMinutes = distanceKm > 0 ? Math.round(((distanceKm / AVERAGE_DRIVER_SPEED_KMH) * 60 + Number.EPSILON) * 10) / 10 : 0;
    }

    return {
      distanceKm,
      etaMinutes,
      driverLocation,
      deliveryLocation,
    };
  }

  async getOrdersByBranch(branchId: string, options: { status?: string; limit?: number } = {}): Promise<Order[]> {
    let whereClause = and(eq(orders.branchId, branchId), eq(orders.isDeliveryRequest, false));

    if (options.status) {
      whereClause = and(
        eq(orders.branchId, branchId),
        eq(orders.status, options.status as any),
        eq(orders.isDeliveryRequest, false),
      ) as any;
    }

    const query = db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt));

    if (options.limit) {
      query.limit(options.limit);
    }

    return await query;
  }

  // Customer Dashboard settings and ads
  async getCustomerDashboardSettings(branchId: string): Promise<CustomerDashboardSettings | undefined> {
    const [row] = await db.select().from(customerDashboardSettings).where(eq(customerDashboardSettings.branchId, branchId));
    return row as any;
  }

  async updateCustomerDashboardSettings(branchId: string, settings: Partial<InsertCustomerDashboardSettings>): Promise<CustomerDashboardSettings> {
    const [existing] = await db.select().from(customerDashboardSettings).where(eq(customerDashboardSettings.branchId, branchId));
    const updateData: any = { ...settings, updatedAt: new Date() };
    if (existing) {
      const [updated] = await db.update(customerDashboardSettings).set(updateData).where(eq(customerDashboardSettings.branchId, branchId)).returning();
      return updated as any;
    } else {
      const [created] = await db.insert(customerDashboardSettings).values({ branchId, ...settings } as any).returning();
      return created as any;
    }
  }

  async getBranchAds(branchId: string): Promise<BranchAd[]> {
    const rows = await db.select().from(branchAds).where(eq(branchAds.branchId, branchId));
    return rows as any;
  }

  async createBranchAd(ad: InsertBranchAd): Promise<BranchAd> {
    const [created] = await db.insert(branchAds).values(ad as any).returning();
    return created as any;
  }

  async updateBranchAd(id: string, ad: Partial<InsertBranchAd>): Promise<BranchAd | undefined> {
    const [updated] = await db.update(branchAds).set({ ...(ad as any), updatedAt: new Date() }).where(eq(branchAds.id, id)).returning();
    return updated as any;
  }

  async deleteBranchAd(id: string, branchId?: string): Promise<boolean> {
    const conditions = [eq(branchAds.id, id)] as any[];
    if (branchId) conditions.push(eq(branchAds.branchId, branchId));
    const result = await db.delete(branchAds).where(and(...conditions));
    return (result as any).rowCount ? (result as any).rowCount > 0 : true;
  }

  async getActiveAds(branchId: string): Promise<BranchAd[]> {
    const now = new Date();
    const rows = await db
      .select()
      .from(branchAds)
      .where(and(
        eq(branchAds.branchId, branchId),
        eq(branchAds.isActive, true),
      ))
      .orderBy(desc(branchAds.createdAt));
    return (rows as any).filter((ad: any) => {
      const s = ad.startsAt ? new Date(ad.startsAt) : null;
      const e = ad.endsAt ? new Date(ad.endsAt) : null;
      return (!s || s <= now) && (!e || e >= now);
    });
  }

  async recordAdImpression(data: any): Promise<void> {
    await db.insert(adImpressions).values(data as any);
  }

  async recordAdClick(data: any): Promise<void> {
    await db.insert(adClicks).values(data as any);
  }

  // Expenses
  async getExpenses(branchId?: string, start?: Date, end?: Date, search?: string, limit?: number, offset?: number): Promise<Expense[]> {
    return await this.withTenant(branchId, async (tx) => {
      const conditions: any[] = [];
      if (branchId) conditions.push(eq(expenses.branchId, branchId));
      if (start) conditions.push(gte(expenses.incurredAt, start));
      if (end) conditions.push(lte(expenses.incurredAt, end));
      if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        conditions.push(or(ilike(expenses.category, term as any), ilike(expenses.notes, term as any)));
      }

      let query: any = tx.select().from(expenses);
      if (conditions.length) query = query.where(and(...conditions));
      query = query.orderBy(desc(expenses.incurredAt));
      if (typeof limit === 'number') query = query.limit(limit);
      if (typeof offset === 'number') query = query.offset(offset);
      return await query;
    });
  }

  async createExpense(
    data: Omit<InsertExpense, "branchId" | "createdBy"> & { branchId?: string },
    createdBy: string,
    branchId: string,
  ): Promise<Expense> {
    const payload: InsertExpense = {
      category: (data as any).category,
      amount: (data as any).amount,
      notes: (data as any).notes,
      incurredAt: (data as any).incurredAt || new Date(),
      branchId: (data as any).branchId || branchId,
      createdBy,
    } as any;
    const [created] = await (await this.withTenant(branchId, async (tx) => {
      const [rec] = await tx.insert(expenses).values(payload as any).returning();
      return [rec] as any;
    })) as any;
    return created as any;
  }

  async getExpenseSummary(range: string = "monthly", branchId?: string): Promise<{ byMonth: { month: string; total: number }[]; byCategory: { category: string; total: number }[] }> {
    const now = new Date();
    const start6 = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const end = now;
    const list = await this.getExpenses(branchId, start6, end);

    // byMonth last 6 months
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }
    const totalsByMonth: Record<string, number> = Object.fromEntries(months.map(m => [m, 0]));
    list.forEach((e: any) => {
      const mk = monthKey(new Date(e.incurredAt));
      if (mk in totalsByMonth) totalsByMonth[mk] += parseFloat(e.amount);
    });
    const byMonth = months.map(m => ({ month: m, total: Math.round(totalsByMonth[m] * 100) / 100 }));

    // byCategory for current month
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const byCategoryMap: Record<string, number> = {};
    list.forEach((e: any) => {
      const d = new Date(e.incurredAt);
      if (d >= thisMonthStart) {
        const cat = e.category || "Other";
        byCategoryMap[cat] = (byCategoryMap[cat] || 0) + parseFloat(e.amount);
      }
    });
    const byCategory = Object.entries(byCategoryMap).map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }));

    return { byMonth, byCategory };
  }

  async updateExpense(id: string, updates: Partial<InsertExpense>, branchId?: string): Promise<Expense | undefined> {
    const conditions: any[] = [eq(expenses.id, id)];
    if (branchId) conditions.push(eq(expenses.branchId, branchId));
    const [existing] = await (await this.withTenant(branchId, async (tx) => {
      const rows = await tx.select().from(expenses).where(and(...conditions));
      return rows as any;
    })) as any;
    if (!existing) return undefined;
    const [updated] = await (await this.withTenant(branchId, async (tx) => {
      const rows = await tx.update(expenses).set({ ...(updates as any) }).where(eq(expenses.id, id)).returning();
      return rows as any;
    })) as any;
    return updated as any;
  }

  async deleteExpense(id: string, branchId?: string): Promise<boolean> {
    const conditions: any[] = [eq(expenses.id, id)];
    if (branchId) conditions.push(eq(expenses.branchId, branchId));
    const result = await this.withTenant(branchId, async (tx) => await tx.delete(expenses).where(and(...conditions)));
    return (result as any).rowCount ? (result as any).rowCount > 0 : true;
  }
}

export const storage: IStorage = new DatabaseStorage() as unknown as IStorage;
// Note: DatabaseStorage is structurally compatible with IStorage at runtime.
// Some optional admin/customer features may be implemented as no-ops.
