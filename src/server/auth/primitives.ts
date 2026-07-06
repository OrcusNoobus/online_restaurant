/**
 * Method-agnostic auth primitives shared by staff auth (feat-007) and
 * customer auth (feat-010): scrypt password hashing, opaque session tokens
 * (only their SHA-256 ever reaches the DB), and session-cookie strings
 * parameterized by cookie name. Moved verbatim from services/auth.ts
 * (005-conturi-clienti research D3) so a future cost bump or cookie fix
 * happens once, for every principal type. Imports node:crypto only — this
 * module sits beside repositories and must stay DB-free.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

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

// Verified instead of the real hash when the account does not exist or has no
// password, so unknown and known identifiers cost the same time (no
// enumeration by timing).
let dummyHashPromise: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("timing-equalizer-not-a-real-password");
  return dummyHashPromise;
}

/** Opaque session token — lives only in the httpOnly cookie, never in the DB. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the DB stores instead of the token — a leak yields nothing usable. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

/** Set-Cookie values — contract: httpOnly, SameSite=Lax, Secure in production, path /. */
export function buildSessionCookie(name: string, token: string, expiresAt: Date): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function buildClearedSessionCookie(name: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function tokenFromRequest(request: Request, cookieName: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === cookieName) return rest.join("=") || null;
  }
  return null;
}

export interface LoginRateLimiter {
  isLimited(key: string, now: number): boolean;
  recordFailure(key: string, now: number): void;
  clearFailures(key: string): void;
  /** Test hook — the limiter is process-global state. */
  reset(): void;
}

/**
 * In-memory fixed-window failure counter (003 research D1: single-instance
 * VPS, acceptable v1). One instance per principal type — staff and customer
 * failures must not share a bucket.
 */
export function createLoginRateLimiter(windowMs: number, maxFailures: number): LoginRateLimiter {
  const failures = new Map<string, { count: number; windowStart: number }>();
  return {
    isLimited(key, now) {
      const entry = failures.get(key);
      if (!entry) return false;
      if (now - entry.windowStart > windowMs) {
        failures.delete(key);
        return false;
      }
      return entry.count >= maxFailures;
    },
    recordFailure(key, now) {
      const entry = failures.get(key);
      if (!entry || now - entry.windowStart > windowMs) {
        failures.set(key, { count: 1, windowStart: now });
      } else {
        entry.count += 1;
      }
    },
    clearFailures(key) {
      failures.delete(key);
    },
    reset() {
      failures.clear();
    },
  };
}
