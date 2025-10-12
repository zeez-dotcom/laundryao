import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  numeric,
  integer,
  timestamp,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  pgEnum,
  date,
  uuid,
  serial,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const enumType = pgEnum;
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });
const uuidFn = sql`gen_random_uuid()`;

export const orderStatusEnum = [
  "received",
  "start_processing",
  "processing",
  "ready",
  "handed_over",
  "completed",
] as const;

export const promisedReadyOptionEnum = [
  "today",
  "tomorrow",
  "day_after_tomorrow",
] as const;

export const itemTypeEnum = ["everyday", "premium"] as const;

export const deliveryModeEnum = ["driver_pickup", "customer_cart"] as const;
export const deliveryStatusEnum = [
  "pending",
  "accepted",
  "driver_enroute",
  "picked_up",
  "processing_started",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;
export const cityTypeEnum = ["governorate", "area"] as const;
export const paymentMethodEnum = ["cash", "card", "knet", "credit_card", "pay_later"] as const;

export const orderStatus = enumType("status", orderStatusEnum);
export const promisedReadyOption = enumType(
  "promised_ready_option",
  promisedReadyOptionEnum,
);
export const itemType = enumType("item_type", itemTypeEnum);
export const deliveryMode = enumType("delivery_mode", deliveryModeEnum);
export const deliveryStatus = enumType("delivery_status", deliveryStatusEnum);
export const cityType = enumType("city_type", cityTypeEnum);
export const paymentMethod = enumType("payment_method", paymentMethodEnum);

export const clothingItems = pgTable("clothing_items", {
  publicId: serial("public_id").unique(),
  id: uuid("id").primaryKey().default(uuidFn),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  categoryId: uuid("category_id").references(() => categories.id).notNull(),
  imageUrl: text("image_url"),
  userId: uuid("user_id").references(() => users.id).notNull(),
  branchId: uuid("branch_id").references(() => branches.id),
}, (table) => ({
  clothingItemsBranchNameUnique: uniqueIndex("clothing_items_branch_name_unique").on(
    table.branchId,
    table.name,
  ),
}));

export const laundryServices = pgTable("laundry_services", {
  publicId: serial("public_id").unique(),
  id: uuid("id").primaryKey().default(uuidFn),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  descriptionAr: text("description_ar"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  branchId: uuid("branch_id").references(() => branches.id),
}, (table) => ({
  laundryServicesBranchNameUnique: uniqueIndex("laundry_services_branch_name_unique").on(
    table.branchId,
    table.name,
  ),
}));

export const itemServicePrices = pgTable(
  "item_service_prices",
  {
    clothingItemId: uuid("clothing_item_id").references(() => clothingItems.id)
      .notNull(),
    serviceId: uuid("service_id").references(() => laundryServices.id)
      .notNull(),
    branchId: uuid("branch_id").references(() => branches.id)
      .notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.clothingItemId, table.serviceId, table.branchId] }),
  }),
);

export const products = pgTable(
  "products",
  {
    publicId: serial("public_id").unique(),
    id: uuid("id").primaryKey().default(uuidFn),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    stock: integer("stock").notNull().default(0),
    imageUrl: text("image_url"),
    itemType: itemType("item_type").notNull().default("everyday"),
    clothingItemId: uuid("clothing_item_id").references(() => clothingItems.id),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
  },
  (table) => ({
    productsBranchNameUnique: uniqueIndex("products_branch_name_unique").on(
      table.branchId,
      table.name,
    ),
  }),
);

// Session storage table.
// (IMPORTANT) This table is mandatory for authentication, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamptz("expire").notNull(),
  },
  (table) => [index("sessions_expire_idx").on(table.expire)],
);

// User storage table for authentication
export const users = pgTable("users", {
  publicId: serial("public_id").unique(),
  id: uuid("id").primaryKey().default(uuidFn),
  username: varchar("username", { length: 50 }).unique().notNull(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  branchId: uuid("branch_id").references(() => branches.id),
  role: text("role").notNull().default('user'), // 'super_admin', 'admin', 'user'
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Categories table for organizing clothing items and services
export const categories = pgTable("categories", {
  publicId: serial("public_id").unique(),
  id: uuid("id").primaryKey().default(uuidFn),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  type: text("type").notNull(), // 'clothing' or 'service'
  description: text("description"),
  descriptionAr: text("description_ar"),
  color: text("color"),
  icon: text("icon"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  branchId: uuid("branch_id").references(() => branches.id),
}, (table) => ({
  userNameUnique: uniqueIndex("categories_user_id_name_unique").on(
    table.userId,
    table.name,
  ),
  categoriesBranchNameUnique: uniqueIndex("categories_branch_name_unique").on(
    table.branchId,
    table.name,
  ),
}));

// Branches table for store locations
export const branches = pgTable("branches", {
  publicId: serial("public_id").unique(),
  id: uuid("id").primaryKey().default(uuidFn),
  name: text("name").notNull(),
  // Arabic/localized counterparts for branch display fields
  nameAr: text("name_ar"),
  address: text("address"),
  addressAr: text("address_ar"),
  phone: text("phone"),
  addressInputMode: text("address_input_mode").notNull().default("mapbox"),
  logoUrl: text("logo_url"),
  whatsappQrUrl: text("whatsapp_qr_url"),
  tagline: text("tagline"),
  taglineAr: text("tagline_ar"),
  code: varchar("code", { length: 3 }).unique().notNull(),
  nextOrderNumber: integer("next_order_number").notNull().default(1),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
});


export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().default(uuidFn),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  type: cityType("type").notNull().default("area"), // 'governorate' or 'area'
  parentId: uuid("parent_id"), // For areas referencing governorates - self reference added after table definition
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const branchServiceCities = pgTable(
  "branch_service_cities",
  {
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    cityId: uuid("city_id").references(() => cities.id).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.branchId, table.cityId] }),
  }),
);

// Customers table for customer management and pay-later tracking
export const customers = pgTable(
  "customers",
  {
    publicId: serial("public_id").unique(),
    id: uuid("id").primaryKey().default(uuidFn),
    phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
    name: text("name").notNull(),
    nickname: text("nickname"),
    email: varchar("email", { length: 255 }),
    passwordHash: text("password_hash"),
    address: text("address"),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    balanceDue: numeric("balance_due", { precision: 10, scale: 2 }).default("0.00").notNull(),
    totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).default("0.00").notNull(),
    loyaltyPoints: integer("loyalty_points").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    customersBranchPhoneUnique: uniqueIndex("customers_branch_phone_unique").on(
      table.branchId,
      table.phoneNumber,
    ),
    customersBranchNicknameUnique: uniqueIndex("customers_branch_nickname_unique").on(
      table.branchId,
      table.nickname,
    ),
  }),
);

export const customerAddresses = pgTable("customer_addresses", {
  id: uuid("id").primaryKey().default(uuidFn),
  customerId: uuid("customer_id").references(() => customers.id).notNull(),
  label: text("label").notNull(),
  address: text("address").notNull(),
  cityId: uuid("city_id").references(() => cities.id),
  governorateId: uuid("governorate_id").references(() => cities.id),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const customerEngagementPlans = pgTable(
  "customer_engagement_plans",
  {
    id: uuid("id").primaryKey().default(uuidFn),
    customerId: uuid("customer_id").references(() => customers.id).notNull(),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    churnTier: text("churn_tier").notNull().default("new"),
    preferredServices: jsonb("preferred_services")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    recommendedAction: text("recommended_action"),
    recommendedChannel: text("recommended_channel"),
    nextContactAt: timestamptz("next_contact_at"),
    lastActionAt: timestamptz("last_action_at"),
    lastActionChannel: text("last_action_channel"),
    lastOutcome: text("last_outcome"),
    source: text("source").notNull().default("auto"),
    rateLimitedUntil: timestamptz("rate_limited_until"),
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    customerUnique: uniqueIndex("customer_engagement_plans_customer_unique").on(
      table.customerId,
    ),
  }),
);

// Prepaid packages for customers
export const packages = pgTable("packages", {
  publicId: serial("public_id").unique(),
  id: uuid("id").primaryKey().default(uuidFn),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar"),
  descriptionEn: text("description_en"),
  descriptionAr: text("description_ar"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  maxItems: integer("max_items"),
  expiryDays: integer("expiry_days"),
  bonusCredits: integer("bonus_credits"),
  branchId: uuid("branch_id").references(() => branches.id).notNull(),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const packageItems = pgTable("package_items", {
  id: uuid("id").primaryKey().default(uuidFn),
  packageId: uuid("package_id").references(() => packages.id).notNull(),
  clothingItemId: uuid("clothing_item_id").references(() => clothingItems.id)
    .notNull(),
  serviceId: uuid("service_id").references(() => laundryServices.id)
    .notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  credits: integer("credits").notNull(),
  paidCredits: integer("paid_credits").notNull().default(0),
});

export const customerPackages = pgTable("customer_packages", {
  id: uuid("id").primaryKey().default(uuidFn),
  customerId: uuid("customer_id").references(() => customers.id).notNull(),
  packageId: uuid("package_id").references(() => packages.id).notNull(),
  balance: integer("balance").notNull(),
  startsAt: timestamptz("starts_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamptz("expires_at"),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const customerPackageItems = pgTable("customer_package_items", {
  id: uuid("id").primaryKey().default(uuidFn),
  customerPackageId: uuid("customer_package_id").references(() => customerPackages.id)
    .notNull(),
  serviceId: uuid("service_id").references(() => laundryServices.id)
    .notNull(),
  clothingItemId: uuid("clothing_item_id").references(() => clothingItems.id)
    .notNull(),
  balance: integer("balance").notNull(),
  totalCredits: integer("total_credits").notNull(),
});

// Orders table for order tracking
export const orders = pgTable(
  "orders",
  {
    publicId: serial("public_id").unique(),
    id: uuid("id").primaryKey().default(uuidFn),
    orderNumber: varchar("order_number", { length: 20 }).notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    customerName: text("customer_name").notNull(),
    customerPhone: varchar("customer_phone", { length: 20 }).notNull(),
    items: jsonb("items").notNull(),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    tax: numeric("tax", { precision: 10, scale: 2 }).notNull(),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull(), // 'cash', 'card', 'pay_later'
    status: orderStatus("status").notNull().default("start_processing"), // 'received', 'start_processing', 'processing', 'ready', 'handed_over', 'completed'
    estimatedPickup: timestamptz("estimated_pickup"),
    actualPickup: timestamptz("actual_pickup"),
    readyBy: date("ready_by"),
    promisedReadyDate: date("promised_ready_date").default(sql`CURRENT_DATE + INTERVAL '1 day'`).notNull(),
    promisedReadyOption: promisedReadyOption("promised_ready_option").notNull().default("tomorrow"),
    notes: text("notes"),
    sellerName: varchar("seller_name", { length: 255 }).notNull(),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    isDeliveryRequest: boolean("is_delivery_request").default(false).notNull(),
    packageUsages: jsonb("package_usages"), // Store per-transaction multi-package usage for accurate receipt display
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    ordersBranchOrderNumberUnique: uniqueIndex("orders_branch_order_number_unique").on(
      table.branchId,
      table.orderNumber,
    ),
  }),
);


export const orderPrints = pgTable(
  "order_prints",
  {
    orderId: uuid("order_id").references(() => orders.id)
      .notNull(),
    branchId: uuid("branch_id").references(() => branches.id),
    printedAt: timestamptz("printed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    printedBy: uuid("printed_by").references(() => users.id).notNull(),
    printNumber: integer("print_number").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orderId, table.printNumber] }),
  }),
);

// Payment history for tracking customer payments
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(uuidFn),
  customerId: uuid("customer_id").references(() => customers.id).notNull(),
  orderId: uuid("order_id").references(() => orders.id),
  branchId: uuid("branch_id").references(() => branches.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  notes: text("notes"),
  receivedBy: varchar("received_by", { length: 255 }).notNull(),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Business expenses for profit/loss reporting
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().default(uuidFn),
  branchId: uuid("branch_id").references(() => branches.id).notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  incurredAt: timestamptz("incurred_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdBy: uuid("created_by").references(() => users.id).notNull(),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(uuidFn),
  items: jsonb("items").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: numeric("tax", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  orderId: uuid("order_id").references(() => orders.id),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  sellerName: text("seller_name").notNull(),
  branchId: uuid("branch_id").references(() => branches.id).notNull(),
});

// Notification audit trail
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(uuidFn),
  orderId: uuid("order_id").references(() => orders.id).notNull(),
  branchId: uuid("branch_id").references(() => branches.id),
  type: text("type").notNull(), // 'sms' or 'email'
  sentAt: timestamptz("sent_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Security settings
export const securitySettings = pgTable("security_settings", {
  id: uuid("id").primaryKey().default(uuidFn),
  sessionTimeout: integer("session_timeout").notNull().default(15),
  twoFactorRequired: boolean("two_factor_required").notNull().default(false),
  passwordPolicy: text("password_policy"),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Loyalty points history for tracking accrual and redemption
export const loyaltyHistory = pgTable("loyalty_history", {
  id: uuid("id").primaryKey().default(uuidFn),
  customerId: uuid("customer_id").references(() => customers.id).notNull(),
  change: integer("change").notNull(), // positive for accrual, negative for redemption
  description: text("description"),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Coupons for discounts and promotions
export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().default(uuidFn),
    code: varchar("code", { length: 50 }).notNull(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar"),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    discountType: text("discount_type").notNull(), // "percentage" or "fixed"
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
    minimumAmount: numeric("minimum_amount", { precision: 10, scale: 2 }),
    maximumDiscount: numeric("maximum_discount", { precision: 10, scale: 2 }),
    usageLimit: integer("usage_limit"),
    usedCount: integer("used_count").default(0).notNull(),
    validFrom: timestamptz("valid_from").default(sql`CURRENT_TIMESTAMP`).notNull(),
    validUntil: timestamptz("valid_until"),
    isActive: boolean("is_active").default(true).notNull(),
    applicationType: text("application_type").notNull().default("whole_cart"), // "whole_cart", "specific_items", "specific_services"
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    createdBy: uuid("created_by").references(() => users.id).notNull(),
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    couponsBranchCodeUnique: uniqueIndex("coupons_branch_code_unique").on(
      table.branchId,
      table.code,
    ),
  }),
);

// Coupon applicable clothing items
export const couponClothingItems = pgTable("coupon_clothing_items", {
  id: uuid("id").primaryKey().default(uuidFn),
  couponId: uuid("coupon_id").references(() => coupons.id).notNull(),
  clothingItemId: uuid("clothing_item_id").references(() => clothingItems.id).notNull(),
});

// Coupon applicable services
export const couponServices = pgTable("coupon_services", {
  id: uuid("id").primaryKey().default(uuidFn),
  couponId: uuid("coupon_id").references(() => coupons.id).notNull(),
  serviceId: uuid("service_id").references(() => laundryServices.id).notNull(),
});

// Coupon usage tracking
export const couponUsage = pgTable("coupon_usage", {
  id: uuid("id").primaryKey().default(uuidFn),
  couponId: uuid("coupon_id").references(() => coupons.id).notNull(),
  orderId: uuid("order_id").references(() => orders.id),
  customerId: uuid("customer_id").references(() => customers.id),
  discountApplied: numeric("discount_applied", { precision: 10, scale: 2 }).notNull(),
  usedAt: timestamptz("used_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Customer sessions for mobile app authentication
export const customerSessions = pgTable(
  "customer_sessions",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    customerId: uuid("customer_id").references(() => customers.id).notNull(),
    data: jsonb("data").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => [index("customer_sessions_expire_idx").on(table.expiresAt)],
);

// Branch delivery settings
export const branchDeliverySettings = pgTable("branch_delivery_settings", {
  branchId: uuid("branch_id").primaryKey().references(() => branches.id),
  deliveryEnabled: boolean("delivery_enabled").default(false).notNull(),
  minimumOrderAmount: numeric("minimum_order_amount", { precision: 10, scale: 2 }),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }),
  freeDeliveryThreshold: numeric("free_delivery_threshold", { precision: 10, scale: 2 }),
  maxDeliveryDistance: numeric("max_delivery_distance", { precision: 5, scale: 2 }), // in kilometers
  estimatedDeliveryTime: integer("estimated_delivery_time"), // in minutes
  operatingHours: jsonb("operating_hours"), // Store operating hours JSON
  specialInstructions: text("special_instructions"),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Branch delivery items - which clothing items each branch offers for delivery
export const branchDeliveryItems = pgTable(
  "branch_delivery_items",
  {
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    clothingItemId: uuid("clothing_item_id").references(() => clothingItems.id).notNull(),
    serviceId: uuid("service_id").references(() => laundryServices.id).notNull(),
    isAvailable: boolean("is_available").default(true).notNull(),
    deliveryPrice: numeric("delivery_price", { precision: 10, scale: 2 }),
    estimatedProcessingTime: integer("estimated_processing_time"), // in hours
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.branchId, table.clothingItemId, table.serviceId] }),
  }),
);

// Branch delivery packages - which packages each branch offers for delivery
export const branchDeliveryPackages = pgTable(
  "branch_delivery_packages",
  {
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    packageId: uuid("package_id").references(() => packages.id).notNull(),
    isAvailable: boolean("is_available").default(true).notNull(),
    deliveryDiscount: numeric("delivery_discount", { precision: 5, scale: 2 }), // percentage discount for delivery
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.branchId, table.packageId] }),
  }),
);

// Branch payment methods - which payment methods each branch accepts
export const branchPaymentMethods = pgTable(
  "branch_payment_methods",
  {
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    paymentMethod: paymentMethod("payment_method").notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    processingFee: numeric("processing_fee", { precision: 10, scale: 2 }),
    minAmount: numeric("min_amount", { precision: 10, scale: 2 }),
    maxAmount: numeric("max_amount", { precision: 10, scale: 2 }),
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.branchId, table.paymentMethod] }),
  }),
);

// Branch QR codes for customer ordering
export const branchQRCodes = pgTable(
  "branch_qr_codes",
  {
    id: uuid("id").primaryKey().default(uuidFn),
    branchId: uuid("branch_id").references(() => branches.id).notNull(),
    qrCode: varchar("qr_code", { length: 255 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id).notNull(),
    createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    deactivatedAt: timestamptz("deactivated_at"),
    deactivatedBy: uuid("deactivated_by").references(() => users.id),
  },
  (table) => ({
    branchQRCodesBranchQrUnique: uniqueIndex("branch_qr_codes_branch_qr_unique").on(
      table.branchId,
      table.qrCode,
    ),
  }),
);

// Delivery orders - enhanced order tracking for delivery system
export const deliveryOrders = pgTable("delivery_orders", {
  id: uuid("id").primaryKey().default(uuidFn),
  orderId: uuid("order_id").references(() => orders.id).notNull(),
  branchId: uuid("branch_id").references(() => branches.id),
  deliveryMode: deliveryMode("delivery_mode").notNull(), // 'driver_pickup' or 'customer_cart'
  pickupAddressId: uuid("pickup_address_id").references(() => customerAddresses.id),
  deliveryAddressId: uuid("delivery_address_id").references(() => customerAddresses.id),
  scheduledPickupTime: timestamptz("scheduled_pickup_time"),
  actualPickupTime: timestamptz("actual_pickup_time"),
  scheduledDeliveryTime: timestamptz("scheduled_delivery_time"),
  actualDeliveryTime: timestamptz("actual_delivery_time"),
  driverId: uuid("driver_id").references(() => users.id),
  deliveryInstructions: text("delivery_instructions"),
  deliveryNotes: text("delivery_notes"),
  deliveryStatus: deliveryStatus("delivery_status").notNull().default("pending"),
  estimatedDistance: numeric("estimated_distance", { precision: 5, scale: 2 }), // in kilometers
  actualDistance: numeric("actual_distance", { precision: 5, scale: 2 }),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertClothingItemSchema = createInsertSchema(clothingItems)
  .omit({
    id: true,
    userId: true,
  })
  // Relax ID formats for insert validators to ease server tests and mocks
  .extend({
    categoryId: z.string(),
  });

export const insertLaundryServiceSchema = createInsertSchema(laundryServices)
  .omit({
    id: true,
    userId: true,
  })
  .extend({
    price: z
      .string()
      .regex(/^[0-9]+(\.[0-9]+)?$/, { message: "Price must be a valid number" }),
  });

export const insertItemServicePriceSchema = createInsertSchema(itemServicePrices)
  .extend({
    price: z
      .union([z.string(), z.number()])
      .refine((val) => /^[0-9]+(\.[0-9]+)?$/.test(val.toString()), {
        message: "Price must be a valid number",
      }),
  })
  .extend({
    clothingItemId: z.string(),
    serviceId: z.string(),
    branchId: z.string(),
  });

export const insertProductSchema = createInsertSchema(products)
  .omit({
    id: true,
    branchId: true,
  })
  .extend({
    itemType: z.enum(itemTypeEnum).optional(),
    clothingItemId: z.string().optional(),
  });

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  branchId: true,
});

export const insertCustomerAddressSchema = createInsertSchema(customerAddresses)
  .omit({ id: true })
  .extend({
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    isDefault: z.boolean().optional(),
  });

export const insertCouponSchema = createInsertSchema(coupons).omit({
  id: true,
  usedCount: true,
  createdBy: true,
  branchId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCouponClothingItemSchema = createInsertSchema(couponClothingItems).omit({
  id: true,
});

export const insertCouponServiceSchema = createInsertSchema(couponServices).omit({
  id: true,
});

export const insertCouponUsageSchema = createInsertSchema(couponUsage).omit({
  id: true,
  usedAt: true,
});

export const insertPackageItemSchema = createInsertSchema(packageItems)
  .omit({
    id: true,
    packageId: true,
  })
  .extend({
    serviceId: z.string(),
    clothingItemId: z.string(),
    credits: z.coerce.number(),
    paidCredits: z.coerce.number().optional(),
  });

export const insertPackageSchema = createInsertSchema(packages)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    branchId: z.string(),
    packageItems: z.array(insertPackageItemSchema).optional(),
  });

export const insertCustomerPackageSchema = createInsertSchema(customerPackages).omit({
  id: true,
  createdAt: true,
});

export const packageUsageSchema = z.object({
  packageId: z.string(),
  items: z.array(
    z.object({
      serviceId: z.string(),
      clothingItemId: z.string(),
      quantity: z.number().int().positive(),
    })
  ),
});

export const packageUsagesSchema = z.array(packageUsageSchema);

export const insertOrderSchema = createInsertSchema(orders)
  .omit({
    id: true,
    orderNumber: true,
    createdAt: true,
    updatedAt: true,
    branchId: true,
  })
  .extend({
    readyBy: z.coerce.date().optional().transform((d) => d ? d.toISOString() : undefined),
    estimatedPickup: z.coerce.date().optional(),
    actualPickup: z.coerce.date().optional(),
    promisedReadyDate: z
      .coerce.date()
      .default(() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d;
      })
      .transform((d) => d.toISOString()),
    promisedReadyOption: z
      .enum(["today", "tomorrow", "day_after_tomorrow"])
      .default("tomorrow"),
    isDeliveryRequest: z.boolean().optional().default(false),
  });

export const guestOrderSchema = z.object({
  branchCode: z.string(),
  city: z.string(),
  name: z.string(),
  phoneNumber: z.string(),
  address: z.string(),
  pickupTime: z.coerce.date().optional(),
  dropoffTime: z.coerce.date().optional(),
  dropoffLat: z.number().optional(),
  dropoffLng: z.number().optional(),
  scheduled: z.boolean().optional().default(false),
  promisedReadyOption: z
    .enum(["today", "tomorrow", "day_after_tomorrow"])
    .optional()
    .default("tomorrow"),
  promisedReadyDate: z.coerce.date().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive().optional().default(1),
        price: z.number().nonnegative().optional().default(0),
      }),
    )
    .optional()
    .default([]),
});

export const insertOrderPrintSchema = createInsertSchema(orderPrints).omit({
  printedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  sentAt: true,
});

export const insertSecuritySettingsSchema = createInsertSchema(securitySettings).omit({
  id: true,
  updatedAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  branchId: true,
});

export const insertLoyaltyHistorySchema = createInsertSchema(loyaltyHistory).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Schema for updating users where all fields are optional
export const updateUserSchema = insertUserSchema.partial();

export const insertCategorySchema = createInsertSchema(categories)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    userId: true,
  })
  .extend({
    userId: z.string().optional(),
  });

export const insertBranchSchema = createInsertSchema(branches).omit({
  id: true,
  nextOrderNumber: true,
}).extend({
  code: z.string().regex(/^[A-Za-z]{2,3}$/, "Code must be 2–3 letters"),
  logoUrl: z.string().url().optional(),
  whatsappQrUrl: z.string().url().optional(),
  tagline: z.string().optional(),
  // Optional Arabic fields
  nameAr: z.string().optional(),
  addressAr: z.string().optional(),
  taglineAr: z.string().optional(),
  addressInputMode: z.enum(["mapbox", "manual"]).optional(),
});

// Schema for updating branches where all fields are optional
export const updateBranchSchema = insertBranchSchema.partial();

export const insertCitySchema = createInsertSchema(cities);
export const insertBranchServiceCitySchema = createInsertSchema(branchServiceCities);

// New table schemas
export const insertCustomerSessionSchema = createInsertSchema(customerSessions).omit({
  createdAt: true,
});

export const insertBranchDeliverySettingsSchema = createInsertSchema(branchDeliverySettings).omit({
  updatedAt: true,
});

export const insertBranchDeliveryItemSchema = createInsertSchema(branchDeliveryItems).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertBranchDeliveryPackageSchema = createInsertSchema(branchDeliveryPackages).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertBranchPaymentMethodSchema = createInsertSchema(branchPaymentMethods).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertBranchQRCodeSchema = createInsertSchema(branchQRCodes).omit({
  id: true,
  createdAt: true,
  deactivatedAt: true,
  deactivatedBy: true,
});

export const insertDeliveryOrderSchema = createInsertSchema(deliveryOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Expenses insert schema
export const insertExpenseSchema = createInsertSchema(expenses).omit({
  id: true,
  createdAt: true,
  createdBy: true,
  branchId: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpsertUser = typeof users.$inferInsert;
export type ClothingItem = typeof clothingItems.$inferSelect;
export type InsertClothingItem = z.infer<typeof insertClothingItemSchema>;
export type LaundryService = typeof laundryServices.$inferSelect;
export type LaundryServiceWithItemPrice = LaundryService & { itemPrice?: string };
export type InsertLaundryService = z.infer<typeof insertLaundryServiceSchema>;
export type ItemServicePrice = typeof itemServicePrices.$inferSelect;
export type InsertItemServicePrice = z.infer<typeof insertItemServicePriceSchema>;
export type ItemType = (typeof itemTypeEnum)[number];
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Branch = typeof branches.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type UpdateBranch = z.infer<typeof updateBranchSchema>;
export type City = typeof cities.$inferSelect;
export type InsertCity = z.infer<typeof insertCitySchema>;
export type BranchServiceCity = typeof branchServiceCities.$inferSelect;
export type InsertBranchServiceCity = z.infer<typeof insertBranchServiceCitySchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type CustomerAddress = typeof customerAddresses.$inferSelect;
export type InsertCustomerAddress = z.infer<typeof insertCustomerAddressSchema>;
export type CustomerEngagementPlan = typeof customerEngagementPlans.$inferSelect;
export type InsertCustomerEngagementPlan = typeof customerEngagementPlans.$inferInsert;
export type Package = typeof packages.$inferSelect;
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type PackageItem = typeof packageItems.$inferSelect;
export type InsertPackageItem = z.infer<typeof insertPackageItemSchema>;
export type PackageWithItems = Package & { packageItems: PackageItem[] };
export type CustomerPackage = typeof customerPackages.$inferSelect;
export type InsertCustomerPackage = z.infer<typeof insertCustomerPackageSchema>;
export type CustomerPackageItem = typeof customerPackageItems.$inferSelect;
export interface CustomerPackageWithUsage {
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
}
export type PackageUsage = z.infer<typeof packageUsageSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type GuestOrderInput = z.infer<typeof guestOrderSchema>;
export type OrderPrint = typeof orderPrints.$inferSelect;
export type InsertOrderPrint = z.infer<typeof insertOrderPrintSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type LoyaltyHistory = typeof loyaltyHistory.$inferSelect;
export type InsertLoyaltyHistory = z.infer<typeof insertLoyaltyHistorySchema>;
export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type CouponUsage = typeof couponUsage.$inferSelect;
export type InsertCouponUsage = z.infer<typeof insertCouponUsageSchema>;
export type CouponClothingItem = typeof couponClothingItems.$inferSelect;
export type InsertCouponClothingItem = z.infer<typeof insertCouponClothingItemSchema>;
export type CouponService = typeof couponServices.$inferSelect;
export type InsertCouponService = z.infer<typeof insertCouponServiceSchema>;
export type SecuritySettings = typeof securitySettings.$inferSelect;
export type InsertSecuritySettings = z.infer<typeof insertSecuritySettingsSchema>;
export type UserWithBranch = User & { branch: Branch | null };

export interface OrderLog {
  id: string;
  orderNumber: string;
  customerName: string;
  packageName?: string | null;
  status: string;
  statusHistory: { status: string; timestamp: string }[];
  receivedAt?: string | null;
  processedAt?: string | null;
  readyAt?: string | null;
  deliveredAt?: string | null;
}

export const bulkUploadResultSchema = z.object({
  processed: z.number(),
  created: z.number(),
  updated: z.number(),
  clothingItemsCreated: z.number(),
  clothingItemsUpdated: z.number(),
  branchId: z.string().optional(),
  userResults: z
    .array(
      z.object({
        userId: z.string(),
        created: z.number(),
        updated: z.number(),
      }),
    )
    .optional(),
});

export type BulkUploadResult = z.infer<typeof bulkUploadResultSchema>;

export interface LaundryCartItem {
  id: string;
  clothingItem: ClothingItem;
  service: LaundryServiceWithItemPrice;
  quantity: number;
  total: number;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  imageUrl?: string;
}

export interface LaundryCartSummary {
  items: LaundryCartItem[];
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
}

export interface CartSummary {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  itemCount: number;
}

// Branch customization settings
export const branchCustomizationTable = pgTable("branch_customizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  branchId: uuid("branch_id").notNull().references(() => branches.id),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").default("#1976d2"),
  secondaryColor: text("secondary_color").default("#dc004e"),
  headerText: text("header_text").default("Welcome to Our Laundry Service"),
  headerTextAr: text("header_text_ar"),
  subHeaderText: text("sub_header_text"),
  subHeaderTextAr: text("sub_header_text_ar"),
  footerText: text("footer_text").default("Thank you for choosing our service"),
  footerTextAr: text("footer_text_ar"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  address: text("address"),
  addressAr: text("address_ar"),
  returnPolicy: text("return_policy"),
  returnPolicyAr: text("return_policy_ar"),
  deliveryPolicy: text("delivery_policy"),
  deliveryPolicyAr: text("delivery_policy_ar"),
  // Customizable compensation/notice line shown on receipt footer
  compensationNoticeEn: text("compensation_notice_en"),
  compensationNoticeAr: text("compensation_notice_ar"),
  socialMediaLinks: jsonb("social_media_links").$type<{
    facebook?: string;
    instagram?: string;
    twitter?: string;
    whatsapp?: string;
  }>(),
  customCss: text("custom_css"),
  enableGuestCheckout: boolean("enable_guest_checkout").default(true),
  requireAddressForGuests: boolean("require_address_for_guests").default(true),
  // Feature flags
  expensesEnabled: boolean("expenses_enabled").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const branchCustomizationInsertSchema = createInsertSchema(branchCustomizationTable);
export type BranchCustomization = typeof branchCustomizationTable.$inferSelect;
export type BranchCustomizationInsert = z.infer<typeof branchCustomizationInsertSchema>;

// New table types for customer ordering system
export type CustomerSession = typeof customerSessions.$inferSelect;
export type InsertCustomerSession = z.infer<typeof insertCustomerSessionSchema>;

export type BranchDeliverySettings = typeof branchDeliverySettings.$inferSelect;
export type InsertBranchDeliverySettings = z.infer<typeof insertBranchDeliverySettingsSchema>;

export type BranchDeliveryItem = typeof branchDeliveryItems.$inferSelect;
export type InsertBranchDeliveryItem = z.infer<typeof insertBranchDeliveryItemSchema>;

export type BranchDeliveryPackage = typeof branchDeliveryPackages.$inferSelect;
export type InsertBranchDeliveryPackage = z.infer<typeof insertBranchDeliveryPackageSchema>;

export type BranchPaymentMethod = typeof branchPaymentMethods.$inferSelect;
export type InsertBranchPaymentMethod = z.infer<typeof insertBranchPaymentMethodSchema>;

export type BranchQRCode = typeof branchQRCodes.$inferSelect;
export type InsertBranchQRCode = z.infer<typeof insertBranchQRCodeSchema>;

export type DeliveryOrder = typeof deliveryOrders.$inferSelect;
export type InsertDeliveryOrder = z.infer<typeof insertDeliveryOrderSchema>;

// Enhanced types for existing tables with new enums
export type OrderStatus = typeof orderStatusEnum[number];
export type DeliveryStatus = typeof deliveryStatusEnum[number];
export type CityType = typeof cityTypeEnum[number];
export type DeliveryMode = typeof deliveryModeEnum[number];
export type PaymentMethodType = typeof paymentMethodEnum[number];

// Customer Dashboard settings per branch
export const customerDashboardSettings = pgTable("customer_dashboard_settings", {
  branchId: uuid("branch_id").primaryKey().references(() => branches.id),
  heroTitleEn: text("hero_title_en"),
  heroTitleAr: text("hero_title_ar"),
  heroSubtitleEn: text("hero_subtitle_en"),
  heroSubtitleAr: text("hero_subtitle_ar"),
  featuredMessageEn: text("featured_message_en"),
  featuredMessageAr: text("featured_message_ar"),
  showPackages: boolean("show_packages").default(true).notNull(),
  showOrders: boolean("show_orders").default(true).notNull(),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Branch ads and analytics
export const branchAds = pgTable("branch_ads", {
  id: uuid("id").primaryKey().default(uuidFn),
  branchId: uuid("branch_id").references(() => branches.id).notNull(),
  titleEn: text("title_en").notNull(),
  titleAr: text("title_ar"),
  imageUrl: text("image_url").notNull(),
  targetUrl: text("target_url"),
  placement: text("placement").default("dashboard_top").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  startsAt: timestamptz("starts_at"),
  endsAt: timestamptz("ends_at"),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamptz("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const adImpressions = pgTable("ad_impressions", {
  id: uuid("id").primaryKey().default(uuidFn),
  adId: uuid("ad_id").references(() => branchAds.id).notNull(),
  branchId: uuid("branch_id").references(() => branches.id).notNull(),
  customerId: uuid("customer_id").references(() => customers.id),
  cityId: uuid("city_id").references(() => cities.id),
  governorateId: uuid("governorate_id").references(() => cities.id),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  language: text("language"),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const adClicks = pgTable("ad_clicks", {
  id: uuid("id").primaryKey().default(uuidFn),
  adId: uuid("ad_id").references(() => branchAds.id).notNull(),
  branchId: uuid("branch_id").references(() => branches.id).notNull(),
  customerId: uuid("customer_id").references(() => customers.id),
  cityId: uuid("city_id").references(() => cities.id),
  governorateId: uuid("governorate_id").references(() => cities.id),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  language: text("language"),
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  createdAt: timestamptz("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCustomerDashboardSettingsSchema = createInsertSchema(customerDashboardSettings).omit({
  updatedAt: true,
});
export const insertBranchAdSchema = createInsertSchema(branchAds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAdImpressionSchema = createInsertSchema(adImpressions).omit({
  id: true,
  createdAt: true,
});
export const insertAdClickSchema = createInsertSchema(adClicks).omit({
  id: true,
  createdAt: true,
});

export type CustomerDashboardSettings = typeof customerDashboardSettings.$inferSelect;
export type InsertCustomerDashboardSettings = z.infer<typeof insertCustomerDashboardSettingsSchema>;
export type BranchAd = typeof branchAds.$inferSelect;
export type InsertBranchAd = z.infer<typeof insertBranchAdSchema>;
