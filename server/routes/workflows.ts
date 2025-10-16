import type { Express } from "express";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireWorkflowBuilderEdit, requireWorkflowBuilderPublish } from "../auth";
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

  router.get("/catalog", requireAuth, requireWorkflowBuilderEdit, (_req, res) => {
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

  router.get("/", requireAuth, requireWorkflowBuilderEdit, async (_req, res) => {
    const workflows = await engine.listWorkflows();
    res.json({ workflows });
  });

  router.post("/", requireWorkflowBuilderEdit, async (req, res) => {
    try {
      const payload = workflowPayloadSchema.parse(req.body);
      const workflow = await engine.createWorkflow(payload);
      res.status(201).json(workflow);
      if (req.audit) {
        await req.audit.log({
          type: "workflow.created",
          entityType: "workflow",
          entityId: workflow.id,
          metadata: {
            name: (workflow as any).name ?? null,
            nodeCount: payload.nodes.length,
          },
        });
      }
    } catch (error) {
      res.status(400).json({
        message: "Failed to create workflow",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/:id", requireAuth, requireWorkflowBuilderEdit, async (req, res) => {
    const workflow = await engine.getWorkflow(req.params.id);
    if (!workflow) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }
    res.json(workflow);
  });

  router.put("/:id", requireWorkflowBuilderEdit, async (req, res) => {
    try {
      const payload = workflowPayloadSchema.parse(req.body);
      const workflow = await engine.updateWorkflow(req.params.id, payload);
      if (!workflow) {
        res.status(404).json({ message: "Workflow not found" });
        return;
      }
      res.json(workflow);
      if (req.audit) {
        await req.audit.log({
          type: "workflow.updated",
          entityType: "workflow",
          entityId: workflow.id,
          metadata: {
            nodeCount: payload.nodes.length,
            edgeCount: payload.edges.length,
          },
        });
      }
    } catch (error) {
      res.status(400).json({
        message: "Failed to update workflow",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.delete("/:id", requireWorkflowBuilderEdit, async (req, res) => {
    const deleted = await engine.deleteWorkflow(req.params.id);
    if (!deleted) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }
    if (req.audit) {
      await req.audit.log({
        type: "workflow.deleted",
        entityType: "workflow",
        entityId: req.params.id,
        severity: "warning",
      });
    }
    res.status(204).send();
  });

  router.post("/:id/validate", requireWorkflowBuilderEdit, async (req, res) => {
    const result = await engine.validateWorkflow(req.params.id);
    if (!result) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }
    if (req.audit) {
      await req.audit.log({
        type: "workflow.validated",
        entityType: "workflow",
        entityId: req.params.id,
        metadata: {
          warnings: result.warnings.length,
          errors: result.errors.length,
        },
      });
    }
    res.json(result);
  });

  router.post("/:id/simulate", requireWorkflowBuilderEdit, async (req, res) => {
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
      if (req.audit) {
        await req.audit.log({
          type: "workflow.simulated",
          entityType: "workflow",
          entityId: req.params.id,
          metadata: {
            triggerType: payload.triggerType,
          },
        });
      }
      res.json(simulation);
    } catch (error) {
      res.status(400).json({
        message: "Simulation failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/trigger/:type", requireWorkflowBuilderPublish, async (req, res) => {
    try {
      const payload = z.record(z.any()).parse(req.body ?? {});
      const results = await engine.runTrigger(req.params.type, payload);
      if (req.audit) {
        await req.audit.log({
          type: "workflow.triggered",
          entityType: "workflow_trigger",
          entityId: req.params.type,
          severity: "warning",
          metadata: {
            resultCount: Array.isArray(results) ? results.length : 0,
          },
        });
      }
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
