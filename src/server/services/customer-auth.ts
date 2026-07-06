/**
 * Customer authentication (005-conturi-clienti research D2/D3): the same
 * hand-rolled DB-session model as staff auth (feat-007) with a SEPARATE
 * table + cookie and a 30-day rolling TTL. Method-agnostic crypto/cookie
 * primitives live in src/server/auth/primitives.ts, shared with staff.
 * Contract: 005-conturi-clienti/06-contracts/api.md.
 */
import { CUSTOMER_SESSION_COOKIE_NAME } from "@/lib/account-schemas";
import {
  buildClearedSessionCookie,
  buildSessionCookie,
  createLoginRateLimiter,
  dummyPasswordHash,
  generateSessionToken,
  hashPassword,
  hashToken,
  tokenFromRequest,
  verifyPassword,
} from "@/server/auth/primitives";
import {
  createCustomer,
  createCustomerSession,
  type CustomerRow,
  deleteCustomerSessionById,
  deleteCustomerSessionByTokenHash,
  findCustomerByEmail,
  findCustomerSessionByTokenHash,
  renewCustomerSession,
  sweepExpiredCustomerSessions,
} from "@/server/repositories/customers";
import { claimGuestOrders } from "@/server/repositories/orders";

export { CUSTOMER_SESSION_COOKIE_NAME };
/** 30 days rolling (02-clarify D-a) — customers expect to stay logged in longer than staff (7d). */
export const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Skip the renewal write when the session was touched this recently. */
const RENEWAL_MIN_INTERVAL_MS = 60 * 1000;

/** What leaves the auth layer — no hash, no internals. */
export interface AuthenticatedCustomer {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  addressStreet: string | null;
  zoneId: number | null;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export function toAuthenticatedCustomer(row: CustomerRow): AuthenticatedCustomer {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    addressStreet: row.addressStreet,
    zoneId: row.zoneId,
    hasPassword: row.passwordHash !== null,
    hasGoogle: row.googleSub !== null,
  };
}

// ---------------------------------------------------------------------------
// Login rate limit — separate bucket from staff (same window/threshold).
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 10;

const rateLimiter = createLoginRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_FAILURES);

function rateLimitKey(ip: string | null, email: string): string {
  return `${ip ?? "unknown"}|${email}`;
}

/** Test hook — the limiter is process-global state. */
export function resetCustomerLoginRateLimiter(): void {
  rateLimiter.reset();
}

// ---------------------------------------------------------------------------
// Register / login / logout / session verification
// ---------------------------------------------------------------------------

interface SessionGrant {
  token: string;
  expiresAt: Date;
}

async function grantSession(customerId: number, now: Date): Promise<SessionGrant> {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + CUSTOMER_SESSION_TTL_MS);
  await createCustomerSession(hashToken(token), customerId, expiresAt);
  return { token, expiresAt };
}

export interface RegisterInput {
  /** Lowercased by the boundary schema. */
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Normalized +40… by the boundary schema; optional (D-g). */
  phone?: string | null;
}

export type RegisterResult =
  | { ok: true; customer: AuthenticatedCustomer; token: string; expiresAt: Date; claimedOrders: number }
  | { ok: false; error: "email_taken" };

export async function register(input: RegisterInput, now: Date = new Date()): Promise<RegisterResult> {
  const passwordHash = await hashPassword(input.password);

  let customerId: number;
  try {
    customerId = await createCustomer({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      termsAcceptedAt: now,
    });
  } catch (error) {
    // the unique index is the arbiter — no pre-check race (D2)
    const constraint = (error as { cause?: { constraint?: string } }).cause?.constraint;
    if (constraint === "customers_email_unique") return { ok: false, error: "email_taken" };
    throw error;
  }

  // guest-order backfill at creation: email always, phone when given (Q3/D4)
  const claimedOrders = await claimGuestOrders(customerId, {
    phone: input.phone ?? null,
    emailLower: input.email,
  });

  const { token, expiresAt } = await grantSession(customerId, now);

  const customer = toAuthenticatedCustomer({
    id: customerId,
    email: input.email,
    passwordHash,
    googleSub: null,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone ?? null,
    addressStreet: null,
    zoneId: null,
    termsAcceptedAt: now,
  });
  return { ok: true, customer, token, expiresAt, claimedOrders };
}

export type CustomerLoginResult =
  | { ok: true; customer: AuthenticatedCustomer; token: string; expiresAt: Date }
  | { ok: false; error: "invalid_credentials" | "too_many_attempts" };

export async function loginCustomer(
  email: string,
  password: string,
  clientIp: string | null,
  now: Date = new Date(),
): Promise<CustomerLoginResult> {
  const key = rateLimitKey(clientIp, email);
  if (rateLimiter.isLimited(key, now.getTime())) return { ok: false, error: "too_many_attempts" };

  const customer = await findCustomerByEmail(email);
  // unknown email, wrong password and Google-only account (no password) are
  // indistinguishable on purpose, and all three burn one scrypt verification
  const passwordOk = await verifyPassword(password, customer?.passwordHash ?? (await dummyPasswordHash()));
  if (!customer || customer.passwordHash === null || !passwordOk) {
    rateLimiter.recordFailure(key, now.getTime());
    return { ok: false, error: "invalid_credentials" };
  }

  rateLimiter.clearFailures(key);
  await sweepExpiredCustomerSessions(now);

  const { token, expiresAt } = await grantSession(customer.id, now);
  return { ok: true, customer: toAuthenticatedCustomer(customer), token, expiresAt };
}

/** Idempotent — a missing session row is already the desired end state. */
export async function logoutCustomer(token: string): Promise<void> {
  await deleteCustomerSessionByTokenHash(hashToken(token));
}

/**
 * The real per-request check. Valid session → rolling renewal (throttled) →
 * the customer; anything else → null.
 */
export async function verifyCustomerSession(
  token: string,
  now: Date = new Date(),
): Promise<AuthenticatedCustomer | null> {
  const session = await findCustomerSessionByTokenHash(hashToken(token));
  if (!session) {
    await sweepExpiredCustomerSessions(now);
    return null;
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    await deleteCustomerSessionById(session.id);
    return null;
  }
  if (now.getTime() - session.lastUsedAt.getTime() > RENEWAL_MIN_INTERVAL_MS) {
    await renewCustomerSession(session.id, new Date(now.getTime() + CUSTOMER_SESSION_TTL_MS), now);
  }
  return toAuthenticatedCustomer(session.customer);
}

// ---------------------------------------------------------------------------
// Route-handler guard + cookie helpers (mirror of the staff shapes)
// ---------------------------------------------------------------------------

export type CustomerGuardResult =
  | { ok: true; customer: AuthenticatedCustomer }
  | { ok: false; status: 401; error: "unauthenticated" };

export function customerSessionTokenFromRequest(request: Request): string | null {
  return tokenFromRequest(request, CUSTOMER_SESSION_COOKIE_NAME);
}

export function customerSessionCookie(token: string, expiresAt: Date): string {
  return buildSessionCookie(CUSTOMER_SESSION_COOKIE_NAME, token, expiresAt);
}

export function clearedCustomerSessionCookie(): string {
  return buildClearedSessionCookie(CUSTOMER_SESSION_COOKIE_NAME);
}

export async function requireCustomer(request: Request, now: Date = new Date()): Promise<CustomerGuardResult> {
  const token = customerSessionTokenFromRequest(request);
  if (!token) return { ok: false, status: 401, error: "unauthenticated" };
  const customer = await verifyCustomerSession(token, now);
  if (!customer) return { ok: false, status: 401, error: "unauthenticated" };
  return { ok: true, customer };
}
