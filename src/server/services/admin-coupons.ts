/**
 * Admin coupon management (006 06-contracts). Actor-agnostic — role rules
 * live at the HTTP boundary (requireAdmin, feat-007 Q14). Semantic rules
 * mirror the DB CHECKs so admins get a named 422 instead of a constraint
 * error: value-per-type, window ordering, normalized-unique code. Coupons
 * are never deleted — retirement is `active: false` (D-c).
 */
import type { CouponCreate, CouponPatchBody } from "@/lib/admin-schemas";

import {
  type CouponPatch,
  type CouponRow,
  type CouponType,
  createCoupon,
  getCouponById,
  listAllCoupons,
  patchCoupon,
} from "../repositories/coupons";

export type AdminCouponError = "not_found" | "code_taken" | "invalid_value_for_type" | "invalid_window";

export type AdminCouponResult = { ok: true; coupon: CouponRow } | { ok: false; error: AdminCouponError };

function validValueForType(type: CouponType, value: number | null): boolean {
  if (type === "percent") return value !== null && value >= 1 && value <= 100;
  if (type === "fixed") return value !== null && value >= 1;
  return value === null;
}

function validWindow(startsAt: Date | null, endsAt: Date | null): boolean {
  return startsAt === null || endsAt === null || startsAt.getTime() < endsAt.getTime();
}

function toDate(value: string | null | undefined): Date | null {
  return value == null ? null : new Date(value);
}

export async function adminListCoupons(): Promise<CouponRow[]> {
  return listAllCoupons();
}

export async function adminCreateCoupon(input: CouponCreate): Promise<AdminCouponResult> {
  const value = input.value ?? null;
  const startsAt = toDate(input.startsAt);
  const endsAt = toDate(input.endsAt);

  if (!validValueForType(input.type, value)) return { ok: false, error: "invalid_value_for_type" };
  if (!validWindow(startsAt, endsAt)) return { ok: false, error: "invalid_window" };

  const created = await createCoupon({ code: input.code, type: input.type, value, startsAt, endsAt });
  return created.ok ? { ok: true, coupon: created.coupon } : { ok: false, error: created.error };
}

/**
 * The RESULTING row must satisfy every rule — a patch that changes `type`
 * without a compatible `value` (or vice versa) is refused as a whole
 * (06-contracts PATCH).
 */
export async function adminPatchCoupon(id: number, body: CouponPatchBody): Promise<AdminCouponResult> {
  const current = await getCouponById(id);
  if (!current) return { ok: false, error: "not_found" };

  const effectiveType = body.type ?? current.type;
  const effectiveValue = body.value !== undefined ? body.value : current.value;
  const effectiveStartsAt = body.startsAt !== undefined ? toDate(body.startsAt) : current.startsAt;
  const effectiveEndsAt = body.endsAt !== undefined ? toDate(body.endsAt) : current.endsAt;

  if (!validValueForType(effectiveType, effectiveValue)) return { ok: false, error: "invalid_value_for_type" };
  if (!validWindow(effectiveStartsAt, effectiveEndsAt)) return { ok: false, error: "invalid_window" };

  const patch: CouponPatch = {};
  if (body.code !== undefined) patch.code = body.code;
  if (body.type !== undefined) patch.type = body.type;
  if (body.value !== undefined) patch.value = body.value;
  if (body.startsAt !== undefined) patch.startsAt = toDate(body.startsAt);
  if (body.endsAt !== undefined) patch.endsAt = toDate(body.endsAt);
  if (body.active !== undefined) patch.active = body.active;

  const patched = await patchCoupon(id, patch);
  return patched.ok ? { ok: true, coupon: patched.coupon } : { ok: false, error: patched.error };
}
