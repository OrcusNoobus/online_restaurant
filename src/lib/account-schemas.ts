/**
 * Zod schemas + pure constants for the customer-account boundary
 * (005-conturi-clienti/06-contracts/api.md). Pure module — no I/O — so both
 * client components and route handlers can import it.
 */
import { z } from "zod";

import { phoneSchema } from "./order-schemas";

/** Customer session cookie — SEPARATE from the staff cookie by design (Q1). */
export const CUSTOMER_SESSION_COOKIE_NAME = "rf_client_session";

/** OAuth state + PKCE verifier between google/start and the callback (10 min). */
export const GOOGLE_OAUTH_COOKIE_NAME = "rf_google_oauth";

const emailSchema = z.string().trim().toLowerCase().email().max(200);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(256),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  // optional at signup (D-g); normalized +40… when present
  phone: phoneSchema.nullish(),
  termsAccepted: z.literal(true),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const customerLoginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export type CustomerLoginRequest = z.infer<typeof customerLoginRequestSchema>;

/**
 * Profile patch — email is NOT here on purpose (immutable in v1, it is the
 * login identifier). Nullable fields accept null to CLEAR a value.
 */
export const profilePatchSchema = z
  .strictObject({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: phoneSchema.nullable().optional(),
    addressStreet: z.string().trim().min(1).max(300).nullable().optional(),
    zoneSlug: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty patch" });
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

/** What account endpoints return — never the hash, never internals (contract). */
export interface CustomerView {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  addressStreet: string | null;
  zoneSlug: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
}
