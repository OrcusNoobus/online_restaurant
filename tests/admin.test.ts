/**
 * Integration tests for feat-007 (admin panel). Needs the dev Postgres from
 * docker-compose (./init.sh starts it); the suite migrates and seeds itself.
 * Fixtures use "test-" usernames and clean up after themselves.
 */
import { execSync } from "node:child_process";

import { eq, like } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as postLoginRoute } from "@/app/api/admin/auth/login/route";
import { POST as postLogoutRoute } from "@/app/api/admin/auth/logout/route";
import { GET as getMeRoute } from "@/app/api/admin/auth/me/route";
import { GET as getAdminOrdersRoute } from "@/app/api/admin/orders/route";
import { GET as getAdminOrderRoute } from "@/app/api/admin/orders/[id]/route";
import { POST as postTransitionRoute } from "@/app/api/admin/orders/[id]/transition/route";
import { POST as postUndoRoute } from "@/app/api/admin/orders/[id]/undo/route";
import { localDateKey } from "@/lib/schedule";
import { proxy } from "@/proxy";
import { db } from "@/server/db/client";
import { deliveryZones, orders, productVariants, staffSessions, staffUsers } from "@/server/db/schema";
import { insertOrder, type NewOrder } from "@/server/repositories/orders";
import { createUser, findSessionByTokenHash } from "@/server/repositories/staff";
import { getDetail, listDay, transition, undo } from "@/server/services/admin-orders";
import {
  hashPassword,
  login,
  logout,
  requireAdmin,
  requireStaff,
  resetLoginRateLimiter,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  verifyPassword,
  verifySession,
} from "@/server/services/auth";

// SKIP_DB=1 runs ./init.sh without Docker (e.g. CI); these suites need Postgres.
const skipDb = process.env.SKIP_DB === "1";

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

const PASSWORD = "parola-de-test-123";
let adminId: number;
let staffId: number;

beforeAll(async () => {
  if (skipDb) return;
  run("npm run db:migrate");
  run("npm run db:seed");
  await db.delete(staffUsers).where(like(staffUsers.username, "test-%"));
  const passwordHash = await hashPassword(PASSWORD);
  adminId = await createUser({ username: "test-admin", displayName: "Test Admin", passwordHash, role: "admin" });
  staffId = await createUser({ username: "test-staff", displayName: "Test Staff", passwordHash, role: "staff" });
}, 120_000);

const testOrderIds: number[] = [];

afterAll(async () => {
  if (skipDb) return;
  // orders first: their status events reference staff users with RESTRICT
  for (const orderId of testOrderIds) {
    await db.delete(orders).where(eq(orders.id, orderId));
  }
  // cascades staff_sessions
  await db.delete(staffUsers).where(like(staffUsers.username, "test-%"));
});

/** Minimal valid order against seeded catalog rows — pre-priced like the service would. */
async function createTestOrder(mode: "delivery" | "pickup"): Promise<number> {
  const [variant] = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      priceBani: productVariants.priceBani,
    })
    .from(productVariants)
    .limit(1);
  const [zone] = await db.select({ id: deliveryZones.id }).from(deliveryZones).limit(1);

  const feeBani = mode === "delivery" ? 300 : 0;
  const order: NewOrder = {
    mode,
    customerFirstName: "Test",
    customerLastName: "Client",
    phone: "+40712345678",
    email: null,
    zoneId: mode === "delivery" ? zone.id : null,
    addressStreet: mode === "delivery" ? "Str. Test 1" : null,
    notes: null,
    scheduledFor: null,
    estimateMinutes: mode === "delivery" ? 60 : 25,
    paymentMethod: mode === "delivery" ? "cash" : "card_restaurant",
    subtotalBani: variant.priceBani,
    sgrBani: 0,
    deliveryFeeBani: feeBani,
    totalBani: variant.priceBani + feeBani,
    termsAcceptedAt: new Date(),
    clientIp: null,
    items: [
      {
        productId: variant.productId,
        variantId: variant.id,
        productName: "Produs test",
        variantName: variant.name,
        unitPriceBani: variant.priceBani,
        quantity: 1,
        lineTotalBani: variant.priceBani,
        options: [],
      },
    ],
  };
  const orderId = await insertOrder(order);
  testOrderIds.push(orderId);
  return orderId;
}

function requestWithCookie(token: string | null): Request {
  return new Request("http://localhost/api/admin/test", {
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });
}

describe.skipIf(skipDb)("password hashing", () => {
  it("hashes with stored scrypt parameters and never stores plaintext", async () => {
    const stored = await hashPassword("secret-pass");
    expect(stored).toMatch(/^scrypt:\d+:\d+:\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    expect(stored).not.toContain("secret-pass");
    expect(await verifyPassword("secret-pass", stored)).toBe(true);
    expect(await verifyPassword("wrong-pass", stored)).toBe(false);
  });
});

describe.skipIf(skipDb)("login", () => {
  it("valid credentials create a 7-day session and return the public user", async () => {
    resetLoginRateLimiter();
    const now = new Date();
    const result = await login("test-admin", PASSWORD, "10.0.0.1", now);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toEqual({ id: adminId, username: "test-admin", displayName: "Test Admin", role: "admin" });
    expect(result.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
    // the DB row stores a hash, never the token itself
    const rows = await db.select().from(staffSessions).where(eq(staffSessions.staffUserId, adminId));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(result.token);
    await logout(result.token);
  });

  it("usernames are case-insensitive (stored lowercase)", async () => {
    resetLoginRateLimiter();
    const result = await login("  TEST-Admin ", PASSWORD, "10.0.0.1");
    expect(result.ok).toBe(true);
    if (result.ok) await logout(result.token);
  });

  it("wrong password, unknown user and deactivated account are indistinguishable", async () => {
    resetLoginRateLimiter();
    const wrongPassword = await login("test-admin", "not-the-password", "10.0.0.2");
    const unknownUser = await login("test-no-such-user", PASSWORD, "10.0.0.2");
    await db.update(staffUsers).set({ active: false }).where(eq(staffUsers.id, staffId));
    try {
      const deactivated = await login("test-staff", PASSWORD, "10.0.0.2");
      expect(wrongPassword).toEqual({ ok: false, error: "invalid_credentials" });
      expect(unknownUser).toEqual({ ok: false, error: "invalid_credentials" });
      expect(deactivated).toEqual({ ok: false, error: "invalid_credentials" });
    } finally {
      await db.update(staffUsers).set({ active: true }).where(eq(staffUsers.id, staffId));
    }
  });

  it("rate-limits per IP+username after repeated failures, even with the right password", async () => {
    resetLoginRateLimiter();
    try {
      for (let i = 0; i < 10; i++) {
        const failed = await login("test-staff", "wrong-password", "10.0.0.3");
        expect(failed).toEqual({ ok: false, error: "invalid_credentials" });
      }
      const limited = await login("test-staff", PASSWORD, "10.0.0.3");
      expect(limited).toEqual({ ok: false, error: "too_many_attempts" });
      // a different IP is a different bucket
      const otherIp = await login("test-staff", PASSWORD, "10.0.0.4");
      expect(otherIp.ok).toBe(true);
      if (otherIp.ok) await logout(otherIp.token);
    } finally {
      resetLoginRateLimiter();
    }
  }, 60_000);
});

describe.skipIf(skipDb)("sessions", () => {
  it("verifySession accepts a live token and rejects garbage", async () => {
    const result = await login("test-staff", PASSWORD, "10.0.1.1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      expect(await verifySession(result.token)).toEqual({
        id: staffId,
        username: "test-staff",
        displayName: "Test Staff",
        role: "staff",
      });
      expect(await verifySession("not-a-real-token")).toBeNull();
    } finally {
      await logout(result.token);
    }
  });

  it("expired sessions are refused and deleted on lookup", async () => {
    const result = await login("test-staff", PASSWORD, "10.0.1.2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await db
      .update(staffSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(staffSessions.staffUserId, staffId));
    expect(await verifySession(result.token)).toBeNull();
    const rows = await db.select().from(staffSessions).where(eq(staffSessions.staffUserId, staffId));
    expect(rows).toHaveLength(0);
  });

  it("renews the rolling expiry when the session has not been touched recently", async () => {
    const result = await login("test-staff", PASSWORD, "10.0.1.3");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      const stale = new Date(Date.now() - 60 * 60 * 1000);
      await db
        .update(staffSessions)
        .set({ expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), lastUsedAt: stale })
        .where(eq(staffSessions.staffUserId, staffId));

      const now = new Date();
      expect(await verifySession(result.token, now)).not.toBeNull();

      const [row] = await db.select().from(staffSessions).where(eq(staffSessions.staffUserId, staffId));
      expect(row.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS);
      expect(row.lastUsedAt.getTime()).toBe(now.getTime());
    } finally {
      await logout(result.token);
    }
  });

  it("deactivating a user invalidates their existing sessions", async () => {
    const result = await login("test-staff", PASSWORD, "10.0.1.4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await db.update(staffUsers).set({ active: false }).where(eq(staffUsers.id, staffId));
    try {
      expect(await verifySession(result.token)).toBeNull();
      // the invalidated session row is gone, not just skipped
      const rows = await db.select().from(staffSessions).where(eq(staffSessions.staffUserId, staffId));
      expect(rows).toHaveLength(0);
    } finally {
      await db.update(staffUsers).set({ active: true }).where(eq(staffUsers.id, staffId));
    }
  });

  it("logout deletes the session and is idempotent", async () => {
    const result = await login("test-staff", PASSWORD, "10.0.1.5");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await logout(result.token);
    expect(await verifySession(result.token)).toBeNull();
    await expect(logout(result.token)).resolves.toBeUndefined();
  });

  it("login sweeps expired sessions of other users opportunistically", async () => {
    // plant an already-expired session for the admin
    const { createSession } = await import("@/server/repositories/staff");
    await createSession("test-expired-hash", adminId, new Date(Date.now() - 1000));
    const result = await login("test-staff", PASSWORD, "10.0.1.6");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      expect(await findSessionByTokenHash("test-expired-hash")).toBeNull();
    } finally {
      await logout(result.token);
    }
  });
});

describe.skipIf(skipDb)("auth HTTP boundary", () => {
  function loginRequest(body: unknown): Request {
    return new Request("http://localhost/api/admin/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("a protected route answers 401 without a cookie", async () => {
    const response = await getMeRoute(requestWithCookie(null));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("login sets the httpOnly session cookie and returns the user", async () => {
    resetLoginRateLimiter();
    const response = await postLoginRoute(loginRequest({ username: "test-admin", password: PASSWORD }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    const body = (await response.json()) as { user: { username: string; role: string } };
    expect(body.user).toMatchObject({ username: "test-admin", role: "admin" });

    const token = cookie!.split(";")[0].split("=")[1];
    await logout(token);
  });

  it("login with bad credentials → 401, malformed body → 400", async () => {
    resetLoginRateLimiter();
    const bad = await postLoginRoute(loginRequest({ username: "test-admin", password: "wrong" }));
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: "invalid_credentials" });

    const malformed = await postLoginRoute(loginRequest({ username: "test-admin" }));
    expect(malformed.status).toBe(400);
    const body = (await malformed.json()) as { error: string };
    expect(body.error).toBe("validation");
    resetLoginRateLimiter();
  });

  it("me → logout → me round-trip: 200, 204 + cleared cookie, then 401", async () => {
    resetLoginRateLimiter();
    const loginResponse = await postLoginRoute(loginRequest({ username: "test-staff", password: PASSWORD }));
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.headers.get("set-cookie")!.split(";")[0].split("=")[1];

    const me = await getMeRoute(requestWithCookie(token));
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user: { username: string } };
    expect(meBody.user.username).toBe("test-staff");

    const logoutResponse = await postLogoutRoute(requestWithCookie(token));
    expect(logoutResponse.status).toBe(204);
    const cleared = logoutResponse.headers.get("set-cookie");
    expect(cleared).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(cleared).toContain("Max-Age=0");

    const meAfter = await getMeRoute(requestWithCookie(token));
    expect(meAfter.status).toBe(401);

    // idempotent: logging out again still answers 204
    const again = await postLogoutRoute(requestWithCookie(token));
    expect(again.status).toBe(204);
  });
});

describe("proxy (optimistic redirect, no DB)", () => {
  it("redirects /admin without a cookie to /admin/login", () => {
    const response = proxy(new NextRequest("http://localhost/admin"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/admin/login");
  });

  it("passes /admin/login through even without a cookie — no redirect loop", () => {
    const response = proxy(new NextRequest("http://localhost/admin/login"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes /admin through when the session cookie is present", () => {
    const response = proxy(
      new NextRequest("http://localhost/admin", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=some-token` },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
  });
});

describe.skipIf(skipDb)("admin orders service", () => {
  it("delivery happy path: accept with estimate → in_delivery → completed, journaled + attributed", async () => {
    const orderId = await createTestOrder("delivery");

    const accepted = await transition(orderId, { to: "accepted", estimateMinutes: 45 }, adminId);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.detail.order.status).toBe("accepted");
    expect(accepted.detail.order.estimateMinutes).toBe(45);
    expect(accepted.detail.events).toHaveLength(1);
    expect(accepted.detail.events[0]).toMatchObject({
      fromStatus: "new",
      toStatus: "accepted",
      reason: null,
      staffDisplayName: "Test Admin",
      undoOfEventId: null,
    });

    const inDelivery = await transition(orderId, { to: "in_delivery" }, staffId);
    expect(inDelivery.ok && inDelivery.detail.order.status === "in_delivery").toBe(true);

    const completed = await transition(orderId, { to: "completed" }, staffId);
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.detail.order.status).toBe("completed");
    expect(completed.detail.events).toHaveLength(3);
    expect(completed.detail.events.map((event) => event.staffDisplayName)).toEqual([
      "Test Admin",
      "Test Staff",
      "Test Staff",
    ]);
  });

  it("pickup happy path; omitted estimate keeps the placement quote", async () => {
    const orderId = await createTestOrder("pickup");

    const accepted = await transition(orderId, { to: "accepted" }, staffId);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.detail.order.estimateMinutes).toBe(25);

    const ready = await transition(orderId, { to: "ready_for_pickup" }, staffId);
    expect(ready.ok && ready.detail.order.status === "ready_for_pickup").toBe(true);

    const completed = await transition(orderId, { to: "completed" }, staffId);
    expect(completed.ok && completed.detail.order.status === "completed").toBe(true);
  });

  it("returns every 422 code from the contract", async () => {
    const orderId = await createTestOrder("pickup");

    expect(await transition(orderId, { to: "in_delivery" }, staffId)).toEqual({
      ok: false,
      error: "invalid_transition",
    });
    expect(await transition(orderId, { to: "canceled" }, staffId)).toEqual({
      ok: false,
      error: "cancel_reason_required",
    });
    expect(await undo(orderId, staffId)).toEqual({ ok: false, error: "nothing_to_undo" });

    const accepted = await transition(orderId, { to: "accepted" }, staffId);
    expect(accepted.ok).toBe(true);
    expect(await transition(orderId, { to: "ready_for_pickup", estimateMinutes: 10 }, staffId)).toEqual({
      ok: false,
      error: "estimate_not_allowed",
    });

    expect(await transition(999_999_999, { to: "accepted" }, staffId)).toEqual({ ok: false, error: "not_found" });
  });

  it("cancel stores the reason; undo restores the prior state via a compensating event", async () => {
    const orderId = await createTestOrder("delivery");
    await transition(orderId, { to: "accepted" }, staffId);

    const canceled = await transition(orderId, { to: "canceled", reason: "clientul nu răspunde" }, adminId);
    expect(canceled.ok).toBe(true);
    if (!canceled.ok) return;
    expect(canceled.detail.order.status).toBe("canceled");
    expect(canceled.detail.events.at(-1)).toMatchObject({
      toStatus: "canceled",
      reason: "clientul nu răspunde",
    });

    const undone = await undo(orderId, staffId);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.detail.order.status).toBe("accepted");
    const compensating = undone.detail.events.at(-1)!;
    expect(compensating.fromStatus).toBe("canceled");
    expect(compensating.toStatus).toBe("accepted");
    expect(compensating.undoOfEventId).not.toBeNull();

    // an undo cannot itself be undone — no redo ping-pong
    expect(await undo(orderId, staffId)).toEqual({ ok: false, error: "nothing_to_undo" });
  });

  it("two concurrent transitions: exactly one winner, the loser gets stale_state", async () => {
    const orderId = await createTestOrder("delivery");

    const [first, second] = await Promise.all([
      transition(orderId, { to: "accepted", estimateMinutes: 40 }, adminId),
      transition(orderId, { to: "accepted", estimateMinutes: 50 }, staffId),
    ]);
    const winners = [first, second].filter((result) => result.ok);
    const losers = [first, second].filter((result) => !result.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ ok: false, error: "stale_state", currentStatus: "accepted" });

    // exactly ONE event was written
    const detail = await getDetail(orderId);
    expect(detail!.events).toHaveLength(1);
  });

  it("day totals exclude canceled orders and count them separately; filter narrows the list only", async () => {
    const today = localDateKey(new Date());
    const before = await listDay(undefined, undefined);
    expect(before.date).toBe(today);

    const aliveId = await createTestOrder("pickup");
    const canceledId = await createTestOrder("pickup");
    const [alive] = await db
      .select({ totalBani: orders.totalBani })
      .from(orders)
      .where(eq(orders.id, aliveId));
    await transition(canceledId, { to: "canceled", reason: "test anulare" }, adminId);

    const after = await listDay(undefined, undefined);
    expect(after.totals.count).toBe(before.totals.count + 1);
    expect(after.totals.totalBani).toBe(before.totals.totalBani + alive.totalBani);
    expect(after.totals.canceledCount).toBe(before.totals.canceledCount + 1);

    // newest-first: the two fixtures lead the list
    expect(after.orders[0].id).toBeGreaterThan(after.orders[1].id);

    // a status filter narrows the list, totals stay whole-day
    const filtered = await listDay(undefined, "canceled");
    expect(filtered.orders.every((order) => order.status === "canceled")).toBe(true);
    expect(filtered.orders.some((order) => order.id === canceledId)).toBe(true);
    expect(filtered.totals).toEqual(after.totals);
  });
});

describe.skipIf(skipDb)("admin orders HTTP boundary", () => {
  function ctxFor(id: number | string) {
    return { params: Promise.resolve({ id: String(id) }) };
  }

  it("every orders endpoint requires a session", async () => {
    const bare = requestWithCookie(null);
    expect((await getAdminOrdersRoute(bare)).status).toBe(401);
    expect((await getAdminOrderRoute(bare, ctxFor(1))).status).toBe(401);
    expect((await postUndoRoute(bare, ctxFor(1))).status).toBe(401);
  });

  it("day view + detail + transition + undo round-trip through HTTP", async () => {
    resetLoginRateLimiter();
    const loginResult = await login("test-staff", PASSWORD, "10.0.3.1");
    expect(loginResult.ok).toBe(true);
    if (!loginResult.ok) return;
    const token = loginResult.token;

    try {
      const orderId = await createTestOrder("pickup");

      const dayResponse = await getAdminOrdersRoute(requestWithCookie(token));
      expect(dayResponse.status).toBe(200);
      const day = (await dayResponse.json()) as {
        date: string;
        orders: { id: number; status: string }[];
        totals: { count: number };
      };
      expect(day.date).toBe(localDateKey(new Date()));
      expect(day.orders.some((order) => order.id === orderId)).toBe(true);

      // malformed body → 400; semantic violation → 422
      const badShape = await postTransitionRoute(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
          body: JSON.stringify({ to: "flying" }),
        }),
        ctxFor(orderId),
      );
      expect(badShape.status).toBe(400);

      const noReason = await postTransitionRoute(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
          body: JSON.stringify({ to: "canceled" }),
        }),
        ctxFor(orderId),
      );
      expect(noReason.status).toBe(422);
      expect(await noReason.json()).toEqual({ error: "cancel_reason_required" });

      const accept = await postTransitionRoute(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
          body: JSON.stringify({ to: "accepted", estimateMinutes: 20 }),
        }),
        ctxFor(orderId),
      );
      expect(accept.status).toBe(200);
      const accepted = (await accept.json()) as { order: { status: string; estimateMinutes: number } };
      expect(accepted.order).toMatchObject({ status: "accepted", estimateMinutes: 20 });

      // same expected-from again → the conditional update loses → 409
      const stale = await postTransitionRoute(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { cookie: `${SESSION_COOKIE_NAME}=${token}`, "content-type": "application/json" },
          body: JSON.stringify({ to: "accepted" }),
        }),
        ctxFor(orderId),
      );
      expect(stale.status).toBe(422); // from 'accepted', to 'accepted' is graph-invalid, not stale

      const undone = await postUndoRoute(requestWithCookie(token), ctxFor(orderId));
      expect(undone.status).toBe(200);
      const undoneBody = (await undone.json()) as { order: { status: string } };
      expect(undoneBody.order.status).toBe("new");

      const nothingLeft = await postUndoRoute(requestWithCookie(token), ctxFor(orderId));
      expect(nothingLeft.status).toBe(422);
      expect(await nothingLeft.json()).toEqual({ error: "nothing_to_undo" });

      const detailResponse = await getAdminOrderRoute(requestWithCookie(token), ctxFor(orderId));
      expect(detailResponse.status).toBe(200);

      const missing = await getAdminOrderRoute(requestWithCookie(token), ctxFor(999_999_999));
      expect(missing.status).toBe(404);
    } finally {
      await logout(token);
    }
  });
});

describe.skipIf(skipDb)("role guards (Q14 matrix)", () => {
  it("requireStaff: no cookie → unauthenticated; staff and admin both pass", async () => {
    expect(await requireStaff(requestWithCookie(null))).toEqual({
      ok: false,
      status: 401,
      error: "unauthenticated",
    });

    const staffLogin = await login("test-staff", PASSWORD, "10.0.2.1");
    const adminLogin = await login("test-admin", PASSWORD, "10.0.2.1");
    expect(staffLogin.ok && adminLogin.ok).toBe(true);
    if (!staffLogin.ok || !adminLogin.ok) return;
    try {
      const asStaff = await requireStaff(requestWithCookie(staffLogin.token));
      const asAdmin = await requireStaff(requestWithCookie(adminLogin.token));
      expect(asStaff.ok && asStaff.user.role === "staff").toBe(true);
      expect(asAdmin.ok && asAdmin.user.role === "admin").toBe(true);
    } finally {
      await logout(staffLogin.token);
      await logout(adminLogin.token);
    }
  });

  it("requireAdmin: staff → forbidden_role, admin → ok, no session → unauthenticated", async () => {
    expect(await requireAdmin(requestWithCookie(null))).toEqual({
      ok: false,
      status: 401,
      error: "unauthenticated",
    });

    const staffLogin = await login("test-staff", PASSWORD, "10.0.2.2");
    const adminLogin = await login("test-admin", PASSWORD, "10.0.2.2");
    expect(staffLogin.ok && adminLogin.ok).toBe(true);
    if (!staffLogin.ok || !adminLogin.ok) return;
    try {
      expect(await requireAdmin(requestWithCookie(staffLogin.token))).toEqual({
        ok: false,
        status: 403,
        error: "forbidden_role",
      });
      const asAdmin = await requireAdmin(requestWithCookie(adminLogin.token));
      expect(asAdmin.ok && asAdmin.user.id === adminId).toBe(true);
    } finally {
      await logout(staffLogin.token);
      await logout(adminLogin.token);
    }
  });
});
