import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';

/**
 * Run a function inside a DB transaction with the per-request tenant set.
 * All queries executed via `tx` in the callback share the same connection
 * and therefore see SET LOCAL app.branch_id.
 */
export async function withTenant<T>(branchId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.branch_id', ${branchId}, true)`);
    return await fn(tx as any);
  });
}

/**
 * Lightweight helper to attach req.tenantId from the authenticated user.
 * Super admins may override via query param `branchId` if provided.
 * Note: This does not automatically start a transaction. Use withTenant()
 * in handlers for operations that must be protected by RLS once enabled.
 */
export const attachTenant: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const user = (req as any).user as { role?: string; branchId?: string } | undefined;
  const qBranch = (req.query.branchId as string | undefined) || undefined;
  const tenantId = user?.role === 'super_admin' ? (qBranch || user?.branchId) : (user?.branchId);
  (req as any).tenantId = tenantId || null;
  next();
};

/**
 * Usage example in a route:
 *
 *   app.post('/api/some-write', attachTenant, async (req, res) => {
 *     const tenantId = (req as any).tenantId as string | null;
 *     if (!tenantId) return res.status(400).json({ message: 'Branch is required' });
 *     const result = await withTenant(tenantId, async (tx) => {
 *       // use tx.* to perform queries in this request's transaction
 *       // e.g., await tx.insert(...)
 *       return true;
 *     });
 *     res.json({ ok: result });
 *   });
 */
