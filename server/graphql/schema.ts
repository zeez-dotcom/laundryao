import { deliveryStatusEnum, workflowStatusEnum } from "@shared/schema";

const deliveryStatusValues = deliveryStatusEnum.map((value) => `  ${value}`).join("\n");
const workflowStatusValues = workflowStatusEnum.map((value) => `  ${value}`).join("\n");

export const typeDefs = /* GraphQL */ `
  scalar DateTime
  scalar JSONObject

  enum DeliveryStatus {
${deliveryStatusValues}
  }

  enum WorkflowStatus {
${workflowStatusValues}
  }

  type Query {
    me: User
    customer(id: ID!): Customer
    customers(search: String, includeInactive: Boolean, limit: Int, offset: Int): CustomerConnection!
    order(id: ID!): Order
    orders(customerId: ID, status: String, limit: Int): [Order!]!
    delivery(id: ID!): Delivery
    deliveries(status: DeliveryStatus, branchId: ID): [Delivery!]!
    analyticsSummary(range: AnalyticsRangeInput, branchId: ID): AnalyticsSummary!
    workflows(status: WorkflowStatus): [Workflow!]!
    workflow(id: ID!): Workflow
    workflowCatalog: WorkflowCatalog!
  }

  type User {
    id: ID!
    firstName: String
    lastName: String
    role: String!
    branchId: ID
  }

  type CustomerConnection {
    items: [Customer!]!
    total: Int!
  }

  type Customer {
    id: ID!
    name: String!
    nickname: String
    phoneNumber: String!
    email: String
    branchId: ID!
    balanceDue: Float!
    totalSpent: Float!
    loyaltyPoints: Int!
    isActive: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    addresses: [CustomerAddress!]!
    engagementPlan: CustomerEngagementPlan
    insights: CustomerInsight
    orders(limit: Int): [Order!]!
  }

  type CustomerAddress {
    id: ID!
    label: String!
    address: String!
    cityId: ID
    governorateId: ID
    lat: Float
    lng: Float
    isDefault: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type CustomerEngagementPlan {
    id: ID!
    churnTier: String!
    preferredServices: [String!]!
    recommendedAction: String
    recommendedChannel: String
    nextContactAt: DateTime
    lastActionAt: DateTime
    lastActionChannel: String
    lastOutcome: String
  }

  type CustomerInsight {
    summary: String!
    purchaseFrequency: String!
    preferredServices: [String!]!
    sentiment: String!
    generatedAt: DateTime!
  }

  type Order {
    id: ID!
    orderNumber: String!
    status: String!
    customerId: ID
    customerName: String!
    customerPhone: String!
    paymentMethod: String!
    isDeliveryRequest: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    financials: OrderFinancials!
    items: [JSONObject!]!
    customer: Customer
  }

  type OrderFinancials {
    subtotal: Float!
    tax: Float!
    total: Float!
    paid: Float
    balanceDue: Float
    remaining: Float
  }

  type Delivery {
    id: ID!
    orderId: ID!
    branchId: ID
    deliveryMode: String!
    pickupAddressId: ID
    deliveryAddressId: ID
    scheduledPickupTime: DateTime
    actualPickupTime: DateTime
    scheduledDeliveryTime: DateTime
    actualDeliveryTime: DateTime
    driverId: ID
    deliveryInstructions: String
    deliveryNotes: String
    deliveryStatus: DeliveryStatus!
    estimatedDistance: Float
    actualDistance: Float
    deliveryFee: Float
    createdAt: DateTime!
    updatedAt: DateTime!
    order: Order!
    optimization: DeliveryOptimization
  }

  type DeliveryOptimization {
    driverId: ID!
    etaMinutes: Float!
    distanceKm: Float!
    confidence: Float!
    reasons: [String!]!
  }

  input AnalyticsRangeInput {
    range: String
    start: DateTime
    end: DateTime
  }

  type AnalyticsSummary {
    totalOrders: Int!
    totalRevenue: Float!
    averageOrderValue: Float!
    daily: [AnalyticsDailySummary!]!
    topServices: [MetricBreakdown!]!
    topProducts: [MetricBreakdown!]!
    topPackages: [MetricBreakdown!]!
    paymentMethods: [MetricBreakdown!]!
  }

  type AnalyticsDailySummary {
    date: String!
    orders: Int!
    revenue: Float!
  }

  type MetricBreakdown {
    name: String!
    count: Int!
    revenue: Float!
  }

  type Workflow {
    id: ID!
    name: String!
    description: String
    status: WorkflowStatus!
    metadata: JSONObject
    createdAt: DateTime!
    updatedAt: DateTime!
    nodes: [WorkflowNode!]!
    edges: [WorkflowEdge!]!
  }

  type WorkflowNode {
    id: ID!
    key: String!
    label: String!
    kind: String!
    type: String!
    config: JSONObject
    positionX: Int!
    positionY: Int!
  }

  type WorkflowEdge {
    id: ID!
    sourceNodeId: ID!
    targetNodeId: ID!
    label: String
    condition: JSONObject
  }

  type WorkflowCatalog {
    triggers: [WorkflowTrigger!]!
    actions: [WorkflowAction!]!
  }

  type WorkflowTrigger {
    type: String!
    label: String!
    description: String
  }

  type WorkflowAction {
    type: String!
    label: String!
    description: String
  }
`;

