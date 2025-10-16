import type { Express } from "express";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireAdminOrSuperAdmin } from "../auth";
import type { WorkflowEngine } from "../services/workflows/engine";

const workflowPayloadSchema = z.object({
  definition: z.record(z.any()),
  nodes: z.array(z.record(z.any())),
  edges: z.array(z.record(z.any())),
});

const triggerSimulationSchema = z.object({
  triggerType: z.string(),
  payload: z.record(z.any()).optional().default({}),
});

export function registerWorkflowRoutes(app: Express, engine: WorkflowEngine): void {
  const router = Router();

  router.get("/catalog", requireAuth, (_req, res) => {
    res.json({
      triggers: engine.listTriggers().map((trigger) => ({
        type: trigger.type,
        label: trigger.label,
        description: trigger.description ?? null,
      })),
      actions: engine.listActions().map((action) => ({
        type: action.type,
        label: action.label,
        description: action.description ?? null,
        supportsSimulation: action.supportsSimulation ?? false,
      })),
    });
  });

  router.get("/", requireAuth, async (_req, res) => {
    const workflows = await engine.listWorkflows();
    res.json({ workflows });
  });

  router.post("/", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const payload = workflowPayloadSchema.parse(req.body);
      const workflow = await engine.createWorkflow(payload);
      res.status(201).json(workflow);
    } catch (error) {
      res.status(400).json({
        message: "Failed to create workflow",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/:id", requireAuth, async (req, res) => {
    const workflow = await engine.getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }
    res.json(workflow);
  });

  router.put("/:id", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const payload = workflowPayloadSchema.parse(req.body);
      const workflow = await engine.updateWorkflow(req.params.id, payload);
      if (!workflow) {
        res.status(404).json({ message: "Workflow not found" });
        return;
      }
      res.json(workflow);
    } catch (error) {
      res.status(400).json({
        message: "Failed to update workflow",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.delete("/:id", requireAdminOrSuperAdmin, async (req, res) => {
    const deleted = await engine.deleteWorkflow(req.params.id);
    if (!deleted) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }
    res.status(204).send();
  });

  router.post("/:id/validate", requireAdminOrSuperAdmin, async (req, res) => {
    const result = await engine.validateWorkflow(req.params.id);
    if (!result) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }
    res.json(result);
  });

  router.post("/:id/simulate", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const payload = triggerSimulationSchema.parse(req.body);
      const simulation = await engine.simulateWorkflow(
        req.params.id,
        payload.triggerType,
        payload.payload,
      );
      if (!simulation) {
        res.status(404).json({ message: "Workflow not found" });
        return;
      }
      res.json(simulation);
    } catch (error) {
      res.status(400).json({
        message: "Simulation failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/trigger/:type", requireAdminOrSuperAdmin, async (req, res) => {
    try {
      const payload = z.record(z.any()).parse(req.body ?? {});
      const results = await engine.runTrigger(req.params.type, payload);
      res.json({ results });
    } catch (error) {
      res.status(400).json({
        message: "Trigger execution failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.use("/api/workflows", router);
}
