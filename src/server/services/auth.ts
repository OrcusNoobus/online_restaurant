/**
 * Staff authentication (003-panou-admin research D1/D2, human-approved):
 * hand-rolled DB sessions, zero dependencies. Opaque 32-byte token in an
 * httpOnly cookie; the DB stores its SHA-256. Passwords use Node's built-in
 * crypto.scrypt with per-user salt and parameters stored alongside the hash.
 * Contract: 003-panou-admin/06-contracts/api.md (Auth).
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import {
  createSession,
  deleteSessionById,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
  findUserByUsername,
  renewSession,
  type StaffRole,
  type StaffUserRow,
  sweepExpiredSessions,
} from "@/server/repositories/staff";

export const SESSION_COOKIE_NAME = "rf_admin_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Skip the renewal write when the session was touched this recently — the 5s poller must not write on every tick. */
const RENEWAL_MIN_INTERVAL_MS = 60 * 1000;

// OWASP-recommended scrypt cost (2^17, r=8, p=1); parameters are stored in the
// hash string, so they can be raised later without invalidating old hashes.
const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem must exceed 128*N*r; double it for headroom
    scrypt(password, salt, SCRYPT_KEYLEN, { N, r, p, maxmem: 256 * N * r }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Format: scrypt:N:r:p:<salt base64url>:<hash base64url> — NEVER plaintext. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const salt = Buffer.from(saltRaw, "base64url");
  const expected = Buffer.from(hashRaw, "base64url");
  const key = await scryptAsync(password, salt, Number(nRaw), Number(rRaw), Number(pRaw));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/** What leaves the auth layer — no hash, no internals. */
export interface PublicStaffUser {
  id: number;
  username: string;
  displayName: string;
  role: StaffRole;
}

function toPublicUser(user: StaffUserRow): PublicStaffUser {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

// ---------------------------------------------------------------------------
// Login rate limit — in-memory per IP+username (research D1: single-instance
// VPS, acceptable v1). Fixed 15-minute window, 10 failures.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 10;

const loginFailures = new Map<string, { count: number; windowStart: number }>();

function rateLimitKey(ip: string | null, username: string): string {
  return `${ip ?? "unknown"}|${username}`;
}

function isRateLimited(key: string, now: number): boolean {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX_FAILURES;
}

function recordFailure(key: string, now: number): void {
  const entry = loginFailures.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginFailures.set(key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

/** Test hook — the limiter is process-global state. */
export function resetLoginRateLimiter(): void {
  loginFailures.clear();
}

// ---------------------------------------------------------------------------
// Login / logout / session verification
// ---------------------------------------------------------------------------

export type LoginResult =
  | { ok: true; user: PublicStaffUser; token: string; expiresAt: Date }
  | { ok: false; error: "invalid_credentials" | "too_many_attempts" };

// Verified instead of the real hash when the user does not exist, so unknown
// and known usernames cost the same time (no enumeration by timing).
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("timing-equalizer-not-a-real-password");
  return dummyHashPromise;
}

export async function login(
  username: string,
  password: string,
  clientIp: string | null,
  now: Date = new Date(),
): Promise<LoginResult> {
  const normalized = username.trim().toLowerCase();
  const key = rateLimitKey(clientIp, normalized);
  if (isRateLimited(key, now.getTime())) return { ok: false, error: "too_many_attempts" };

  const user = await findUserByUsername(normalized);
  // unknown user, wrong password and deactivated account are indistinguishable
  // on purpose (contract), and all three burn one scrypt verification
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
  if (!user || !user.active || !passwordOk) {
    recordFailure(key, now.getTime());
    return { ok: false, error: "invalid_credentials" };
  }

  loginFailures.delete(key);
  await sweepExpiredSessions(now);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await createSession(hashToken(token), user.id, expiresAt);

  return { ok: true, user: toPublicUser(user), token, expiresAt };
}

/** Idempotent — a missing session row is already the desired end state. */
export async function logout(token: string): Promise<void> {
  await deleteSessionByTokenHash(hashToken(token));
}

/**
 * The real per-request check (research D2 — proxy.ts is optimistic only).
 * Valid session → rolling renewal (throttled) → the user; anything else → null.
 */
export async function verifySession(token: string, now: Date = new Date()): Promise<PublicStaffUser | null> {
  const session = await findSessionByTokenHash(hashToken(token));
  if (!session) {
    await sweepExpiredSessions(now);
    return null;
  }
  if (session.expiresAt.getTime() <= now.getTime() || !session.user.active) {
    await deleteSessionById(session.id);
    return null;
  }
  if (now.getTime() - session.lastUsedAt.getTime() > RENEWAL_MIN_INTERVAL_MS) {
    await renewSession(session.id, new Date(now.getTime() + SESSION_TTL_MS), now);
  }
  return toPublicUser(session.user);
}

// ---------------------------------------------------------------------------
// Route-handler guards (Q14 matrix). Handlers map these to 401/403 responses;
// services below this layer stay actor-agnostic and receive staffUserId as data.
// ---------------------------------------------------------------------------

export type GuardResult =
  | { ok: true; user: PublicStaffUser }
  | { ok: false; status: 401; error: "unauthenticated" }
  | { ok: false; status: 403; error: "forbidden_role" };

function tokenFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}

export async function requireStaff(request: Request, now: Date = new Date()): Promise<GuardResult> {
  const token = tokenFromRequest(request);
  if (!token) return { ok: false, status: 401, error: "unauthenticated" };
  const user = await verifySession(token, now);
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  return { ok: true, user };
}

export async function requireAdmin(request: Request, now: Date = new Date()): Promise<GuardResult> {
  const result = await requireStaff(request, now);
  if (!result.ok) return result;
  if (result.user.role !== "admin") return { ok: false, status: 403, error: "forbidden_role" };
  return result;
}
