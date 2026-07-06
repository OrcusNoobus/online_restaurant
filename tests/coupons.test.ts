/**
 * Integration tests for feat-011 (discount coupons). Needs the dev Postgres
 * from docker-compose (./init.sh starts it); the suite migrates and seeds
 * itself. Fixtures use "TEST-CPN-" codes and clean up after themselves.
 */
import { execSync } from "node:child_process";

import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { and, eq } from "drizzle-orm";

import { couponCreateSchema, couponPatchSchema } from "@/lib/admin-schemas";
import { couponCodeSchema, quoteRequestSchema } from "@/lib/order-schemas";
import { db } from "@/server/db/client";
import { coupons, products, productVariants, toppingGroups, toppings } from "@/server/db/schema";
import {
  createCoupon,
  getCouponByCode,
  listAllCoupons,
  type NewCouponInput,
  patchCoupon,
} from "@/server/repositories/coupons";
import { adminCreateCoupon, adminListCoupons, adminPatchCoupon } from "@/server/services/admin-coupons";
import { type QuoteReason, quoteCart } from "@/server/services/pricing";

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

/** Seeded fixture: ids for a product, one of its variants, and named toppings. */
async function findProduct(slug: string, variantName: string | null) {
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  const variantRows = await db
    .select({ id: productVariants.id, name: productVariants.name })
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  const variant = variantRows.find(({ name }) => name === variantName)!;
  return { productId: product.id, variantId: variant.id };
}

/** Topping names are unique only WITHIN their group — always scope by both. */
async function findTopping(groupName: string, name: string): Promise<number> {
  const rows = await db
    .select({ id: toppings.id })
    .from(toppings)
    .innerJoin(toppingGroups, eq(toppings.groupId, toppingGroups.id))
    .where(and(eq(toppingGroups.name, groupName), eq(toppings.name, name)));
  expect(rows).toHaveLength(1);
  return rows[0].id;
}

function couponReasons(result: Awaited<ReturnType<typeof quoteCart>>): QuoteReason[] {
  return result.ok ? [] : result.reasons;
}

/** Fixed clock for every validity test — nothing here reads the real time. */
const NOW = new Date("2026-07-15T12:00:00.000Z");

describe.skipIf(skipDb)("quoteCart with coupons (T03)", () => {
  it("percent: floors the discount and subtracts it from the total (pickup)", async () => {
    // bacon-burger 4090 + required Ambalaj 300 = 4390; 33% = 1448.7 → 1448
    // (round would give 1449 — floor is the contract, D-g)
    const burger = await findProduct("bacon-burger", null);
    const ambalajId = await findTopping("Ambalaj Burger", "Ambalaj");
    const created = await createCoupon(couponInput({ code: testCode("P33"), type: "percent", value: 33 }));
    if (!created.ok) throw new Error("setup failed");

    const result = await quoteCart(
      { mode: "pickup", items: [{ ...burger, quantity: 1, toppingIds: [ambalajId] }], couponCode: created.coupon.code },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.subtotalBani).toBe(4390);
      expect(result.quote.discountBani).toBe(1448);
      expect(result.quote.coupon).toEqual({ id: created.coupon.id, code: created.coupon.code, type: "percent" });
      expect(result.quote.totalBani).toBe(4390 - 1448);
    }
  });

  it("fixed: caps at the product subtotal — SGR stays due, total never negative", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const items = [{ ...heineken, quantity: 1, toppingIds: [sgrId] }];

    const plain = await quoteCart({ mode: "pickup", items }, NOW);
    if (!plain.ok) throw new Error("setup failed");
    expect(plain.quote.sgrBani).toBeGreaterThan(0);
    expect(plain.quote.discountBani).toBe(0);
    expect(plain.quote.coupon).toBeNull();

    const created = await createCoupon(couponInput({ code: testCode("FIX"), type: "fixed", value: 999_999 }));
    if (!created.ok) throw new Error("setup failed");
    const result = await quoteCart({ mode: "pickup", items, couponCode: created.coupon.code }, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.discountBani).toBe(plain.quote.subtotalBani);
      expect(result.quote.sgrBani).toBe(plain.quote.sgrBani);
      expect(result.quote.totalBani).toBe(plain.quote.sgrBani);
    }
  });

  it("free_delivery: equals the zone fee below the threshold; fee line stays intact", async () => {
    // pizza30 3700 + ambalaj 300 + sos 500 = 4500 < sancraiu freeFrom 5000 → fee 3000
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const sosId = await findTopping("Adauga un sos", "Sos Dulce 80 ml");
    const items = [{ ...pizza30, quantity: 1, toppingIds: [ambalajId, sosId] }];
    const created = await createCoupon(couponInput({ code: testCode("FD"), type: "free_delivery", value: null }));
    if (!created.ok) throw new Error("setup failed");

    const below = await quoteCart(
      { mode: "delivery", zoneSlug: "sancraiu-de-mures", items, couponCode: created.coupon.code },
      NOW,
    );
    expect(below.ok).toBe(true);
    if (below.ok) {
      expect(below.quote.deliveryFeeBani).toBe(3000);
      expect(below.quote.discountBani).toBe(3000);
      expect(below.quote.freeDeliveryGapBani).toBe(500);
      expect(below.quote.totalBani).toBe(4500);
    }

    // santana freeFrom 4000 ≤ 4500 → delivery already free → zero effect (D-h),
    // but the coupon is still accepted, not refused
    const above = await quoteCart(
      { mode: "delivery", zoneSlug: "santana-de-mures", items, couponCode: created.coupon.code },
      NOW,
    );
    expect(above.ok).toBe(true);
    if (above.ok) {
      expect(above.quote.deliveryFeeBani).toBe(0);
      expect(above.quote.discountBani).toBe(0);
      expect(above.quote.coupon?.type).toBe("free_delivery");
      expect(above.quote.totalBani).toBe(4500);
    }

    const pickup = await quoteCart({ mode: "pickup", items, couponCode: created.coupon.code }, NOW);
    expect(pickup.ok).toBe(true);
    if (pickup.ok) {
      expect(pickup.quote.discountBani).toBe(0);
      expect(pickup.quote.totalBani).toBe(4500);
    }
  });

  it("D-d: the free-delivery threshold compares the PRE-discount value", async () => {
    // santana: freeFrom 4000, fee 2000. Subtotal 4500 ≥ 4000 → free delivery.
    // A 50% coupon (post-discount 2250 < 4000) must NOT resurrect the fee.
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const sosId = await findTopping("Adauga un sos", "Sos Dulce 80 ml");
    const created = await createCoupon(couponInput({ code: testCode("P50"), type: "percent", value: 50 }));
    if (!created.ok) throw new Error("setup failed");

    const result = await quoteCart(
      {
        mode: "delivery",
        zoneSlug: "santana-de-mures",
        items: [{ ...pizza30, quantity: 1, toppingIds: [ambalajId, sosId] }],
        couponCode: created.coupon.code,
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.subtotalBani).toBe(4500);
      expect(result.quote.deliveryFeeBani).toBe(0);
      expect(result.quote.discountBani).toBe(2250);
      expect(result.quote.totalBani).toBe(2250);
    }
  });

  it("refuses invalid coupons with exactly one precise reason each", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const items = [{ ...pizza30, quantity: 1, toppingIds: [ambalajId] }];

    const inactive = await createCoupon(couponInput({ code: testCode("OFF") }));
    if (inactive.ok) await patchCoupon(inactive.coupon.id, { active: false });
    const notStarted = await createCoupon(
      couponInput({ code: testCode("SOON"), startsAt: new Date("2026-08-01T00:00:00.000Z") }),
    );
    const expired = await createCoupon(
      couponInput({ code: testCode("GONE"), endsAt: new Date("2026-07-01T00:00:00.000Z") }),
    );
    if (!inactive.ok || !notStarted.ok || !expired.ok) throw new Error("setup failed");

    const cases: [string, QuoteReason["code"]][] = [
      ["TEST-CPN-NO-SUCH-CODE", "coupon_unknown"],
      [inactive.coupon.code, "coupon_inactive"],
      [notStarted.coupon.code, "coupon_not_started"],
      [expired.coupon.code, "coupon_expired"],
    ];
    for (const [couponCode, code] of cases) {
      const result = await quoteCart({ mode: "pickup", items, couponCode }, NOW);
      expect(result.ok).toBe(false);
      expect(couponReasons(result)).toEqual([{ code, detail: couponCode }]);
    }
  });

  it("treats the window edges as inclusive at start and end", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const items = [{ ...pizza30, quantity: 1, toppingIds: [ambalajId] }];
    const created = await createCoupon(
      couponInput({
        code: testCode("EDGE"),
        startsAt: NOW,
        endsAt: new Date("2026-07-20T12:00:00.000Z"),
      }),
    );
    if (!created.ok) throw new Error("setup failed");

    const atStart = await quoteCart({ mode: "pickup", items, couponCode: created.coupon.code }, NOW);
    expect(atStart.ok).toBe(true);
    const atEnd = await quoteCart(
      { mode: "pickup", items, couponCode: created.coupon.code },
      new Date("2026-07-20T12:00:00.000Z"),
    );
    expect(atEnd.ok).toBe(true);
  });

  it("boundary normalization: any casing reaches the engine as the canonical code", () => {
    const parsed = quoteRequestSchema.parse({
      mode: "pickup",
      items: [{ productId: 1, variantId: 1, quantity: 1 }],
      couponCode: "  vara10 ",
    });
    expect(parsed.couponCode).toBe("VARA10");
  });

  it("without couponCode the quote is unchanged (regression)", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const sosId = await findTopping("Adauga un sos", "Sos Dulce 80 ml");
    const result = await quoteCart({
      mode: "pickup",
      items: [{ ...pizza30, quantity: 1, toppingIds: [ambalajId, sosId] }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.subtotalBani).toBe(4500);
      expect(result.quote.discountBani).toBe(0);
      expect(result.quote.coupon).toBeNull();
      expect(result.quote.totalBani).toBe(4500);
    }
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
