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
