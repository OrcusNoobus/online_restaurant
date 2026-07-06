/**
 * Customer profile + own-orders views (005-conturi-clienti research D4/D5).
 * Authentication lives in customer-auth.ts; this service owns what an
 * authenticated customer can READ and EDIT about themselves. The customer id
 * always arrives from a verified session (guard), never from client input.
 * Contract: 005-conturi-clienti/06-contracts/api.md.
 */
import type { CustomerView, ProfilePatch } from "@/lib/account-schemas";
import {
  type CustomerProfilePatch,
  type CustomerRow,
  findCustomerById,
  updateCustomerProfile,
} from "@/server/repositories/customers";
import {
  claimGuestOrders,
  type CustomerOrderListRow,
  type CustomerOrderRow,
  getOrderForCustomer,
  getOrderItemsWithOptions,
  listOrdersForCustomer,
} from "@/server/repositories/orders";
import { getActiveZones, getZoneBySlug } from "@/server/repositories/zones";

/** v1 constant — pagination is a recorded future step (06-contracts). */
const ORDER_HISTORY_LIMIT = 20;

async function zoneSlugOf(zoneId: number | null): Promise<string | null> {
  if (zoneId === null) return null;
  // a deactivated zone resolves to null — the prefill degrades, never blocks
  const zones = await getActiveZones();
  return zones.find((zone) => zone.id === zoneId)?.slug ?? null;
}

async function toCustomerView(row: CustomerRow): Promise<CustomerView> {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    addressStreet: row.addressStreet,
    zoneSlug: await zoneSlugOf(row.zoneId),
    hasPassword: row.passwordHash !== null,
    hasGoogle: row.googleSub !== null,
  };
}

export async function getProfile(customerId: number): Promise<CustomerView | null> {
  const row = await findCustomerById(customerId);
  return row ? toCustomerView(row) : null;
}

export type UpdateProfileResult =
  | { ok: true; customer: CustomerView; claimedOrders: number }
  | { ok: false; error: "unknown_zone" };

/**
 * Applies a boundary-validated patch. Setting/changing the phone re-runs the
 * guest-order backfill (research D4) — the count returns for the route log.
 */
export async function updateProfile(customerId: number, patch: ProfilePatch): Promise<UpdateProfileResult> {
  const current = await findCustomerById(customerId);
  if (!current) return { ok: false, error: "unknown_zone" }; // guarded route — unreachable in practice

  const repoPatch: CustomerProfilePatch = {};
  if (patch.firstName !== undefined) repoPatch.firstName = patch.firstName;
  if (patch.lastName !== undefined) repoPatch.lastName = patch.lastName;
  if (patch.phone !== undefined) repoPatch.phone = patch.phone;
  if (patch.addressStreet !== undefined) repoPatch.addressStreet = patch.addressStreet;
  if (patch.zoneSlug !== undefined) {
    if (patch.zoneSlug === null) {
      repoPatch.zoneId = null;
    } else {
      const zone = await getZoneBySlug(patch.zoneSlug);
      if (!zone || !zone.active) return { ok: false, error: "unknown_zone" };
      repoPatch.zoneId = zone.id;
    }
  }

  await updateCustomerProfile(customerId, repoPatch);

  const phoneChanged = patch.phone !== undefined && patch.phone !== null && patch.phone !== current.phone;
  const claimedOrders = phoneChanged ? await claimGuestOrders(customerId, { phone: patch.phone! }) : 0;

  const updated = await findCustomerById(customerId);
  return { ok: true, customer: await toCustomerView(updated!), claimedOrders };
}

export interface OrderCustomerData {
  firstName: string;
  lastName: string;
  /** Normalized +40… — it arrives through orderRequestSchema. */
  phone: string;
  addressStreet: string | null;
  /** The order request's vocabulary; resolved to zoneId here. */
  zoneSlug: string | null;
}

/**
 * D-h (refined at T08 — 02-clarify): a logged-in order fills the profile's
 * MISSING contact fields, per-field; anything already set is NEVER
 * overwritten by checkout — per-order edits stay per-order (Q2). This is how
 * a Google signup (name from claims, no phone) gets prefill + phone linking
 * without a separate profile chore.
 */
export async function absorbOrderIntoProfile(
  customerId: number,
  order: OrderCustomerData,
): Promise<{ absorbed: boolean; claimedOrders: number }> {
  const current = await findCustomerById(customerId);
  if (!current) return { absorbed: false, claimedOrders: 0 };

  const patch: CustomerProfilePatch = {};
  if (current.firstName === null) patch.firstName = order.firstName;
  if (current.lastName === null) patch.lastName = order.lastName;
  const fillsPhone = current.phone === null;
  if (fillsPhone) patch.phone = order.phone;
  if (current.addressStreet === null && order.addressStreet !== null) {
    patch.addressStreet = order.addressStreet;
  }
  if (current.zoneId === null && order.zoneSlug !== null) {
    const zone = await getZoneBySlug(order.zoneSlug);
    if (zone) patch.zoneId = zone.id;
  }
  if (Object.keys(patch).length === 0) return { absorbed: false, claimedOrders: 0 };

  await updateCustomerProfile(customerId, patch);
  // the profile just gained a phone — link any prior guest orders (D4)
  const claimedOrders = fillsPhone ? await claimGuestOrders(customerId, { phone: order.phone }) : 0;
  return { absorbed: true, claimedOrders };
}

export interface CustomerOrderListView extends CustomerOrderListRow {
  orderNumber: string;
}

export async function listCustomerOrders(customerId: number): Promise<CustomerOrderListView[]> {
  const rows = await listOrdersForCustomer(customerId, ORDER_HISTORY_LIMIT);
  return rows.map((row) => ({ ...row, orderNumber: `#${row.id}` }));
}

export interface CustomerOrderDetailView extends CustomerOrderRow {
  orderNumber: string;
  items: Awaited<ReturnType<typeof getOrderItemsWithOptions>>;
}

/** Ownership enforced in the repository WHERE — null for non-owned AND unknown ids alike. */
export async function getCustomerOrderDetail(
  customerId: number,
  orderId: number,
): Promise<CustomerOrderDetailView | null> {
  const row = await getOrderForCustomer(orderId, customerId);
  if (!row) return null;
  const items = await getOrderItemsWithOptions(orderId);
  return { ...row, orderNumber: `#${row.id}`, items };
}
