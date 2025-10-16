import type { Express, RequestHandler } from "express";
import type { Logger } from "pino";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { UserWithBranch } from "@shared/schema";

export type ExperimentStatus = "draft" | "forecasted" | "published" | "archived";

declare module "express-serve-static-core" {
  interface Request {
    user?: UserWithBranch;
  }
}

export interface CatalogExperimentChange {
  id: string;
  serviceId: string;
  serviceName: string;
  baselinePrice: number;
  proposedPrice: number;
  expectedVolume: number;
}

export interface CatalogExperimentForecast {
  baselineRevenue: number;
  projectedRevenue: number;
  revenueLift: number;
  demandMultiplier: number;
  confidence: number;
  riskLevel: "low" | "medium" | "high";
  assumptions: {
    demandShift: number;
    seasonality: number;
  };
}

export interface CatalogExperiment {
  id: string;
  branchId: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  createdAt: string;
  updatedAt: string;
  changes: CatalogExperimentChange[];
  forecast?: CatalogExperimentForecast;
  approvals: Array<{ actor: string; role: string; at: string }>;
  publishedAt?: string;
  notes?: string;
}

interface CatalogExperimentStore {
  create(payload: Omit<CatalogExperiment, "id" | "createdAt" | "updatedAt">): CatalogExperiment;
  update(id: string, patch: Partial<CatalogExperiment>): CatalogExperiment | null;
  get(id: string): CatalogExperiment | undefined;
  list(): CatalogExperiment[];
  reset(): void;
}

function createCatalogExperimentStore(): CatalogExperimentStore {
  const records = new Map<string, CatalogExperiment>();

  return {
    create(payload) {
      const now = new Date().toISOString();
      const record: CatalogExperiment = {
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
        ...payload,
      };
      records.set(record.id, record);
      return record;
    },
    update(id, patch) {
      const existing = records.get(id);
      if (!existing) return null;
      const updated: CatalogExperiment = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      records.set(id, updated);
      return updated;
    },
    get(id) {
      return records.get(id);
    },
    list() {
      return Array.from(records.values()).sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    },
    reset() {
      records.clear();
    },
  };
}

const store = createCatalogExperimentStore();

export function getCatalogExperimentStore() {
  return store;
}

const changeSchema = z.object({
  serviceId: z.string().min(1),
  serviceName: z.string().min(1),
  baselinePrice: z.number().nonnegative(),
  proposedPrice: z.number().nonnegative(),
  expectedVolume: z.number().positive().default(100),
});

const createSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1),
  hypothesis: z.string().min(1),
  changes: z.array(changeSchema).min(1),
  notes: z.string().optional(),
});

const forecastSchema = z
  .object({
    demandShift: z.number().min(-0.9).max(2).default(0),
    seasonality: z.number().min(0.5).max(1.5).default(1),
  })
  .partial()
  .transform((value) => ({
    demandShift: value.demandShift ?? 0,
    seasonality: value.seasonality ?? 1,
  }));

const publishSchema = z.object({
  confirm: z.boolean().refine((value) => value === true, {
    message: "Experiment publish confirmation is required",
  }),
  notes: z.string().optional(),
});

function formatActorName(user?: UserWithBranch | null): string {
  if (!user) return "system";
  const parts = [user.firstName, user.lastName].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  if (parts.length) {
    return parts.join(" ");
  }
  return user.username ?? "system";
}

function computeForecast(
  experiment: CatalogExperiment,
  assumptions: { demandShift: number; seasonality: number },
): CatalogExperimentForecast {
  let baselineRevenue = 0;
  let projectedRevenue = 0;
  let aggregateDemandMultiplier = 0;

  for (const change of experiment.changes) {
    const baseline = change.baselinePrice * change.expectedVolume;
    baselineRevenue += baseline;
    const baselinePrice = Math.max(change.baselinePrice, 1);
    const priceDelta = (change.proposedPrice - baselinePrice) / baselinePrice;
    const elasticity = 1.6;
    const elasticityEffect = -priceDelta * elasticity;
    const demandMultiplier = Math.max(0, 1 + elasticityEffect + assumptions.demandShift);
    aggregateDemandMultiplier += demandMultiplier;
    const adjustedMultiplier = demandMultiplier * assumptions.seasonality;
    projectedRevenue += change.proposedPrice * change.expectedVolume * adjustedMultiplier;
  }

  const averageDemandMultiplier = experiment.changes.length
    ? aggregateDemandMultiplier / experiment.changes.length
    : 1;

  const revenueLift = projectedRevenue - baselineRevenue;
  const riskLevel: "low" | "medium" | "high" = averageDemandMultiplier < 0.5
    ? "high"
    : projectedRevenue < baselineRevenue * 0.9
    ? "high"
    : projectedRevenue < baselineRevenue
    ? "medium"
    : averageDemandMultiplier < 0.8
    ? "medium"
    : "low";

  const confidence = Math.max(0.4, Math.min(0.95, 0.85 + (averageDemandMultiplier - 1) * 0.1));

  return {
    baselineRevenue: Number(baselineRevenue.toFixed(2)),
    projectedRevenue: Number(projectedRevenue.toFixed(2)),
    revenueLift: Number(revenueLift.toFixed(2)),
    demandMultiplier: Number(averageDemandMultiplier.toFixed(2)),
    confidence: Number(confidence.toFixed(2)),
    riskLevel,
    assumptions,
  };
}

interface CatalogExperimentRoutesDeps {
  app: Express;
  requireAdminOrSuperAdmin: RequestHandler;
  logger: Logger;
}

export function registerCatalogExperimentRoutes({
  app,
  requireAdminOrSuperAdmin,
  logger,
}: CatalogExperimentRoutesDeps): void {
  app.get("/api/catalog/experiments", requireAdminOrSuperAdmin, (_req, res) => {
    res.json(store.list());
  });

  app.post("/api/catalog/experiments", requireAdminOrSuperAdmin, (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid experiment payload", issues: parsed.error.format() });
    }

    const payload = parsed.data;
    const experiment: CatalogExperiment = store.create({
      branchId: payload.branchId,
      name: payload.name,
      hypothesis: payload.hypothesis,
      status: "draft",
      changes: payload.changes.map((change) => ({
        ...change,
        id: randomUUID(),
      })),
      forecast: undefined,
      approvals: [],
      notes: payload.notes,
      publishedAt: undefined,
    });

    res.status(201).json(experiment);
  });

  app.post("/api/catalog/experiments/:id/forecast", requireAdminOrSuperAdmin, (req, res) => {
    const experiment = store.get(req.params.id);
    if (!experiment) {
      return res.status(404).json({ message: "Experiment not found" });
    }

    const assumptions = forecastSchema.parse(req.body ?? {});
    const forecast = computeForecast(experiment, assumptions);
    const updated = store.update(experiment.id, {
      status: forecast.riskLevel === "high" ? "draft" : "forecasted",
      forecast,
    });

    res.json(updated);
  });

  app.post("/api/catalog/experiments/:id/publish", requireAdminOrSuperAdmin, (req, res) => {
    const experiment = store.get(req.params.id);
    if (!experiment) {
      return res.status(404).json({ message: "Experiment not found" });
    }

    const parsed = publishSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid publish payload", issues: parsed.error.format() });
    }

    if (!experiment.forecast) {
      return res.status(409).json({ message: "Run a forecast before publishing" });
    }

    if (experiment.forecast.riskLevel === "high") {
      return res
        .status(409)
        .json({ message: "High risk experiments require additional review before publishing" });
    }

    const actorUser = req.user as UserWithBranch | undefined;
    const actorName = formatActorName(actorUser);

    const updated = store.update(experiment.id, {
      status: "published",
      publishedAt: new Date().toISOString(),
      notes: parsed.data.notes ?? experiment.notes,
      approvals: [
        ...experiment.approvals,
        {
          actor: actorName,
          role: actorUser?.role ?? "system",
          at: new Date().toISOString(),
        },
      ],
    });

    logger.info({ experimentId: experiment.id }, "Catalog experiment published");
    res.json(updated);
  });
}

export function resetCatalogExperimentStore() {
  store.reset();
}
