export interface CommandCenterFinancials {
  balanceDue: number;
  totalSpend: number;
  loyaltyPoints: number;
  packageCredits: number;
}

export interface CommandCenterCustomer {
  id: string;
  branchId: string;
  name: string;
  phoneNumber?: string | null;
  email?: string | null;
  loyaltyPoints?: number | null;
  isActive?: boolean;
  createdAt?: string | null;
}

export interface CommandCenterOrderItem {
  serviceId: string | null;
  serviceName: string | null;
  clothingItemId: string | null;
  quantity: number;
}

export interface CommandCenterOrder {
  id: string;
  orderNumber: string;
  status: string | null;
  total: number;
  paid: number;
  remaining: number;
  createdAt: string | null;
  promisedReadyDate: string | null;
  items: CommandCenterOrderItem[];
}

export interface CommandCenterPackage {
  id: string;
  name: string | null;
  balance: number;
  startsAt: string | null;
  expiresAt: string | null;
  totalCredits: number | null;
}

export interface CommandCenterTimelineEvent {
  id: string;
  occurredAt: string;
  category: "order" | "payment" | "loyalty" | "notification" | "engagement" | "system";
  title: string;
  details?: string;
  meta?: Record<string, unknown>;
  optimistic?: boolean;
}

export interface CommandCenterActionSurface {
  method: string;
  endpoint: string;
  payloadExample?: Record<string, unknown>;
  caution?: string;
}

export interface CommandCenterActionsDescriptor {
  issueCredit: CommandCenterActionSurface;
  schedulePickup: CommandCenterActionSurface;
  launchChat: CommandCenterActionSurface;
  queueCampaign: CommandCenterActionSurface;
}

export interface CommandCenterInsightsSummary {
  customerId: string;
  summary: string;
  purchaseFrequency: string;
  preferredServices: string[];
  sentiment: "positive" | "neutral" | "negative";
  generatedAt: string;
}

export interface CommandCenterAuditEvent extends CommandCenterTimelineEvent {
  actor?: string;
}

export interface CommandCenterResponse {
  customer: CommandCenterCustomer;
  financial: CommandCenterFinancials;
  orders: CommandCenterOrder[];
  packages: CommandCenterPackage[];
  outreachTimeline: CommandCenterTimelineEvent[];
  auditTrail: CommandCenterAuditEvent[];
  actions: CommandCenterActionsDescriptor;
  insights: CommandCenterInsightsSummary;
}
