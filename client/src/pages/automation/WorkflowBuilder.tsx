import { useEffect, useMemo, useState, useCallback, type DragEvent } from "react";
import {
  ReactFlowProvider,
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface WorkflowNodeData {
  label: string;
  kind: "trigger" | "action" | "condition";
  type: string;
  config?: Record<string, unknown>;
}

interface CatalogEntry {
  type: string;
  label: string;
  description: string | null;
  supportsSimulation?: boolean;
}

interface WorkflowCatalogResponse {
  triggers: CatalogEntry[];
  actions: CatalogEntry[];
}

interface ValidationState {
  status: "idle" | "valid" | "warning" | "error";
  messages: string[];
}

interface SimulationResult {
  status: string;
  durationMs: number;
  context: Record<string, unknown>;
}

function randomId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? Math.random().toString(36).slice(2, 10)}`;
}

function serializeNodes(nodes: Node<WorkflowNodeData>[]) {
  return nodes.map((node) => ({
    key: node.id,
    label: node.data.label,
    kind: node.data.kind,
    type: node.data.type,
    config: node.data.config ?? {},
    positionX: Math.round(node.position.x),
    positionY: Math.round(node.position.y),
  }));
}

function serializeEdges(edges: Edge[]) {
  return edges.map((edge) => ({
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    label: edge.label,
  }));
}

function validateGraph(nodes: Node<WorkflowNodeData>[], edges: Edge[]): ValidationState {
  if (!nodes.length) {
    return { status: "error", messages: ["Add at least one trigger node to begin"] };
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasTrigger = nodes.some((node) => node.data.kind === "trigger");
  const hasAction = nodes.some((node) => node.data.kind === "action");
  if (!hasTrigger) errors.push("Workflow requires at least one trigger node");
  if (!hasAction) warnings.push("Consider adding at least one action node");
  const connectedTargets = new Set(edges.map((edge) => edge.target));
  for (const node of nodes) {
    if (node.data.kind !== "trigger" && !connectedTargets.has(node.id)) {
      warnings.push(`${node.data.label} is not connected to an upstream node`);
    }
  }
  if (errors.length) return { status: "error", messages: errors.concat(warnings) };
  if (warnings.length) return { status: "warning", messages: warnings };
  return { status: "valid", messages: ["Workflow graph looks good"] };
}

function WorkflowBuilderCanvas() {
  const [catalog, setCatalog] = useState<WorkflowCatalogResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("Untitled automation");
  const [workflowDescription, setWorkflowDescription] = useState("Follow up with customers based on order activity.");
  const [validation, setValidation] = useState<ValidationState>({ status: "idle", messages: [] });
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simulationTrigger, setSimulationTrigger] = useState<string>("orders.created");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const initialNodes: Node<WorkflowNodeData>[] = useMemo(
    () => [
      {
        id: "trigger-1",
        position: { x: 150, y: 120 },
        data: {
          label: "Order Created",
          kind: "trigger",
          type: "orders.created",
          config: {},
        },
        type: "default",
      },
    ],
    [],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      try {
        const res = await fetch("/api/workflows/catalog");
        if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
        const json = (await res.json()) as WorkflowCatalogResponse;
        if (!cancelled) {
          setCatalog(json);
          if (json.triggers.length) {
            setSimulationTrigger(json.triggers[0].type);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("application/workflow-node");
      if (!data || !reactFlowInstance) return;
      try {
        const parsed = JSON.parse(data) as CatalogEntry & { kind: WorkflowNodeData["kind"] };
        const position = reactFlowInstance.project({
          x: event.clientX - event.currentTarget.getBoundingClientRect().left,
          y: event.clientY - event.currentTarget.getBoundingClientRect().top,
        });
        const nodeId = randomId(parsed.kind);
        const newNode: Node<WorkflowNodeData> = {
          id: nodeId,
          position,
          data: {
            label: parsed.label,
            kind: parsed.kind,
            type: parsed.type,
            config: {},
          },
          type: "default",
        };
        setNodes((nds) => nds.concat(newNode));
      } catch (error) {
        console.error("Failed to drop node", error);
      }
    },
    [reactFlowInstance, setNodes],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId), [nodes, selectedNodeId]);

  const applyNodeConfig = useCallback(
    (nodeId: string, updates: Partial<WorkflowNodeData>) => {
      setNodes((existing) =>
        existing.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...updates,
                },
              }
            : node,
        ),
      );
    },
    [setNodes],
  );

  const handleSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNodeId(params.nodes?.[0]?.id ?? null);
  }, []);

  const handleValidate = useCallback(() => {
    setValidation(validateGraph(nodes, edges));
  }, [nodes, edges]);

  const saveWorkflow = useCallback(async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const payload = {
        definition: {
          name: workflowName,
          description: workflowDescription,
        },
        nodes: serializeNodes(nodes),
        edges: serializeEdges(edges),
      };
      const response = await fetch(workflowId ? `/api/workflows/${workflowId}` : "/api/workflows", {
        method: workflowId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error?.error ?? error?.message ?? "Failed to save workflow");
      }
      const saved = await response.json();
      if (saved?.id) {
        setWorkflowId(saved.id);
      } else if (saved?.workflowId) {
        setWorkflowId(saved.workflowId);
      }
      setStatusMessage("Workflow saved");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [edges, nodes, workflowDescription, workflowId, workflowName]);

  const runSimulation = useCallback(async () => {
    if (!workflowId) {
      setStatusMessage("Save the workflow before running simulation");
      return;
    }
    try {
      const response = await fetch(`/api/workflows/${workflowId}/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ triggerType: simulationTrigger, payload: {} }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error?.error ?? error?.message ?? "Simulation failed");
      }
      const result = (await response.json()) as SimulationResult;
      setSimulationResult(result);
      setStatusMessage(`Simulation completed in ${result.durationMs.toFixed(0)} ms`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }, [simulationTrigger, workflowId]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Automation Workflow Builder</h1>
        <p className="text-muted-foreground">
          Design event-driven automations by connecting triggers to actions. Drag entries from the catalog into the canvas,
          then connect them to define execution paths.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Canvas</CardTitle>
            <CardDescription>Drag nodes from the catalog and connect them to define your workflow.</CardDescription>
          </CardHeader>
          <CardContent className="h-[520px]">
            <ReactFlowProvider>
              <div className="flex h-full gap-4">
                <div className="w-60 rounded border bg-muted/40">
                  <ScrollArea className="h-full p-3">
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Triggers
                    </h3>
                    {catalog?.triggers.map((trigger) => (
                      <div
                        key={trigger.type}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "application/workflow-node",
                            JSON.stringify({ ...trigger, kind: "trigger" as const }),
                          );
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        className="mb-2 cursor-grab rounded border bg-background p-2 text-sm shadow-sm transition hover:bg-primary/5"
                      >
                        <div className="font-medium">{trigger.label}</div>
                        {trigger.description ? (
                          <p className="text-xs text-muted-foreground">{trigger.description}</p>
                        ) : null}
                      </div>
                    ))}

                    <h3 className="mt-4 mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </h3>
                    {catalog?.actions.map((action) => (
                      <div
                        key={action.type}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "application/workflow-node",
                            JSON.stringify({ ...action, kind: "action" as const }),
                          );
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        className="mb-2 cursor-grab rounded border bg-background p-2 text-sm shadow-sm transition hover:bg-primary/5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{action.label}</span>
                          {action.supportsSimulation ? <Badge variant="secondary">Sim</Badge> : null}
                        </div>
                        {action.description ? (
                          <p className="text-xs text-muted-foreground">{action.description}</p>
                        ) : null}
                      </div>
                    ))}
                    {loadError ? (
                      <p className="text-xs text-destructive">{loadError}</p>
                    ) : null}
                  </ScrollArea>
                </div>
                <div className="flex-1 rounded border" onDrop={onDrop} onDragOver={onDragOver}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onSelectionChange={handleSelectionChange}
                    onInit={setReactFlowInstance}
                    fitView
                  >
                    <Background />
                    <MiniMap />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </div>
              </div>
            </ReactFlowProvider>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Workflow details</CardTitle>
            <CardDescription>Configure metadata, run validation, and simulate execution paths.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="workflow-name">
                Workflow name
              </label>
              <Input
                id="workflow-name"
                value={workflowName}
                onChange={(event) => setWorkflowName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="workflow-description">
                Description
              </label>
              <Textarea
                id="workflow-description"
                value={workflowDescription}
                onChange={(event) => setWorkflowDescription(event.target.value)}
                rows={3}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleValidate} variant="secondary">
                Validate graph
              </Button>
              <Button onClick={saveWorkflow} disabled={saving}>
                {saving ? "Saving..." : "Save draft"}
              </Button>
              <Button variant="outline" onClick={runSimulation}>
                Simulate trigger
              </Button>
            </div>
            {validation.status !== "idle" ? (
              <div
                className={`rounded border p-3 text-sm ${
                  validation.status === "valid"
                    ? "border-green-500 bg-green-50 text-green-800"
                    : validation.status === "warning"
                    ? "border-amber-500 bg-amber-50 text-amber-800"
                    : "border-destructive bg-destructive/10 text-destructive"
                }`}
              >
                <p className="font-medium">Validation</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {validation.messages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="simulation-trigger">
                Simulation trigger
              </label>
              <select
                id="simulation-trigger"
                className="w-full rounded border bg-background p-2 text-sm"
                value={simulationTrigger}
                onChange={(event) => setSimulationTrigger(event.target.value)}
              >
                {nodes
                  .filter((node) => node.data.kind === "trigger")
                  .map((node) => (
                    <option key={node.id} value={node.data.type}>
                      {node.data.label}
                    </option>
                  ))}
              </select>
              {simulationResult ? (
                <div className="rounded border border-primary/40 bg-primary/5 p-3 text-sm">
                  <div className="font-medium">Simulation result</div>
                  <p className="text-xs text-muted-foreground">Status: {simulationResult.status}</p>
                  <p className="text-xs text-muted-foreground">Duration: {simulationResult.durationMs.toFixed(0)} ms</p>
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-background p-2 text-xs">
                    {JSON.stringify(simulationResult.context, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="workflow-identifier">
                Workflow identifier
              </label>
              <Input
                id="workflow-identifier"
                value={workflowId ?? ""}
                placeholder="Automatically set after saving"
                onChange={(event) => setWorkflowId(event.target.value || null)}
              />
              {statusMessage ? <p className="text-xs text-muted-foreground">{statusMessage}</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedNode ? (
        <Card>
          <CardHeader>
            <CardTitle>Selected node</CardTitle>
            <CardDescription>Edit the label and configuration payload for the active node.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor={`selected-node-${selectedNode.id}-label`}
                >
                  Node label
                </label>
                <Input
                  id={`selected-node-${selectedNode.id}-label`}
                  value={selectedNode.data.label}
                  onChange={(event) => applyNodeConfig(selectedNode.id, { label: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor={`selected-node-${selectedNode.id}-type`}
                >
                  Node type
                </label>
                <Input
                  id={`selected-node-${selectedNode.id}-type`}
                  value={selectedNode.data.type}
                  readOnly
                  disabled
                />
              </div>
            </div>
            <Tabs defaultValue="visual">
              <TabsList>
                <TabsTrigger value="visual">Visual</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="visual" className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Configuration is stored as JSON. Use the JSON tab to paste structured payloads, or keep it empty for default
                  settings.
                </p>
              </TabsContent>
              <TabsContent value="json" className="space-y-2">
                <Textarea
                  rows={8}
                  value={JSON.stringify(selectedNode.data.config ?? {}, null, 2)}
                  onChange={(event) => {
                    try {
                      const value = event.target.value.trim() ? JSON.parse(event.target.value) : {};
                      applyNodeConfig(selectedNode.id, { config: value });
                    } catch (error) {
                      console.warn("Invalid JSON", error);
                    }
                  }}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export default function WorkflowBuilderPage() {
  return (
    <div className="space-y-6">
      <WorkflowBuilderCanvas />
    </div>
  );
}
