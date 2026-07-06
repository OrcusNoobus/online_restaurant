/**
 * Integration tests for feat-011 (discount coupons). Needs the dev Postgres
 * from docker-compose (./init.sh starts it); the suite migrates and seeds
 * itself. Fixtures use "TEST-CPN-" codes and clean up after themselves.
 */
import { execSync } from "node:child_process";

import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { couponCreateSchema, couponPatchSchema } from "@/lib/admin-schemas";
import { couponCodeSchema } from "@/lib/order-schemas";
import { db } from "@/server/db/client";
import { coupons } from "@/server/db/schema";
import {
  createCoupon,
  getCouponByCode,
  listAllCoupons,
  type NewCouponInput,
  patchCoupon,
} from "@/server/repositories/coupons";
import { adminCreateCoupon, adminListCoupons, adminPatchCoupon } from "@/server/services/admin-coupons";

// SKIP_DB=1 runs ./init.sh without Docker (e.g. CI); these suites need Postgres.
const skipDb = process.env.SKIP_DB === "1";

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

/** Drizzle wraps pg errors — the violated constraint name travels in `cause`. */
async function violatedConstraint(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { cause?: { constraint?: string } }).cause?.constraint;
  }
}

/** Unique per-run suffix — the suite can rerun after a crashed cleanup. */
const RUN = `${process.pid}-${Date.now()}`;
let seq = 0;
function testCode(tag: string): string {
  seq += 1;
  return `TEST-CPN-${tag}-${RUN}-${seq}`.toUpperCase();
}

function couponInput(overrides: Partial<NewCouponInput> & { code: string }): NewCouponInput {
  return { type: "percent", value: 10, startsAt: null, endsAt: null, ...overrides };
}

beforeAll(async () => {
  if (skipDb) return;
  run("npm run db:migrate");
  run("npm run db:seed");
  await db.delete(coupons).where(like(coupons.code, "TEST-CPN-%"));
}, 120_000);

afterAll(async () => {
  if (skipDb) return;
  await db.delete(coupons).where(like(coupons.code, "TEST-CPN-%"));
});

describe.skipIf(skipDb)("coupons repository (T01)", () => {
  it("creates and reads back a coupon by its normalized code", async () => {
    const code = testCode("RT");
    const created = await createCoupon(couponInput({ code, type: "fixed", value: 2000 }));
    expect(created.ok).toBe(true);

    const found = await getCouponByCode(code);
    expect(found).not.toBeNull();
    expect(found).toMatchObject({ code, type: "fixed", value: 2000, active: true, startsAt: null, endsAt: null });
    expect(found?.createdAt).toBeInstanceOf(Date);
  });

  it("lists coupons newest first, including inactive ones", async () => {
    const older = testCode("LIST-A");
    const newer = testCode("LIST-B");
    await createCoupon(couponInput({ code: older }));
    const created = await createCoupon(couponInput({ code: newer }));
    if (created.ok) await patchCoupon(created.coupon.id, { active: false });

    const list = await listAllCoupons();
    const codes = list.map(({ code }) => code);
    expect(codes.indexOf(newer)).toBeGreaterThanOrEqual(0);
    expect(codes.indexOf(newer)).toBeLessThan(codes.indexOf(older));
    expect(list.find(({ code }) => code === newer)?.active).toBe(false);
  });

  it("refuses a duplicate code at create and at patch", async () => {
    const first = testCode("DUP-A");
    const second = testCode("DUP-B");
    await createCoupon(couponInput({ code: first }));
    const other = await createCoupon(couponInput({ code: second }));

    expect(await createCoupon(couponInput({ code: first }))).toEqual({ ok: false, error: "code_taken" });
    if (!other.ok) throw new Error("setup failed");
    expect(await patchCoupon(other.coupon.id, { code: first })).toEqual({ ok: false, error: "code_taken" });
    // renaming to its OWN code is not a conflict
    expect((await patchCoupon(other.coupon.id, { code: second })).ok).toBe(true);
  });

  it("patches window/active and reports unknown ids", async () => {
    const created = await createCoupon(couponInput({ code: testCode("PATCH") }));
    if (!created.ok) throw new Error("setup failed");

    const ends = new Date("2026-08-31T21:59:59.000Z");
    const patched = await patchCoupon(created.coupon.id, { endsAt: ends, active: false });
    expect(patched.ok && patched.coupon.endsAt?.toISOString()).toBe(ends.toISOString());
    expect(patched.ok && patched.coupon.active).toBe(false);

    expect(await patchCoupon(999_999_999, { active: true })).toEqual({ ok: false, error: "not_found" });
  });

  it("enforces coupons_value_by_type for every type", async () => {
    for (const bad of [
      { type: "percent" as const, value: 0 },
      { type: "percent" as const, value: 101 },
      { type: "percent" as const, value: null },
      { type: "fixed" as const, value: 0 },
      { type: "fixed" as const, value: null },
      { type: "free_delivery" as const, value: 500 },
    ]) {
      expect(await violatedConstraint(createCoupon(couponInput({ code: testCode("CHK"), ...bad })))).toBe(
        "coupons_value_by_type",
      );
    }
    // and the valid boundary values pass
    expect((await createCoupon(couponInput({ code: testCode("CHK-OK1"), type: "percent", value: 100 }))).ok).toBe(true);
    expect(
      (await createCoupon(couponInput({ code: testCode("CHK-OK2"), type: "free_delivery", value: null }))).ok,
    ).toBe(true);
  });

  it("enforces coupons_window (starts_at < ends_at)", async () => {
    const at = new Date("2026-07-01T10:00:00.000Z");
    expect(
      await violatedConstraint(createCoupon(couponInput({ code: testCode("WIN"), startsAt: at, endsAt: at }))),
    ).toBe("coupons_window");
    expect(
      (
        await createCoupon(
          couponInput({ code: testCode("WIN-OK"), startsAt: at, endsAt: new Date(at.getTime() + 1000) }),
        )
      ).ok,
    ).toBe(true);
  });
});

describe("coupon boundary schemas (T02)", () => {
  it("normalizes any casing/whitespace to the canonical code", () => {
    expect(couponCodeSchema.parse("  vara10 ")).toBe("VARA10");
    expect(couponCodeSchema.parse("Vara-10")).toBe("VARA-10");
  });

  it("rejects malformed codes as validation (400-level), not semantics", () => {
    for (const bad of ["ab", "a".repeat(33), "cod cu spații", "diacritice-ă", ""]) {
      expect(couponCodeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("create schema is shape-only; patch schema refuses empty and unknown keys", () => {
    const parsed = couponCreateSchema.parse({ code: "vara10", type: "percent", value: 10 });
    expect(parsed).toMatchObject({ code: "VARA10", type: "percent", value: 10 });

    expect(couponPatchSchema.safeParse({}).success).toBe(false);
    expect(couponPatchSchema.safeParse({ unknown: 1 }).success).toBe(false);
    expect(couponPatchSchema.safeParse({ active: false }).success).toBe(true);
  });
});

describe.skipIf(skipDb)("admin coupons service (T02)", () => {
  it("refuses value/type mismatches with invalid_value_for_type", async () => {
    for (const bad of [
      { type: "percent" as const, value: 0 },
      { type: "percent" as const, value: 101 },
      { type: "percent" as const, value: null },
      { type: "fixed" as const, value: 0 },
      { type: "fixed" as const, value: null },
      { type: "free_delivery" as const, value: 500 },
    ]) {
      expect(await adminCreateCoupon({ code: testCode("SVC-VAL"), ...bad })).toEqual({
        ok: false,
        error: "invalid_value_for_type",
      });
    }
  });

  it("refuses a window with starts_at >= ends_at as invalid_window", async () => {
    expect(
      await adminCreateCoupon({
        code: testCode("SVC-WIN"),
        type: "percent",
        value: 10,
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-07-01T00:00:00.000Z",
      }),
    ).toEqual({ ok: false, error: "invalid_window" });
  });

  it("creates, lists and reports duplicate codes", async () => {
    const code = testCode("SVC-DUP");
    const created = await adminCreateCoupon({ code, type: "fixed", value: 2000 });
    expect(created.ok && created.coupon).toMatchObject({ code, type: "fixed", value: 2000, active: true });

    expect(await adminCreateCoupon({ code, type: "percent", value: 5 })).toEqual({
      ok: false,
      error: "code_taken",
    });
    expect((await adminListCoupons()).some((coupon) => coupon.code === code)).toBe(true);
  });

  it("re-validates the RESULTING row on patch (type/value consistency)", async () => {
    const created = await adminCreateCoupon({ code: testCode("SVC-PATCH"), type: "percent", value: 10 });
    if (!created.ok) throw new Error("setup failed");
    const id = created.coupon.id;

    // changing type without a compatible value is refused as a whole
    expect(await adminPatchCoupon(id, { type: "free_delivery" })).toEqual({
      ok: false,
      error: "invalid_value_for_type",
    });
    expect(await adminPatchCoupon(id, { value: null })).toEqual({ ok: false, error: "invalid_value_for_type" });

    // consistent combined change passes
    const switched = await adminPatchCoupon(id, { type: "free_delivery", value: null });
    expect(switched.ok && switched.coupon).toMatchObject({ type: "free_delivery", value: null });

    // window re-checked against the effective row
    const windowed = await adminPatchCoupon(id, { endsAt: "2026-09-01T00:00:00.000Z" });
    expect(windowed.ok).toBe(true);
    expect(await adminPatchCoupon(id, { startsAt: "2026-10-01T00:00:00.000Z" })).toEqual({
      ok: false,
      error: "invalid_window",
    });

    expect(await adminPatchCoupon(999_999_999, { active: false })).toEqual({ ok: false, error: "not_found" });
  });
});
