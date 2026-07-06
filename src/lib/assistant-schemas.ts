/**
 * Zod for the POST /api/assistant boundary (008 06-contracts): message
 * trimmed 1–500 chars, optional conversationId, the SITE cart via the
 * existing cartItemSchema — the same shape the quote/order endpoints
 * accept. A malformed conversationId is a shape violation (400) — it
 * could never match a row and would break the uuid column cast; a
 * VALID-but-unknown id reaches the service and starts a fresh
 * conversation (never an error, per contract). The 500-char cap mirrors
 * MAX_MESSAGE_LENGTH in the assistant service (lib cannot import
 * server); the service re-checks it as defense in depth.
 */
import { z } from "zod";

import { cartItemSchema } from "./order-schemas";

export const assistantRequestSchema = z.object({
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(500),
  cart: z.array(cartItemSchema).max(100),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
