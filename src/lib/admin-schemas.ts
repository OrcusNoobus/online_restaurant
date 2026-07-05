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

// --- Catalog (003 06-contracts Catalog; Q14 role matrix) --------------------

/**
 * The ONLY patch a staff role may send — any other key answers 403
 * forbidden_role at the route (checked before parsing), not 400.
 */
export const availabilityPatchSchema = z.strictObject({ active: z.boolean() });

export const categoryPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty patch" });

/**
 * Server-side slug base (003 plan: diacritics stripped; the repository adds a
 * numeric suffix when two names collide to the same slug).
 */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    // combining diacritical marks left over after NFD (ă → a + U+0306, ș → s + U+0326 …)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "produs";
}

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().optional(),
});
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;

export const productCreateSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullish(),
  ingredients: z.string().trim().max(2000).nullish(),
  allergens: z.string().trim().max(2000).nullish(),
  sortOrder: z.number().int().optional(),
  // >= 1 variant; single-size products send one entry with name null
  variants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120).nullable(),
        priceBani: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(20),
  toppingGroupIds: z.array(z.number().int().positive()).max(20).default([]),
});
export type ProductCreate = z.infer<typeof productCreateSchema>;

// Admin-only patches (T08): every field optional, at least one required.
// Nullable text fields accept null to CLEAR a value.

export const adminProductPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    ingredients: z.string().trim().max(2000).nullable().optional(),
    allergens: z.string().trim().max(2000).nullable().optional(),
    categoryId: z.number().int().positive().optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty patch" });
export type AdminProductPatch = z.infer<typeof adminProductPatchSchema>;

export const adminVariantPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).nullable().optional(),
    priceBani: z.number().int().positive().optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty patch" });
export type AdminVariantPatch = z.infer<typeof adminVariantPatchSchema>;

/** `prices` upserts by (topping, sizeName); sizeName null = the single/default variant. */
export const adminToppingPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    sgrDepositBani: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
    prices: z
      .array(
        z.object({
          sizeName: z.string().trim().min(1).max(120).nullable(),
          priceBani: z.number().int().min(0),
        }),
      )
      .min(1)
      .max(20)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty patch" });
export type AdminToppingPatch = z.infer<typeof adminToppingPatchSchema>;

// --- Zones (003 06-contracts Zones — admin only) -----------------------------

export const zoneCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  feeBani: z.number().int().min(0),
  freeFromBani: z.number().int().min(0),
  sortOrder: z.number().int().optional(),
});
export type ZoneCreate = z.infer<typeof zoneCreateSchema>;

export const zonePatchSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    feeBani: z.number().int().min(0).optional(),
    freeFromBani: z.number().int().min(0).optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty patch" });
export type ZonePatchBody = z.infer<typeof zonePatchSchema>;

// --- Settings (003 06-contracts Settings; CHECK rules from 05-data-model) ---

export const settingsUpdateSchema = z
  .object({
    openMinutes: z.number().int().min(0).max(1440),
    closeMinutes: z.number().int().min(0).max(1440),
    earliestFulfillmentMinutes: z.number().int().min(0).max(1440),
    deliveryEstimateMinutes: z.number().int().positive(),
    pickupEstimateOptionsMinutes: z.array(z.number().int().positive()).min(1).max(10),
  })
  .refine((value) => value.openMinutes < value.closeMinutes, {
    path: ["closeMinutes"],
    message: "closing must be after opening",
  })
  .refine((value) => value.earliestFulfillmentMinutes >= value.openMinutes, {
    path: ["earliestFulfillmentMinutes"],
    message: "earliest fulfillment cannot be before opening",
  });
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
