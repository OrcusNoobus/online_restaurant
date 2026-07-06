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
