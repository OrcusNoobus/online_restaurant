/**
 * Admin order operations (003 06-contracts Orders): day view + totals,
 * detail with journal, status transitions and undo. Actor-agnostic — the
 * route handler authenticates and passes staffUserId in as data (research D2).
 * Every transition is validated by the pure graph BEFORE any DB write.
 */
import type { TransitionRequestBody } from "@/lib/admin-schemas";
import { deriveUndo, type OrderStatus, validateTransition } from "@/lib/order-status";
import { localDateKey } from "@/lib/schedule";
import {
  type AdminOrderEventRow,
  type AdminOrderItemRow,
  type AdminOrderRow,
  applyTransition,
  type DayTotals,
  getDayTotals,
  getLatestEvent,
  getOrderEvents,
  getOrderItemsWithOptions,
  getOrderRow,
  listOrdersForLocalDate,
} from "@/server/repositories/orders";

export interface AdminOrderListItem {
  id: number;
  createdAt: string;
  mode: "delivery" | "pickup";
  status: OrderStatus;
  customerName: string;
  phone: string;
  zoneName: string | null;
  scheduledFor: string | null;
  estimateMinutes: number | null;
  paymentMethod: "cash" | "card_delivery" | "card_restaurant";
  totalBani: number;
}

export interface AdminDayView {
  date: string;
  orders: AdminOrderListItem[];
  totals: DayTotals;
}

export async function listDay(
  date: string | undefined,
  status: OrderStatus | undefined,
  now: Date = new Date(),
): Promise<AdminDayView> {
  const dateKey = date ?? localDateKey(now);
  const [rows, totals] = await Promise.all([listOrdersForLocalDate(dateKey, status), getDayTotals(dateKey)]);
  return {
    date: dateKey,
    orders: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      mode: row.mode,
      status: row.status,
      customerName: `${row.customerFirstName} ${row.customerLastName}`,
      phone: row.phone,
      zoneName: row.zoneName,
      scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
      estimateMinutes: row.estimateMinutes,
      paymentMethod: row.paymentMethod,
      totalBani: row.totalBani,
    })),
    totals,
  };
}

export interface AdminOrderDetail {
  order: Omit<AdminOrderRow, "createdAt" | "scheduledFor" | "termsAcceptedAt"> & {
    createdAt: string;
    scheduledFor: string | null;
    termsAcceptedAt: string;
  };
  items: AdminOrderItemRow[];
  events: (Omit<AdminOrderEventRow, "createdAt"> & { createdAt: string })[];
}

export async function getDetail(orderId: number): Promise<AdminOrderDetail | null> {
  const order = await getOrderRow(orderId);
  if (!order) return null;
  const [items, events] = await Promise.all([getOrderItemsWithOptions(orderId), getOrderEvents(orderId)]);
  return {
    order: {
      ...order,
      createdAt: order.createdAt.toISOString(),
      scheduledFor: order.scheduledFor ? order.scheduledFor.toISOString() : null,
      termsAcceptedAt: order.termsAcceptedAt.toISOString(),
    },
    items,
    events: events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
  };
}

export type TransitionResult =
  | { ok: true; detail: AdminOrderDetail }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "invalid_transition" | "cancel_reason_required" | "estimate_not_allowed" | "nothing_to_undo" }
  | { ok: false; error: "stale_state"; currentStatus: OrderStatus };

export async function transition(
  orderId: number,
  request: TransitionRequestBody,
  staffUserId: number,
): Promise<TransitionResult> {
  const order = await getOrderRow(orderId);
  if (!order) return { ok: false, error: "not_found" };

  const validation = validateTransition(order.mode, order.status, request);
  if (!validation.ok) return { ok: false, error: validation.error };

  const written = await applyTransition({
    orderId,
    expectedFrom: order.status,
    to: request.to,
    estimateMinutes: request.to === "accepted" ? (request.estimateMinutes ?? null) : null,
    reason: request.to === "canceled" ? request.reason!.trim() : null,
    staffUserId,
  });
  if (!written.ok) {
    if (written.currentStatus === null) return { ok: false, error: "not_found" };
    return { ok: false, error: "stale_state", currentStatus: written.currentStatus };
  }

  const detail = await getDetail(orderId);
  // the order cannot vanish between the transition and the read — RESTRICT FKs
  return { ok: true, detail: detail! };
}

export async function undo(orderId: number, staffUserId: number): Promise<TransitionResult> {
  const order = await getOrderRow(orderId);
  if (!order) return { ok: false, error: "not_found" };

  const derivation = deriveUndo(await getLatestEvent(orderId));
  if (!derivation.ok) return { ok: false, error: derivation.error };

  // expectedFrom is the journal's latest toStatus; if another device moved the
  // order meanwhile, the conditional update loses and answers stale_state
  const written = await applyTransition({
    orderId,
    expectedFrom: derivation.from,
    to: derivation.to,
    staffUserId,
    undoOfEventId: derivation.undoOfEventId,
  });
  if (!written.ok) {
    if (written.currentStatus === null) return { ok: false, error: "not_found" };
    return { ok: false, error: "stale_state", currentStatus: written.currentStatus };
  }

  const detail = await getDetail(orderId);
  return { ok: true, detail: detail! };
}
