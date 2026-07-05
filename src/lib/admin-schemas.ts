/**
 * Zod schemas + pure constants for the admin boundary
 * (003-panou-admin/06-contracts/api.md). Pure module — no I/O — so both the
 * proxy (which must not touch the DB) and the route handlers can import it.
 */
import { z } from "zod";

/** Session cookie name — defined here so src/proxy.ts can check presence without importing server code. */
export const SESSION_COOKIE_NAME = "rf_admin_session";

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// --- Orders (003 06-contracts Orders) --------------------------------------

export const orderStatusValues = [
  "new",
  "accepted",
  "in_delivery",
  "ready_for_pickup",
  "completed",
  "canceled",
] as const;

export const adminOrdersQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .optional(),
  status: z.enum(orderStatusValues).optional(),
});
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;

/**
 * Shape only — the semantic rules (graph validity, reason-on-cancel,
 * estimate-only-at-accept) live in src/lib/order-status.ts and the service.
 */
export const transitionRequestSchema = z.object({
  to: z.enum(orderStatusValues),
  reason: z.string().trim().max(500).optional(),
  estimateMinutes: z.number().int().positive().optional(),
});
export type TransitionRequestBody = z.infer<typeof transitionRequestSchema>;

/** Path ids arrive as strings; every admin entity id is a positive integer. */
export const idParamSchema = z.coerce.number().int().positive();
