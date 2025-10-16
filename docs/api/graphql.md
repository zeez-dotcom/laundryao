# GraphQL API

The API server now exposes a GraphQL endpoint alongside the existing REST routes. GraphQL is designed for internal dashboards and partner integrations that require tailored data sets without multiple round trips.

## Endpoint & Authentication

- **URL:** `POST /graphql`
- **Authentication:** Uses the same session-based authentication as REST. Clients must first authenticate via the `/api/login` route to establish a session cookie.
- **Playground:** In non-production environments the Apollo Sandbox is served at `/graphql` for interactive exploration. Set `ENABLE_GRAPHQL_PLAYGROUND=true` (already configured in `docker-compose.dev.yml`) to ensure the playground banner is shown locally.

## Schema Overview

Key resource types:

- `Customer`, `CustomerAddress`, and `CustomerEngagementPlan`
- `Order` with nested `financials` and related `Customer`
- `Delivery` exposing optimization hints sourced from the delivery optimization service
- `AnalyticsSummary` aggregating revenue, order counts, and top performers
- `Workflow`, `WorkflowCatalog`, and supporting nodes/edges from the workflow engine

The root `Query` type provides entry points to fetch customers, orders, deliveries, analytics, and workflow metadata. Custom scalars (`DateTime`, `JSONObject`) are available for ISO timestamps and structured JSON payloads.

## Example Query

```graphql
query BranchDashboard($customerId: ID!, $deliveryId: ID!) {
  customer(id: $customerId) {
    id
    name
    balanceDue
    orders(limit: 3) {
      id
      status
      financials { total balanceDue paid }
    }
    insights {
      summary
      purchaseFrequency
      sentiment
    }
  }
  delivery(id: $deliveryId) {
    id
    deliveryStatus
    optimization {
      driverId
      etaMinutes
      reasons
    }
  }
  analyticsSummary {
    totalOrders
    totalRevenue
    topServices { name count }
  }
  workflows {
    id
    name
    status
  }
}
```

## Comparing to REST

- `customer(id)` is analogous to `GET /api/customers/:id`, returning the core profile, recent orders, and derived insights.
- `orders` mirrors `GET /api/orders`, including financial breakdowns and related customer information.
- `deliveries` and `delivery(id)` expose the same delivery order payloads as `GET /api/delivery-orders` with additional optimization recommendations supplied by the delivery optimization service.
- `analyticsSummary` consolidates the existing `/api/reports/*` endpoints into a single call for dashboards.
- `workflows` and `workflowCatalog` surface the definitions and building blocks previously only reachable through the workflow management REST routes.

Use these queries as drop-in replacements when you need to fetch multiple resources in one round trip or shape payloads for dashboards without post-processing on the client.

