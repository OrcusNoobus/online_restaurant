/**
 * Route-layer tests for feat-011 (/api/admin/coupons*): status mapping and
 * the Q4 role matrix in BOTH directions on every handler, plus the angajat
 * reading a discounted order's detail. Needs the dev Postgres; the suite
 * migrates/seeds itself and cleans up its "test-cpn-" staff users,
 * "T-CPNR-" coupons and test orders.
 */
import { execSync } from "node:child_process";

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getAdminOrderRoute } from "@/app/api/admin/orders/[id]/route";
import { PATCH as patchCouponRoute } from "@/app/api/admin/coupons/[id]/route";
import { GET as getCouponsRoute, POST as postCouponRoute } from "@/app/api/admin/coupons/route";
import { db } from "@/server/db/client";
import { coupons, orders, staffUsers } from "@/server/db/schema";
import { createCoupon } from "@/server/repositories/coupons";
import { insertOrder, type NewOrder } from "@/server/repositories/orders";
import { createUser } from "@/server/repositories/staff";
import { hashPassword, login, resetLoginRateLimiter, SESSION_COOKIE_NAME } from "@/server/services/auth";

// SKIP_DB=1 runs ./init.sh without Docker (e.g. CI); these suites need Postgres.
const skipDb = process.env.SKIP_DB === "1";

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

const PASSWORD = "parola-de-test-123";
let adminToken: string;
let staffToken: string;

/** Short unique per-run suffix — codes must fit couponCodeSchema (max 32). */
const RUN = `${Date.now().toString(36).slice(-6)}${process.pid.toString(36)}`;
let seq = 0;
function testCode(tag: string): string {
  seq += 1;
  return `T-CPNR-${tag}-${RUN}${seq}`.toUpperCase();
}

const testOrderIds: number[] = [];

beforeAll(async () => {
  if (skipDb) return;
  run("npm run db:migrate");
  run("npm run db:seed");
  await db.delete(staffUsers).where(like(staffUsers.username, "test-cpn-%"));
  await db.delete(coupons).where(like(coupons.code, "T-CPNR-%"));

  const passwordHash = await hashPassword(PASSWORD);
  await createUser({ username: "test-cpn-admin", displayName: "Cpn Admin", passwordHash, role: "admin" });
  await createUser({ username: "test-cpn-staff", displayName: "Cpn Staff", passwordHash, role: "staff" });

  resetLoginRateLimiter();
  const adminLogin = await login("test-cpn-admin", PASSWORD, "10.9.0.1");
  const staffLogin = await login("test-cpn-staff", PASSWORD, "10.9.0.1");
  if (!adminLogin.ok || !staffLogin.ok) throw new Error("login setup failed");
  adminToken = adminLogin.token;
  staffToken = staffLogin.token;
}, 120_000);

afterAll(async () => {
  if (skipDb) return;
  for (const orderId of testOrderIds) {
    await db.delete(orders).where(eq(orders.id, orderId));
  }
  await db.delete(coupons).where(like(coupons.code, "T-CPNR-%"));
  // cascades staff_sessions
  await db.delete(staffUsers).where(like(staffUsers.username, "test-cpn-%"));
});

function request(token: string | null, body?: unknown): Request {
  return new Request("http://localhost/api/admin/coupons", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function ctxFor(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) };
}

describe.skipIf(skipDb)("/api/admin/coupons routes (T05)", () => {
  it("role matrix, both directions, on all three handlers", async () => {
    // no session → 401 everywhere
    expect((await getCouponsRoute(request(null))).status).toBe(401);
    expect((await postCouponRoute(request(null, { code: "X" }))).status).toBe(401);
    expect((await patchCouponRoute(request(null, { active: false }), ctxFor(1))).status).toBe(401);

    // angajat → 403 everywhere (the section simply does not exist for staff)
    expect((await getCouponsRoute(request(staffToken))).status).toBe(403);
    expect((await postCouponRoute(request(staffToken, { code: "X" }))).status).toBe(403);
    expect((await patchCouponRoute(request(staffToken, { active: false }), ctxFor(1))).status).toBe(403);

    // admin → 200/201 on the same calls
    const created = await postCouponRoute(request(adminToken, { code: testCode("RM"), type: "percent", value: 10 }));
    expect(created.status).toBe(201);
    const { coupon } = (await created.json()) as { coupon: { id: number } };

    expect((await getCouponsRoute(request(adminToken))).status).toBe(200);
    expect((await patchCouponRoute(request(adminToken, { active: false }), ctxFor(coupon.id))).status).toBe(200);
  });

  it("POST normalizes the code and maps semantic refusals to named 422s", async () => {
    const code = testCode("MAP");
    const created = await postCouponRoute(
      request(adminToken, { code: code.toLowerCase(), type: "fixed", value: 2000 }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as { coupon: { code: string; type: string; value: number; active: boolean } };
    expect(body.coupon).toMatchObject({ code, type: "fixed", value: 2000, active: true });

    const duplicate = await postCouponRoute(request(adminToken, { code, type: "percent", value: 5 }));
    expect(duplicate.status).toBe(422);
    expect(await duplicate.json()).toEqual({ error: "code_taken" });

    const badValue = await postCouponRoute(request(adminToken, { code: testCode("BAD"), type: "percent", value: 0 }));
    expect(badValue.status).toBe(422);
    expect(await badValue.json()).toEqual({ error: "invalid_value_for_type" });

    const badWindow = await postCouponRoute(
      request(adminToken, {
        code: testCode("WIN"),
        type: "percent",
        value: 10,
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-07-01T00:00:00.000Z",
      }),
    );
    expect(badWindow.status).toBe(422);
    expect(await badWindow.json()).toEqual({ error: "invalid_window" });

    // malformed code = validation (400), not semantics
    const malformed = await postCouponRoute(request(adminToken, { code: "ab", type: "percent", value: 10 }));
    expect(malformed.status).toBe(400);
    expect(((await malformed.json()) as { error: string }).error).toBe("validation");
  });

  it("PATCH maps not_found/validation/semantic statuses", async () => {
    const created = await postCouponRoute(request(adminToken, { code: testCode("PT"), type: "percent", value: 10 }));
    const { coupon } = (await created.json()) as { coupon: { id: number } };

    expect((await patchCouponRoute(request(adminToken, { active: false }), ctxFor(999_999_999))).status).toBe(404);
    expect((await patchCouponRoute(request(adminToken, { active: false }), ctxFor("abc"))).status).toBe(404);
    expect((await patchCouponRoute(request(adminToken, {}), ctxFor(coupon.id))).status).toBe(400);
    expect((await patchCouponRoute(request(adminToken, { nu_exista: 1 }), ctxFor(coupon.id))).status).toBe(400);

    const inconsistent = await patchCouponRoute(request(adminToken, { type: "free_delivery" }), ctxFor(coupon.id));
    expect(inconsistent.status).toBe(422);
    expect(await inconsistent.json()).toEqual({ error: "invalid_value_for_type" });

    const patched = await patchCouponRoute(request(adminToken, { value: 25 }), ctxFor(coupon.id));
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { coupon: { value: number } }).coupon.value).toBe(25);
  });

  it("angajat sees the discount on an order detail, without seeing the coupons section", async () => {
    const created = await createCoupon({
      code: testCode("ORD"),
      type: "fixed",
      value: 500,
      startsAt: null,
      endsAt: null,
    });
    if (!created.ok) throw new Error("setup failed");

    const order: NewOrder = {
      mode: "pickup",
      customerFirstName: "Test",
      customerLastName: "Client",
      phone: "+40712345678",
      email: null,
      zoneId: null,
      addressStreet: null,
      notes: null,
      scheduledFor: null,
      estimateMinutes: 25,
      paymentMethod: "cash",
      subtotalBani: 4000,
      sgrBani: 0,
      deliveryFeeBani: 0,
      couponId: created.coupon.id,
      couponCode: created.coupon.code,
      discountBani: 500,
      totalBani: 3500,
      termsAcceptedAt: new Date(),
      clientIp: null,
      items: [],
    };
    const orderId = await insertOrder(order);
    testOrderIds.push(orderId);

    const detail = await getAdminOrderRoute(request(staffToken), ctxFor(orderId));
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { order: { discountBani: number; couponCode: string; totalBani: number } };
    expect(body.order).toMatchObject({ discountBani: 500, couponCode: created.coupon.code, totalBani: 3500 });
  });
});
