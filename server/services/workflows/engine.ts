import { differenceInMilliseconds } from "date-fns";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  workflowDefinitions,
  workflowNodes,
  workflowEdges,
  workflowExecutions,
  workflowExecutionEvents,
  workflowStatusEnum,
  workflowExecutionStatusEnum,
  workflowNodeKindEnum,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
  insertWorkflowDefinitionSchema,
  insertWorkflowNodeSchema,
  insertWorkflowEdgeSchema,
} from "@shared/schema";
import { db } from "../../db";

export type WorkflowStatus = (typeof workflowStatusEnum)[number];
export type WorkflowExecutionStatus =
  (typeof workflowExecutionStatusEnum)[number];
export type WorkflowNodeKind = (typeof workflowNodeKindEnum)[number];

export interface WorkflowDefinitionWithGraph extends WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowExecutionLog {
  nodeId?: string | null;
  eventType: string;
  message?: string | null;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export interface WorkflowExecutionResult {
  executionId?: string | null;
  status: WorkflowExecutionStatus;
  logs: WorkflowExecutionLog[];
  context: Record<string, unknown>;
  durationMs: number;
}

export interface TriggerContext {
  triggerType: string;
  payload: Record<string, unknown>;
  workflow: WorkflowDefinitionWithGraph;
}

export interface TriggerDefinition<TPayload extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string;
  label: string;
  description?: string;
  schema: TPayload;
  resolveContext: (input: z.infer<TPayload>) => Promise<Record<string, unknown>>;
}

export interface ActionExecutor {
  type: string;
  label: string;
  description?: string;
  run: (params: {
    node: WorkflowNode;
    context: Record<string, unknown>;
    payload: Record<string, unknown>;
    trigger: TriggerContext;
    simulation: boolean;
  }) => Promise<ActionResult>;
  validate?: (node: WorkflowNode) => string[];
  supportsSimulation?: boolean;
}

export interface ActionResult {
  status: "success" | "failure";
  contextPatch?: Record<string, unknown>;
  message?: string;
  error?: string;
}

export interface WorkflowUpsertInput {
  definition: Record<string, unknown>;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export interface ValidateWorkflowResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WorkflowEngineOptions {
  logger?: Pick<Console, "info" | "warn" | "error">;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export class WorkflowEngine {
  private readonly triggers = new Map<string, TriggerDefinition>();
  private readonly actions = new Map<string, ActionExecutor>();
  private readonly logger: Pick<Console, "info" | "warn" | "error">;

  constructor(options: WorkflowEngineOptions = {}) {
    this.logger = options.logger ?? console;
    this.bootstrapDefaults();
  }

  private bootstrapDefaults() {
    this.registerTrigger({
      type: "orders.created",
      label: "Order Created",
      description: "Fires whenever a new order is entered into the system.",
      schema: z.object({
        orderId: z.string(),
        branchId: z.string().optional(),
        total: z.number().nonnegative().optional(),
        customerId: z.string().optional(),
      }),
      resolveContext: async (payload) => ({
        orderId: payload.orderId,
        branchId: payload.branchId ?? null,
        total: payload.total ?? 0,
        customerId: payload.customerId ?? null,
      }),
    });

    this.registerTrigger({
      type: "customers.segmented",
      label: "Customer Segmented",
      description: "Runs when a customer is added to a marketing segment.",
      schema: z.object({
        customerId: z.string(),
        segment: z.string(),
        branchId: z.string().optional(),
      }),
      resolveContext: async (payload) => ({
        customerId: payload.customerId,
        segment: payload.segment,
        branchId: payload.branchId ?? null,
      }),
    });

    this.registerAction({
      type: "notifications.dispatch",
      label: "Send Notification",
      description: "Queues an email, SMS, or in-app notification.",
      async run({ node, context }) {
        const cfg = asRecord(node.config);
        const channel = typeof cfg.channel === "string" ? cfg.channel : "email";
        const template = typeof cfg.template === "string" ? cfg.template : "generic";
        const audience = typeof cfg.audience === "string" ? cfg.audience : "customer";
        const message = `Notification (${channel}) using template ${template} targeted at ${audience}`;
        return { status: "success", message, contextPatch: { lastNotificationAt: new Date().toISOString(), lastNotificationMessage: message, lastNotificationChannel: channel } };
      },
      validate(node) {
        const cfg = asRecord(node.config);
        const errors: string[] = [];
        if (!cfg.template) errors.push("Notification node is missing a template selection");
        if (cfg.channel && !["email", "sms", "slack", "push"].includes(String(cfg.channel))) {
          errors.push(`Unsupported notification channel: ${cfg.channel}`);
        }
        return errors;
      },
      supportsSimulation: true,
    });

    this.registerAction({
      type: "integrations.webhook",
      label: "Invoke Webhook",
      description: "Posts workflow payload to an external system.",
      async run({ node, context, payload, simulation }) {
        const cfg = asRecord(node.config);
        const endpoint = typeof cfg.url === "string" ? cfg.url : "";
        if (!endpoint) {
          return { status: "failure", error: "Webhook URL is required" };
        }
        const merged = { ...context, ...payload };
        const preview = JSON.stringify(merged).slice(0, 200);
        const message = simulation
          ? `Simulated webhook to ${endpoint} with payload preview ${preview}`
          : `Webhook request enqueued for ${endpoint}`;
        return {
          status: "success",
          message,
          contextPatch: {
            lastWebhookUrl: endpoint,
            lastWebhookPreview: preview,
          },
        };
      },
      validate(node) {
        const cfg = asRecord(node.config);
        if (!cfg.url) {
          return ["Webhook nodes require a URL"];
        }
        return [];
      },
      supportsSimulation: true,
    });

    this.registerAction({
      type: "crm.update-field",
      label: "Update CRM Field",
      description: "Writes calculated fields back to the CRM or marketing list.",
      async run({ node, context }) {
        const cfg = asRecord(node.config);
        const field = typeof cfg.field === "string" ? cfg.field : "lifetime_value";
        const value = cfg.value ?? context[field] ?? null;
        return {
          status: "success",
          message: `Updated ${field} to ${value}`,
          contextPatch: {
            [`crm:${field}`]: value,
          },
        };
      },
      supportsSimulation: true,
    });
  }

  registerTrigger(definition: TriggerDefinition): void {
    this.triggers.set(definition.type, definition);
  }

  registerAction(executor: ActionExecutor): void {
    this.actions.set(executor.type, executor);
  }

  listTriggers(): TriggerDefinition[] {
    return Array.from(this.triggers.values());
  }

  listActions(): ActionExecutor[] {
    return Array.from(this.actions.values());
  }

  async listWorkflows(): Promise<WorkflowDefinitionWithGraph[]> {
    const definitions = await db.select().from(workflowDefinitions).orderBy(workflowDefinitions.createdAt);
    return Promise.all(definitions.map((row) => this.hydrateWorkflow(row)));
  }

  async getWorkflow(id: string): Promise<WorkflowDefinitionWithGraph | null> {
    const [definition] = await db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, id));
    if (!definition) return null;
    return this.hydrateWorkflow(definition);
  }

  async createWorkflow(input: WorkflowUpsertInput): Promise<WorkflowDefinitionWithGraph> {
    const definitionInput = insertWorkflowDefinitionSchema.parse(input.definition);
    const nodeInputs = input.nodes.map((node) => insertWorkflowNodeSchema.parse(node));
    const edgeInputs = input.edges.map((edge) => insertWorkflowEdgeSchema.parse(edge));

    const validation = await this.validateGraph(nodeInputs as any, edgeInputs as any);
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.join(", ")}`);
    }

    return db.transaction(async (tx) => {
      const [definition] = await tx
        .insert(workflowDefinitions)
        .values({
          ...definitionInput,
          metadata: {
            ...asRecord(definitionInput.metadata),
            triggerTypes: nodeInputs
              .filter((node) => node.kind === "trigger")
              .map((node) => node.type),
            actionTypes: nodeInputs
              .filter((node) => node.kind === "action")
              .map((node) => node.type),
          },
        })
        .returning();

      const nodeIdMap = new Map<string, string>();
      for (const node of nodeInputs) {
        const key = node.key;
        const [created] = await tx
          .insert(workflowNodes)
          .values({
            ...node,
            workflowId: definition.id,
          })
          .returning();
        nodeIdMap.set(key, created.id);
      }

      for (const edge of edgeInputs) {
        const sourceId = nodeIdMap.get(edge.sourceNodeId) ?? edge.sourceNodeId;
        const targetId = nodeIdMap.get(edge.targetNodeId) ?? edge.targetNodeId;
        await tx.insert(workflowEdges).values({
          ...edge,
          workflowId: definition.id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
        });
      }

      return this.hydrateWorkflow(definition);
    });
  }

  async updateWorkflow(id: string, input: WorkflowUpsertInput): Promise<WorkflowDefinitionWithGraph | null> {
    const definition = await this.getWorkflow(id);
    if (!definition) return null;

    const definitionInput = insertWorkflowDefinitionSchema.partial().parse(input.definition);
    const nodeInputs = input.nodes.map((node) => insertWorkflowNodeSchema.partial().required({ key: true, kind: true, type: true }).parse(node));
    const edgeInputs = input.edges.map((edge) => insertWorkflowEdgeSchema.partial().required({ sourceNodeId: true, targetNodeId: true }).parse(edge));

    const validation = await this.validateGraph(nodeInputs as any, edgeInputs as any);
    if (!validation.valid) {
      throw new Error(`Workflow validation failed: ${validation.errors.join(", ")}`);
    }

    return db.transaction(async (tx) => {
      await tx
        .update(workflowDefinitions)
        .set({
          ...definitionInput,
          metadata: {
            ...asRecord(definition.metadata),
            ...asRecord(definitionInput.metadata),
            triggerTypes: nodeInputs
              .filter((node) => node.kind === "trigger")
              .map((node) => node.type),
            actionTypes: nodeInputs
              .filter((node) => node.kind === "action")
              .map((node) => node.type),
          },
          updatedAt: new Date(),
        })
        .where(eq(workflowDefinitions.id, id));

      await tx.delete(workflowEdges).where(eq(workflowEdges.workflowId, id));
      await tx.delete(workflowNodes).where(eq(workflowNodes.workflowId, id));

      const nodeIdMap = new Map<string, string>();
      for (const node of nodeInputs) {
        const [created] = await tx
          .insert(workflowNodes)
          .values({
            ...node,
            workflowId: id,
          })
          .returning();
        nodeIdMap.set(node.key, created.id);
      }

      for (const edge of edgeInputs) {
        const sourceId = nodeIdMap.get(edge.sourceNodeId) ?? edge.sourceNodeId;
        const targetId = nodeIdMap.get(edge.targetNodeId) ?? edge.targetNodeId;
        await tx.insert(workflowEdges).values({
          ...edge,
          workflowId: id,
          sourceNodeId: sourceId,
          targetNodeId: targetId,
        });
      }

      const refreshed = await this.getWorkflow(id);
      if (!refreshed) throw new Error("Workflow disappeared during update");
      return refreshed;
    });
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    const result = await db
      .update(workflowDefinitions)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(workflowDefinitions.id, id));
    return Boolean(result.rowCount && result.rowCount > 0);
  }

  async validateWorkflow(id: string): Promise<ValidateWorkflowResult | null> {
    const workflow = await this.getWorkflow(id);
    if (!workflow) return null;
    return this.validateGraph(workflow.nodes, workflow.edges);
  }

  async simulateWorkflow(
    id: string,
    triggerType: string,
    payload: Record<string, unknown>,
  ): Promise<WorkflowExecutionResult | null> {
    const workflow = await this.getWorkflow(id);
    if (!workflow) return null;
    return this.runWorkflow(workflow, triggerType, payload, { simulation: true });
  }

  async runTrigger(
    triggerType: string,
    payload: Record<string, unknown>,
  ): Promise<WorkflowExecutionResult[]> {
    const trigger = this.triggers.get(triggerType);
    if (!trigger) {
      throw new Error(`Unknown trigger type: ${triggerType}`);
    }
    const parsed = trigger.schema.parse(payload);
    const context = await trigger.resolveContext(parsed);

    const rows = await db
      .select({ id: workflowDefinitions.id })
      .from(workflowDefinitions)
      .innerJoin(
        workflowNodes,
        and(
          eq(workflowNodes.workflowId, workflowDefinitions.id),
          eq(workflowNodes.kind, "trigger"),
          eq(workflowNodes.type, triggerType),
        ),
      )
      .where(eq(workflowDefinitions.status, "active"));

    const workflowIds = Array.from(new Set(rows.map((row) => row.id)));
    if (workflowIds.length === 0) return [];

    const workflows = await Promise.all(
      workflowIds.map((workflowId) => this.getWorkflow(workflowId)),
    );

    const results: WorkflowExecutionResult[] = [];
    for (const workflow of workflows) {
      if (!workflow) continue;
      const result = await this.runWorkflow(workflow, triggerType, {
        ...parsed,
        ...context,
      });
      results.push(result);
    }
    return results;
  }

  private async runWorkflow(
    workflow: WorkflowDefinitionWithGraph,
    triggerType: string,
    payload: Record<string, unknown>,
    options: { simulation?: boolean } = {},
  ): Promise<WorkflowExecutionResult> {
    const simulation = Boolean(options.simulation);
    const trigger: TriggerContext = {
      triggerType,
      payload,
      workflow,
    };

    return db.transaction(async (tx) => {
      const start = new Date();
      const logs: WorkflowExecutionLog[] = [];
      let executionId: string | null = null;
      let status: WorkflowExecutionStatus = "pending";
      let context: Record<string, unknown> = { ...payload };

      const recordLog = async (
        eventType: string,
        message?: string,
        nodeId?: string,
        extra?: Record<string, unknown>,
      ) => {
        const entry: WorkflowExecutionLog = {
          eventType,
          message,
          nodeId,
          payload: extra,
          createdAt: new Date(),
        };
        logs.push(entry);
        if (!simulation && executionId) {
          await tx.insert(workflowExecutionEvents).values({
            executionId,
            nodeId: nodeId ?? null,
            eventType,
            message: message ?? null,
            payload: extra ?? {},
          });
        }
      };

      try {
        if (!simulation) {
          const [created] = await tx
            .insert(workflowExecutions)
            .values({
              workflowId: workflow.id,
              triggerType,
              status: "running",
              context,
              triggerPayload: payload,
              metadata: { simulation: false },
            })
            .returning();
          executionId = created.id;
        }

        const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
        const triggers = workflow.nodes.filter(
          (node) => node.kind === "trigger" && node.type === triggerType,
        );
        if (triggers.length === 0) {
          await recordLog("no_trigger", `No trigger nodes for ${triggerType}`);
          status = "failed";
          return {
            executionId,
            status,
            logs,
            context,
            durationMs: differenceInMilliseconds(new Date(), start),
          };
        }

        const edgesBySource = new Map<string, WorkflowEdge[]>(
          workflow.edges.reduce((acc, edge) => {
            const existing = acc.get(edge.sourceNodeId) ?? [];
            existing.push(edge);
            acc.set(edge.sourceNodeId, existing);
            return acc;
          }, new Map<string, WorkflowEdge[]>()),
        );

        const actionQueue = triggers.flatMap((triggerNode) =>
          edgesBySource.get(triggerNode.id) ?? [],
        );

        status = "running";

        while (actionQueue.length) {
          const edge = actionQueue.shift();
          if (!edge) break;
          const node = nodesById.get(edge.targetNodeId);
          if (!node) {
            await recordLog("missing_node", "Edge target missing", edge.sourceNodeId, {
              edgeId: edge.id,
              targetNodeId: edge.targetNodeId,
            });
            continue;
          }

          await recordLog("node_started", `Executing node ${node.label}`, node.id, {
            nodeType: node.type,
            nodeKind: node.kind,
          });

          if (node.kind === "action") {
            const executor = this.actions.get(node.type);
            if (!executor) {
              await recordLog("unknown_action", `No executor for ${node.type}`, node.id);
              continue;
            }
            const result = await executor.run({
              node,
              context,
              payload,
              trigger,
              simulation,
            });

            if (result.contextPatch) {
              context = { ...context, ...result.contextPatch };
            }
            if (result.status === "failure") {
              status = "failed";
              await recordLog("action_failed", result.error ?? "Action failed", node.id);
              break;
            }
            await recordLog("action_completed", result.message ?? "Action complete", node.id);
          }

          const nextEdges = edgesBySource.get(node.id) ?? [];
          actionQueue.push(...nextEdges);
        }

        if (status !== "failed") {
          status = "completed";
        }

        return {
          executionId,
          status,
          logs,
          context,
          durationMs: differenceInMilliseconds(new Date(), start),
        };
      } catch (error) {
        status = "failed";
        await recordLog("error", error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        if (!simulation && executionId) {
          await tx
            .update(workflowExecutions)
            .set({
              status,
              context,
              completedAt: new Date(),
              metadata: { simulation: false },
            })
            .where(eq(workflowExecutions.id, executionId));
        }
      }
    });
  }

  private async hydrateWorkflow(
    definition: WorkflowDefinition,
  ): Promise<WorkflowDefinitionWithGraph> {
    const nodes = await db
      .select()
      .from(workflowNodes)
      .where(eq(workflowNodes.workflowId, definition.id));
    const edges = await db
      .select()
      .from(workflowEdges)
      .where(eq(workflowEdges.workflowId, definition.id));
    return { ...definition, nodes, edges };
  }

  private async validateGraph(
    nodes: Array<Pick<WorkflowNode, "key" | "kind" | "type"> & Record<string, unknown>>,
    edges: Array<Pick<WorkflowEdge, "sourceNodeId" | "targetNodeId"> & Record<string, unknown>>,
  ): Promise<ValidateWorkflowResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!nodes.some((node) => node.kind === "trigger")) {
      errors.push("Workflow requires at least one trigger node");
    }
    if (!nodes.some((node) => node.kind === "action")) {
      warnings.push("Workflow has no action nodes");
    }

    for (const node of nodes) {
      if (node.kind === "trigger" && !this.triggers.has(node.type)) {
        errors.push(`Unknown trigger type: ${node.type}`);
      }
      if (node.kind === "action" && !this.actions.has(node.type)) {
        errors.push(`Unknown action type: ${node.type}`);
      }
    }

    const nodeKeys = new Set(nodes.map((node) => node.key));
    const missingNodes = new Set<string>();
    for (const edge of edges) {
      if (!nodeKeys.has(String(edge.sourceNodeId))) {
        missingNodes.add(String(edge.sourceNodeId));
      }
      if (!nodeKeys.has(String(edge.targetNodeId))) {
        missingNodes.add(String(edge.targetNodeId));
      }
    }
    if (missingNodes.size) {
      errors.push(`Edges reference unknown nodes: ${Array.from(missingNodes).join(", ")}`);
    }

    for (const node of nodes) {
      const executor = node.kind === "action" ? this.actions.get(node.type) : undefined;
      if (executor?.validate) {
        const validationErrors = executor.validate(node as WorkflowNode);
        errors.push(...validationErrors);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
