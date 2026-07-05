/**
 * Shared zod schemas for cart quoting and order placement — the boundary
 * validation layer (ARCHITECTURE.md). The quote request is a strict subset of
 * the order request, so a client-held cart is, verbatim, the order payload.
 * Semantic rules (zone exists, product active, schedule…) live in services
 * and answer with 422 reason codes, not here.
 */
import { z } from "zod";

export const cartItemSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99),
  toppingIds: z.array(z.number().int().positive()).max(30).default([]),
});

export const quoteRequestSchema = z.object({
  mode: z.enum(["delivery", "pickup"]),
  zoneSlug: z.string().min(1).optional(),
  items: z.array(cartItemSchema).max(100),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
export type CartItemInput = z.infer<typeof cartItemSchema>;

/** Accepts 07XXXXXXXX / +407XXXXXXXX / 02-03XXXXXXXX landlines; normalized to +40. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+40|0)(2|3|7)\d{8}$/, "telefon invalid")
  .transform((value) => (value.startsWith("0") ? `+4${value}` : value));

export const orderRequestSchema = quoteRequestSchema
  .extend({
    customer: z.object({
      firstName: z.string().trim().min(1).max(100),
      lastName: z.string().trim().min(1).max(100),
      phone: phoneSchema,
      email: z.string().trim().email().max(200).nullish(),
    }),
    addressStreet: z.string().trim().min(1).max(300).nullish(),
    notes: z.string().trim().max(1000).nullish(),
    scheduledFor: z.iso.datetime({ offset: true }).nullish(),
    // shape only — membership in the CURRENT settings options is a semantic
    // rule checked by the order service (422 invalid_pickup_estimate), because
    // the option set is DB-live since feat-007 (003 06-contracts)
    pickupEstimateMinutes: z.number().int().positive().nullish(),
    paymentMethod: z.enum(["cash", "card_delivery", "card_restaurant"]),
    termsAccepted: z.literal(true),
  })
  .superRefine((order, ctx) => {
    if (order.mode === "delivery" && !order.addressStreet) {
      ctx.addIssue({ code: "custom", path: ["addressStreet"], message: "adresa este obligatorie la livrare" });
    }
  });

export type OrderRequest = z.infer<typeof orderRequestSchema>;
