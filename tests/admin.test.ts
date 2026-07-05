/**
 * Integration tests for feat-007 (admin panel). Needs the dev Postgres from
 * docker-compose (./init.sh starts it); the suite migrates and seeds itself.
 * Fixtures use "test-" usernames and clean up after themselves.
 */
import { execSync } from "node:child_process";

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { staffSessions, staffUsers } from "@/server/db/schema";
import { createUser, findSessionByTokenHash } from "@/server/repositories/staff";
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

afterAll(async () => {
  if (skipDb) return;
  // cascades staff_sessions
  await db.delete(staffUsers).where(like(staffUsers.username, "test-%"));
});

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
