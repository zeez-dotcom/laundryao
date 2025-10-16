import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { auditEvents } from "@shared/schema";
import { db } from "../db";
import logger from "../logger";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEventInput {
  type: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  severity?: AuditSeverity;
}

export interface AuditContext {
  actorId?: string | null;
  actorType?: string;
  requestId?: string | null;
  source?: string;
  tenantId?: string | null;
}

export class AuditLogger {
  constructor(private readonly context: AuditContext = {}) {}

  async log(event: AuditEventInput): Promise<void> {
    try {
      const metadata: Record<string, unknown> = { ...(event.metadata ?? {}) };
      if (this.context.source && metadata.source === undefined) {
        metadata.source = this.context.source;
      }
      if (this.context.tenantId && metadata.tenantId === undefined) {
        metadata.tenantId = this.context.tenantId;
      }

      await db.insert(auditEvents).values({
        eventType: event.type,
        actorId: this.context.actorId ?? null,
        actorType: this.context.actorType ?? (this.context.actorId ? "user" : "system"),
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        severity: event.severity ?? "info",
        requestId: this.context.requestId ?? null,
        metadata,
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to persist audit event");
    }
  }
}

export function createAuditLogger(context: AuditContext = {}): AuditLogger {
  return new AuditLogger(context);
}

export async function recordAuditEvent(event: AuditEventInput, context: AuditContext = {}): Promise<void> {
  const loggerInstance = createAuditLogger(context);
  await loggerInstance.log(event);
}

export const auditMiddleware: RequestHandler = (req, _res, next) => {
  const user = (req.user as { id?: string; role?: string } | undefined) ?? undefined;
  const requestId =
    (typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined) ?? randomUUID();
  const tenantId = (req as any).tenantId as string | null | undefined;

  (req as any).audit = new AuditLogger({
    actorId: user?.id ?? null,
    actorType: user ? "user" : "system",
    requestId,
    tenantId: tenantId ?? null,
  });

  next();
};

declare module "express-serve-static-core" {
  interface Request {
    audit?: AuditLogger;
  }
}
