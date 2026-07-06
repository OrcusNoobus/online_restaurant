/**
 * Coupon reads + admin mutations (006 05-data-model). Codes reach this layer
 * already NORMALIZED (trim + uppercase — src/lib/order-schemas.ts), so every
 * lookup is an exact match. Admin surface follows the zones precedent:
 * list / create / patch, deactivate-never-delete (orders hold RESTRICT
 * references).
 */
import { desc, eq } from "drizzle-orm";

import { db } from "../db/client";
import { coupons } from "../db/schema";

export type CouponType = "percent" | "fixed" | "free_delivery";

export interface CouponRow {
  id: number;
  code: string;
  type: CouponType;
  value: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  createdAt: Date;
}

const couponColumns = {
  id: coupons.id,
  code: coupons.code,
  type: coupons.type,
  value: coupons.value,
  startsAt: coupons.startsAt,
  endsAt: coupons.endsAt,
  active: coupons.active,
  createdAt: coupons.createdAt,
};

/** Includes inactive/expired rows — pricing tells the refusal reasons apart. */
export async function getCouponByCode(normalizedCode: string): Promise<CouponRow | null> {
  const rows = await db.select(couponColumns).from(coupons).where(eq(coupons.code, normalizedCode));
  return rows[0] ?? null;
}

/** The admin list: ALL coupons, newest first. */
export async function listAllCoupons(): Promise<CouponRow[]> {
  return db.select(couponColumns).from(coupons).orderBy(desc(coupons.createdAt), desc(coupons.id));
}

export interface NewCouponInput {
  code: string;
  type: CouponType;
  value: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

export type CreateCouponResult = { ok: true; coupon: CouponRow } | { ok: false; error: "code_taken" };

export async function createCoupon(input: NewCouponInput): Promise<CreateCouponResult> {
  const duplicate = await getCouponByCode(input.code);
  if (duplicate) return { ok: false, error: "code_taken" };

  const [coupon] = await db.insert(coupons).values(input).returning(couponColumns);
  return { ok: true, coupon };
}

export interface CouponPatch {
  code?: string;
  type?: CouponType;
  value?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  active?: boolean;
}

export type PatchCouponResult =
  | { ok: true; coupon: CouponRow }
  | { ok: false; error: "not_found" | "code_taken" };

export async function patchCoupon(id: number, patch: CouponPatch): Promise<PatchCouponResult> {
  if (patch.code !== undefined) {
    const duplicate = await getCouponByCode(patch.code);
    if (duplicate && duplicate.id !== id) return { ok: false, error: "code_taken" };
  }
  const rows = await db.update(coupons).set(patch).where(eq(coupons.id, id)).returning(couponColumns);
  return rows[0] ? { ok: true, coupon: rows[0] } : { ok: false, error: "not_found" };
}
