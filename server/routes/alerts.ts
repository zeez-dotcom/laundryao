import type { Express } from "express";
import { Router } from "express";
import { requireAdminOrSuperAdmin, requireAuth } from "../auth";
import type { AlertingEngine, AlertRule, AlertSchedule, AlertChannelConfig } from "../services/alerts";
import { computeCohortKey } from "../services/alerts";
import type { CohortFilter } from "../services/forecasting";

function parseSchedule(input: any): AlertSchedule {
  const frequency = typeof input?.frequency === "string" ? input.frequency : "daily";
  const schedule: AlertSchedule = { frequency } as AlertSchedule;
  if (typeof input?.minute === "number") schedule.minute = input.minute;
  if (typeof input?.hour === "number") schedule.hour = input.hour;
  if (typeof input?.dayOfWeek === "number") schedule.dayOfWeek = input.dayOfWeek;
  if (typeof input?.timezone === "string") schedule.timezone = input.timezone;
  return schedule;
}

function parseChannels(input: any): AlertChannelConfig[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => ({
      type: entry?.type ?? "email",
      targets: Array.isArray(entry?.targets) ? entry.targets.map((t: any) => String(t)) : undefined,
    }))
    .filter((entry) => entry.type === "email" || entry.type === "sms" || entry.type === "slack");
}

function parseCohort(input: any): CohortFilter | null {
  if (!input) return null;
  if (typeof input.id !== "string" || typeof input.label !== "string") return null;
  return { id: input.id, label: input.label, description: typeof input.description === "string" ? input.description : undefined };
}

export function registerAlertRoutes(app: Express, engine: AlertingEngine): void {
  const router = Router();

  router.get("/preferences", requireAuth, async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }
    const preferences = await engine.getPreferences(userId);
    res.json(
      preferences ?? {
        userId,
        emailEnabled: true,
        smsEnabled: false,
        slackEnabled: false,
        emailAddress: (req.user as any)?.email ?? null,
        phoneNumber: null,
        slackWebhook: null,
        quietHours: null,
      },
    );
  });

  router.put("/preferences", requireAuth, async (req, res) => {
    const userId = (req.user as any)?.id;
    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }
    const body = req.body as any;
    const preferences = await engine.updatePreferences({
      userId,
      emailEnabled: Boolean(body?.emailEnabled),
      smsEnabled: Boolean(body?.smsEnabled),
      slackEnabled: Boolean(body?.slackEnabled),
      emailAddress: typeof body?.emailAddress === "string" ? body.emailAddress : (req.user as any)?.email ?? null,
      phoneNumber: typeof body?.phoneNumber === "string" ? body.phoneNumber : null,
      slackWebhook: typeof body?.slackWebhook === "string" ? body.slackWebhook : null,
      quietHours: body?.quietHours?.start && body?.quietHours?.end ? { start: body.quietHours.start, end: body.quietHours.end } : null,
    });
    res.json(preferences);
  });

  router.get("/rules", requireAdminOrSuperAdmin, async (_req, res) => {
    const rules = await engine.listRules();
    res.json({ rules });
  });

  router.post("/rules", requireAdminOrSuperAdmin, async (req, res) => {
    const body = req.body as Partial<AlertRule>;
    if (!body?.name || !body.metric || typeof body.threshold === "undefined") {
      res.status(400).json({ message: "name, metric and threshold are required" });
      return;
    }

    const cohort = parseCohort(body.cohort);
    const rule = await engine.configureRule({
      name: body.name,
      metric: String(body.metric),
      comparison: body.comparison ?? "above",
      threshold: Number(body.threshold),
      branchId: body.branchId ?? null,
      cohort,
      cohortKey: computeCohortKey(cohort),
      schedule: parseSchedule(body.schedule),
      channels: parseChannels(body.channels),
      subscribers: Array.isArray(body.subscribers)
        ? body.subscribers.map((sub: any) => ({ userId: String(sub.userId ?? sub) }))
        : [],
      isActive: body.isActive !== false,
      createdBy: (req.user as any)?.id ?? null,
    });
    res.status(201).json(rule);
  });

  router.put("/rules/:id", requireAdminOrSuperAdmin, async (req, res) => {
    const updates = req.body as Partial<AlertRule>;
    if (updates.cohort) {
      const parsed = parseCohort(updates.cohort);
      updates.cohort = parsed;
      updates.cohortKey = computeCohortKey(parsed);
    }
    const updated = await engine.updateRule(req.params.id, updates);
    if (!updated) {
      res.status(404).json({ message: "Rule not found" });
      return;
    }
    res.json(updated);
  });

  router.post("/run", requireAdminOrSuperAdmin, async (_req, res) => {
    await engine.runDueRules();
    res.json({ status: "queued" });
  });

  app.use("/api/alerts", router);
}
