/**
 * Order writes + admin reads. One transaction per placed order: the order row,
 * its lines and their options land together or not at all (002 01-spec.md FR6).
 * All values arrive pre-validated and pre-priced from the orders service.
 * Admin queries (003): day list/totals use restaurant-local dates computed in
 * SQL (`AT TIME ZONE`), status transitions are CONDITIONAL updates + journal
 * event in one transaction (research D4 — loser gets zero rows, no write).
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { OrderMode, OrderStatus } from "@/lib/order-status";
import { RESTAURANT_TIMEZONE } from "@/lib/restaurant-config";

import { db } from "../db/client";
import { deliveryZones, orderItemOptions, orderItems, orders, orderStatusEvents, staffUsers } from "../db/schema";

export interface NewOrderOption {
  toppingId: number;
  groupName: string;
  toppingName: string;
  priceBani: number;
  sgrDepositBani: number;
}

export interface NewOrderItem {
  productId: number;
  variantId: number;
  productName: string;
  variantName: string | null;
  unitPriceBani: number;
  quantity: number;
  lineTotalBani: number;
  options: NewOrderOption[];
}

export interface NewOrder {
  mode: "delivery" | "pickup";
  customerFirstName: string;
  customerLastName: string;
  phone: string;
  email: string | null;
  zoneId: number | null;
  addressStreet: string | null;
  notes: string | null;
  scheduledFor: Date | null;
  estimateMinutes: number | null;
  paymentMethod: "cash" | "card_delivery" | "card_restaurant";
  subtotalBani: number;
  sgrBani: number;
  deliveryFeeBani: number;
  totalBani: number;
  termsAcceptedAt: Date;
  clientIp: string | null;
  items: NewOrderItem[];
}

/** Inserts the full order atomically and returns its id (the order number). */
export async function insertOrder(order: NewOrder): Promise<number> {
  const { items, ...orderRow } = order;

  return db.transaction(async (tx) => {
    const [{ id: orderId }] = await tx.insert(orders).values(orderRow).returning({ id: orders.id });

    for (const { options, ...item } of items) {
      const [{ id: orderItemId }] = await tx
        .insert(orderItems)
        .values({ ...item, orderId })
        .returning({ id: orderItems.id });

      if (options.length > 0) {
        await tx.insert(orderItemOptions).values(options.map((option) => ({ ...option, orderItemId })));
      }
    }

    return orderId;
  });
}

// --- Admin day view (003 research D3/D10) -----------------------------------

/** Postgres does the timezone math — DST-safe local day boundaries. */
function isLocalDate(dateKey: string) {
  return sql`(${orders.createdAt} AT TIME ZONE ${RESTAURANT_TIMEZONE})::date = ${dateKey}::date`;
}

export interface AdminOrderListRow {
  id: number;
  createdAt: Date;
  mode: OrderMode;
  status: OrderStatus;
  customerFirstName: string;
  customerLastName: string;
  phone: string;
  zoneName: string | null;
  scheduledFor: Date | null;
  estimateMinutes: number | null;
  paymentMethod: "cash" | "card_delivery" | "card_restaurant";
  totalBani: number;
}

export async function listOrdersForLocalDate(dateKey: string, status?: OrderStatus): Promise<AdminOrderListRow[]> {
  const filters = status ? and(isLocalDate(dateKey), eq(orders.status, status)) : isLocalDate(dateKey);
  return db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      mode: orders.mode,
      status: orders.status,
      customerFirstName: orders.customerFirstName,
      customerLastName: orders.customerLastName,
      phone: orders.phone,
      zoneName: deliveryZones.name,
      scheduledFor: orders.scheduledFor,
      estimateMinutes: orders.estimateMinutes,
      paymentMethod: orders.paymentMethod,
      totalBani: orders.totalBani,
    })
    .from(orders)
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(filters)
    .orderBy(desc(orders.createdAt), desc(orders.id));
}

export interface DayTotals {
  count: number;
  totalBani: number;
  canceledCount: number;
}

/** Whole-day aggregate regardless of any list filter; canceled kept apart (Q11). */
export async function getDayTotals(dateKey: string): Promise<DayTotals> {
  const [row] = await db
    .select({
      count: sql<number>`count(*) filter (where ${orders.status} <> 'canceled')::int`,
      totalBani: sql<number>`coalesce(sum(${orders.totalBani}) filter (where ${orders.status} <> 'canceled'), 0)::int`,
      canceledCount: sql<number>`count(*) filter (where ${orders.status} = 'canceled')::int`,
    })
    .from(orders)
    .where(isLocalDate(dateKey));
  return row;
}

// --- Admin order detail ------------------------------------------------------

export interface AdminOrderRow extends AdminOrderListRow {
  email: string | null;
  zoneId: number | null;
  addressStreet: string | null;
  notes: string | null;
  subtotalBani: number;
  sgrBani: number;
  deliveryFeeBani: number;
  termsAcceptedAt: Date;
  clientIp: string | null;
}

export async function getOrderRow(orderId: number): Promise<AdminOrderRow | null> {
  const rows = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      mode: orders.mode,
      status: orders.status,
      customerFirstName: orders.customerFirstName,
      customerLastName: orders.customerLastName,
      phone: orders.phone,
      email: orders.email,
      zoneId: orders.zoneId,
      zoneName: deliveryZones.name,
      addressStreet: orders.addressStreet,
      notes: orders.notes,
      scheduledFor: orders.scheduledFor,
      estimateMinutes: orders.estimateMinutes,
      paymentMethod: orders.paymentMethod,
      subtotalBani: orders.subtotalBani,
      sgrBani: orders.sgrBani,
      deliveryFeeBani: orders.deliveryFeeBani,
      totalBani: orders.totalBani,
      termsAcceptedAt: orders.termsAcceptedAt,
      clientIp: orders.clientIp,
    })
    .from(orders)
    .leftJoin(deliveryZones, eq(orders.zoneId, deliveryZones.id))
    .where(eq(orders.id, orderId));
  return rows[0] ?? null;
}

export interface AdminOrderItemRow {
  id: number;
  productId: number;
  variantId: number;
  productName: string;
  variantName: string | null;
  unitPriceBani: number;
  quantity: number;
  lineTotalBani: number;
  options: {
    groupName: string;
    toppingName: string;
    priceBani: number;
    sgrDepositBani: number;
  }[];
}

export async function getOrderItemsWithOptions(orderId: number): Promise<AdminOrderItemRow[]> {
  const items = await db
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      unitPriceBani: orderItems.unitPriceBani,
      quantity: orderItems.quantity,
      lineTotalBani: orderItems.lineTotalBani,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.id));

  if (items.length === 0) return [];

  const options = await db
    .select({
      orderItemId: orderItemOptions.orderItemId,
      groupName: orderItemOptions.groupName,
      toppingName: orderItemOptions.toppingName,
      priceBani: orderItemOptions.priceBani,
      sgrDepositBani: orderItemOptions.sgrDepositBani,
    })
    .from(orderItemOptions)
    .innerJoin(orderItems, eq(orderItemOptions.orderItemId, orderItems.id))
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItemOptions.id));

  return items.map((item) => ({
    ...item,
    options: options
      .filter((option) => option.orderItemId === item.id)
      .map((option) => ({
        groupName: option.groupName,
        toppingName: option.toppingName,
        priceBani: option.priceBani,
        sgrDepositBani: option.sgrDepositBani,
      })),
  }));
}

export interface AdminOrderEventRow {
  id: number;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  reason: string | null;
  staffDisplayName: string;
  undoOfEventId: number | null;
  createdAt: Date;
}

/** The journal, oldest first — the audit trail reads top-down. */
export async function getOrderEvents(orderId: number): Promise<AdminOrderEventRow[]> {
  return db
    .select({
      id: orderStatusEvents.id,
      fromStatus: orderStatusEvents.fromStatus,
      toStatus: orderStatusEvents.toStatus,
      reason: orderStatusEvents.reason,
      staffDisplayName: staffUsers.displayName,
      undoOfEventId: orderStatusEvents.undoOfEventId,
      createdAt: orderStatusEvents.createdAt,
    })
    .from(orderStatusEvents)
    .innerJoin(staffUsers, eq(orderStatusEvents.staffUserId, staffUsers.id))
    .where(eq(orderStatusEvents.orderId, orderId))
    .orderBy(asc(orderStatusEvents.id));
}

export interface LatestEventRow {
  id: number;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  undoOfEventId: number | null;
}

/** Feeds the undo derivation (src/lib/order-status.ts deriveUndo). */
export async function getLatestEvent(orderId: number): Promise<LatestEventRow | null> {
  const rows = await db
    .select({
      id: orderStatusEvents.id,
      fromStatus: orderStatusEvents.fromStatus,
      toStatus: orderStatusEvents.toStatus,
      undoOfEventId: orderStatusEvents.undoOfEventId,
    })
    .from(orderStatusEvents)
    .where(eq(orderStatusEvents.orderId, orderId))
    .orderBy(desc(orderStatusEvents.id))
    .limit(1);
  return rows[0] ?? null;
}

// --- Conditional transition (003 research D4, 05-data-model Concurrency) -----

export interface TransitionWrite {
  orderId: number;
  expectedFrom: OrderStatus;
  to: OrderStatus;
  /** Written only on the transition into 'accepted' (service-enforced). */
  estimateMinutes?: number | null;
  reason?: string | null;
  staffUserId: number;
  /** Set on compensating (undo) events. */
  undoOfEventId?: number | null;
}

export type TransitionWriteResult =
  | { ok: true }
  | { ok: false; currentStatus: OrderStatus | null };

/**
 * One transaction: `UPDATE … WHERE status = expectedFrom` + event insert.
 * Zero affected rows → nothing written, the caller answers 409 stale_state
 * with the current status; two concurrent devices → exactly one winner.
 */
export async function applyTransition(write: TransitionWrite): Promise<TransitionWriteResult> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(orders)
      .set({
        status: write.to,
        ...(write.estimateMinutes != null ? { estimateMinutes: write.estimateMinutes } : {}),
      })
      .where(and(eq(orders.id, write.orderId), eq(orders.status, write.expectedFrom)))
      .returning({ id: orders.id });

    if (updated.length === 0) {
      const current = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, write.orderId));
      return { ok: false, currentStatus: current[0]?.status ?? null };
    }

    await tx.insert(orderStatusEvents).values({
      orderId: write.orderId,
      fromStatus: write.expectedFrom,
      toStatus: write.to,
      reason: write.reason ?? null,
      staffUserId: write.staffUserId,
      undoOfEventId: write.undoOfEventId ?? null,
    });
    return { ok: true };
  });
}
