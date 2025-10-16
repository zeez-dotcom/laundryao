import { randomUUID } from "node:crypto";
import type { Express, Request } from "express";
import { Router } from "express";
import { sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { db } from "../db";
import type { ForecastingService, ForecastMetric, CohortFilter } from "../services/forecasting";

interface WorkspaceViewRecord {
  id: string;
  name: string;
  description: string | null;
  ownerId: string | null;
  layout: Record<string, unknown>;
  filters: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_WIDGET_LAYOUT = {
  widgets: [
    { id: "revenue-trend", type: "line", metric: "revenue", span: 2 },
    { id: "order-volume", type: "bar", metric: "orders", span: 1 },
    { id: "forecast-band", type: "area", metric: "revenue", span: 1 },
  ],
};

const COHORTS: CohortFilter[] = [
  { id: "all", label: "All customers" },
  { id: "highValue", label: "High value", description: "Orders >= E£ 500" },
  { id: "recurring", label: "Package members", description: "Customers with package usage" },
  { id: "newCustomers", label: "New customers", description: "First 30 days" },
];

let viewsEnsured = false;

async function ensureViewsTable(): Promise<void> {
  if (viewsEnsured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS analytics_workspace_views (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      owner_id UUID,
      layout JSONB NOT NULL,
      filters JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  viewsEnsured = true;
}

function normalizeMetric(metric: string | undefined): ForecastMetric {
  if (metric === "orders" || metric === "revenue" || metric === "average_order_value") {
    return metric;
  }
  return "revenue";
}

function resolveCohort(cohortId: string | undefined | null): CohortFilter | null {
  if (!cohortId || cohortId === "all") return null;
  return COHORTS.find((cohort) => cohort.id === cohortId) ?? null;
}

function buildCohortClause(req: Request) {
  const cohort = resolveCohort(typeof req.query.cohortId === "string" ? req.query.cohortId : undefined);
  if (!cohort) return sql``;
  switch (cohort.id) {
    case "highValue":
      return sql`AND o.total::numeric >= 500`;
    case "recurring":
      return sql`AND o.package_usages IS NOT NULL`;
    case "newCustomers":
      return sql`AND o.created_at >= NOW() - INTERVAL '30 days'`;
    default:
      return sql``;
  }
}

export function registerAnalyticsWorkspaceRoutes(app: Express, forecasting: ForecastingService): void {
  const router = Router();
  router.use(requireAuth);

  router.get("/views", async (req, res) => {
    await ensureViewsTable();
    const userId = (req.user as any)?.id ?? null;
    const rows = await db.execute(sql`
      SELECT *
      FROM analytics_workspace_views
      WHERE owner_id IS NULL OR owner_id = ${userId}
      ORDER BY created_at DESC
    `);
    const views: WorkspaceViewRecord[] = rows.rows?.map((row: any) => ({
      id: String(row.id),
      name: String(row.name),
      description: row.description ?? null,
      ownerId: row.owner_id ?? null,
      layout: row.layout ?? DEFAULT_WIDGET_LAYOUT,
      filters: row.filters ?? {},
      createdAt: new Date(row.created_at ?? new Date()).toISOString(),
      updatedAt: new Date(row.updated_at ?? new Date()).toISOString(),
    })) ?? [];
    if (!views.length) {
      views.push({
        id: "default",
        name: "Executive overview",
        description: "Revenue trends, order volume, and forecast band",
        ownerId: null,
        layout: DEFAULT_WIDGET_LAYOUT,
        filters: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    res.json({ views });
  });

  router.post("/views", async (req, res) => {
    await ensureViewsTable();
    const userId = (req.user as any)?.id ?? null;
    const body = req.body as Partial<WorkspaceViewRecord>;
    if (!body?.name) {
      res.status(400).json({ message: "Name is required" });
      return;
    }
    const viewId = randomUUID();
    await db.execute(sql`
      INSERT INTO analytics_workspace_views (id, name, description, owner_id, layout, filters)
      VALUES (
        ${viewId},
        ${body.name},
        ${body.description ?? null},
        ${userId},
        ${JSON.stringify(body.layout ?? DEFAULT_WIDGET_LAYOUT)},
        ${JSON.stringify(body.filters ?? {})}
      )
    `);
    res.status(201).json({ id: viewId });
  });

  router.put("/views/:id", async (req, res) => {
    await ensureViewsTable();
    const userId = (req.user as any)?.id ?? null;
    const body = req.body as Partial<WorkspaceViewRecord>;
    const viewId = req.params.id;
    const result = await db.execute(sql`
      UPDATE analytics_workspace_views
      SET
        name = COALESCE(${body.name}, name),
        description = COALESCE(${body.description}, description),
        layout = COALESCE(${body.layout ? JSON.stringify(body.layout) : null}, layout),
        filters = COALESCE(${body.filters ? JSON.stringify(body.filters) : null}, filters),
        updated_at = NOW()
      WHERE id = ${viewId} AND (owner_id = ${userId} OR owner_id IS NULL)
      RETURNING id
    `);
    if (!result.rows?.length) {
      res.status(404).json({ message: "View not found" });
      return;
    }
    res.json({ id: viewId });
  });

  router.get("/cohorts", (_req, res) => {
    res.json({ cohorts: COHORTS });
  });

  router.get("/data", async (req, res) => {
    const metric = normalizeMetric(typeof req.query.metric === "string" ? req.query.metric : undefined);
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : null;
    const cohort = resolveCohort(typeof req.query.cohortId === "string" ? req.query.cohortId : undefined);
    const rangeDays = Number.parseInt(typeof req.query.rangeDays === "string" ? req.query.rangeDays : "30", 10) || 30;
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - rangeDays);

    const historical = await forecasting.getHistoricalSeries({
      metric,
      branchId,
      cohort,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });

    const forecasts = await forecasting.getForecasts({
      metric,
      branchId,
      cohort,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });

    const accuracy = await forecasting.evaluateAccuracy({
      metric,
      branchId,
      cohort,
      compareDays: Math.min(rangeDays, 30),
    });

    res.json({
      metric,
      historical,
      forecasts,
      accuracy,
    });
  });

  router.get("/drilldown", async (req, res) => {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : null;
    const start = typeof req.query.start === "string" ? new Date(req.query.start) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = typeof req.query.end === "string" ? new Date(req.query.end) : new Date();
    const cohortClause = buildCohortClause(req);
    const branchClause = branchId ? sql`AND o.branch_id = ${branchId}` : sql``;

    const rows = await db.execute(sql`
      SELECT o.id, o.order_number, o.customer_name, o.total::numeric AS total, o.created_at
      FROM orders o
      WHERE o.created_at >= ${start} AND o.created_at <= ${end}
      ${branchClause}
      ${cohortClause}
      ORDER BY o.created_at DESC
      LIMIT 200
    `);

    res.json({
      rows: rows.rows?.map((row: any) => ({
        id: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        total: Number(row.total ?? 0),
        createdAt: new Date(row.created_at ?? new Date()).toISOString(),
      })) ?? [],
    });
  });

  app.use("/api/analytics/workspace", router);
}
