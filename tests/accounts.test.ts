/**
 * Integration tests for feat-010 (customer accounts). Needs the dev Postgres
 * from docker-compose (./init.sh starts it); the suite migrates and seeds
 * itself. Fixtures use "test-acc-" emails and clean up after themselves.
 */
import { execSync } from "node:child_process";

import { inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hashToken } from "@/server/auth/primitives";
import { db } from "@/server/db/client";
import { customers, deliveryZones, orders, productVariants } from "@/server/db/schema";
import {
  createCustomer,
  createCustomerSession,
  deleteCustomerSessionByTokenHash,
  findCustomerByEmail,
  findCustomerByGoogleSub,
  findCustomerById,
  findCustomerSessionByTokenHash,
  renewCustomerSession,
  setCustomerGoogleSub,
  sweepExpiredCustomerSessions,
  updateCustomerProfile,
} from "@/server/repositories/customers";
import {
  claimGuestOrders,
  getOrderForCustomer,
  insertOrder,
  listOrdersForCustomer,
  type NewOrder,
} from "@/server/repositories/orders";
import {
  buildGoogleAuthUrl,
  decodeAndValidateIdToken,
  type GoogleClaims,
  GoogleAuthError,
  googleRedirectUri,
  isGoogleConfigured,
} from "@/server/auth/google";
import {
  absorbOrderIntoEmptyProfile,
  getCustomerOrderDetail,
  getProfile,
  listCustomerOrders,
  updateProfile,
} from "@/server/services/customer-account";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  CUSTOMER_SESSION_TTL_MS,
  loginCustomer,
  loginWithGoogle,
  logoutCustomer,
  register,
  requireCustomer,
  resetCustomerLoginRateLimiter,
  verifyCustomerSession,
} from "@/server/services/customer-auth";

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
function testEmail(tag: string): string {
  seq += 1;
  return `test-acc-${tag}-${RUN}-${seq}@example.com`;
}

beforeAll(async () => {
  if (skipDb) return;
  run("npm run db:migrate");
  run("npm run db:seed");
  await db.delete(customers).where(like(customers.email, "test-acc-%"));
}, 120_000);

const testOrderIds: number[] = [];

afterAll(async () => {
  if (skipDb) return;
  if (testOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, testOrderIds));
  }
  // cascades customer_sessions
  await db.delete(customers).where(like(customers.email, "test-acc-%"));
});

/** Minimal valid guest/account order against seeded catalog — pre-priced, pickup. */
async function createTestOrder(input: {
  phone?: string;
  email?: string | null;
  customerId?: number | null;
  quantity?: number;
}): Promise<number> {
  const [variant] = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      priceBani: productVariants.priceBani,
    })
    .from(productVariants)
    .limit(1);

  const quantity = input.quantity ?? 1;
  const order: NewOrder = {
    mode: "pickup",
    customerFirstName: "Test",
    customerLastName: "Client",
    phone: input.phone ?? "+40712345678",
    email: input.email ?? null,
    zoneId: null,
    addressStreet: null,
    notes: null,
    scheduledFor: null,
    estimateMinutes: 25,
    paymentMethod: "cash",
    subtotalBani: variant.priceBani * quantity,
    sgrBani: 0,
    deliveryFeeBani: 0,
    totalBani: variant.priceBani * quantity,
    termsAcceptedAt: new Date(),
    clientIp: null,
    customerId: input.customerId,
    items: [
      {
        productId: variant.productId,
        variantId: variant.id,
        productName: "Produs test",
        variantName: variant.name,
        unitPriceBani: variant.priceBani,
        quantity,
        lineTotalBani: variant.priceBani * quantity,
        options: [],
      },
    ],
  };
  const orderId = await insertOrder(order);
  testOrderIds.push(orderId);
  return orderId;
}

async function createTestCustomer(tag: string): Promise<number> {
  return createCustomer({ email: testEmail(tag), passwordHash: "x", termsAcceptedAt: new Date() });
}

describe.skipIf(skipDb)("customers repository (T02)", () => {
  it("round-trips a customer through create and the three lookups", async () => {
    const email = testEmail("roundtrip");
    const id = await createCustomer({
      email,
      passwordHash: "scrypt:1:1:1:salt:hash",
      firstName: "Ana",
      phone: "+40712345678",
      termsAcceptedAt: new Date(),
    });

    const byId = await findCustomerById(id);
    expect(byId?.email).toBe(email);
    expect(byId?.passwordHash).toBe("scrypt:1:1:1:salt:hash");
    expect(byId?.googleSub).toBeNull();
    expect(byId?.firstName).toBe("Ana");
    expect(byId?.phone).toBe("+40712345678");

    expect((await findCustomerByEmail(email))?.id).toBe(id);
    expect(await findCustomerByEmail("nu-exista@example.com")).toBeNull();

    await setCustomerGoogleSub(id, `sub-${RUN}`);
    expect((await findCustomerByGoogleSub(`sub-${RUN}`))?.id).toBe(id);
  });

  it("rejects a second customer with the same email (unique, stored lowercase)", async () => {
    const email = testEmail("dup");
    await createCustomer({ email, passwordHash: "x", termsAcceptedAt: new Date() });
    expect(
      await violatedConstraint(createCustomer({ email, passwordHash: "y", termsAcceptedAt: new Date() })),
    ).toBe("customers_email_unique");
  });

  it("rejects a customer with neither password nor google sub (has_credential CHECK)", async () => {
    expect(
      await violatedConstraint(
        db.insert(customers).values({ email: testEmail("nocred"), termsAcceptedAt: new Date() }),
      ),
    ).toBe("customers_has_credential");
  });

  it("updates profile fields without touching credentials", async () => {
    const email = testEmail("patch");
    const id = await createCustomer({ email, passwordHash: "x", termsAcceptedAt: new Date() });
    await updateCustomerProfile(id, {
      firstName: "Ion",
      lastName: "Pop",
      phone: "+40711111111",
      addressStreet: "Str. Test 1",
    });
    const row = await findCustomerById(id);
    expect(row?.firstName).toBe("Ion");
    expect(row?.addressStreet).toBe("Str. Test 1");
    expect(row?.email).toBe(email);
    expect(row?.passwordHash).toBe("x");
  });

  it("round-trips, renews, deletes and sweeps sessions", async () => {
    const id = await createCustomer({
      email: testEmail("sessions"),
      passwordHash: "x",
      termsAcceptedAt: new Date(),
    });
    const future = new Date(Date.now() + 60_000);

    await createCustomerSession(`hash-a-${RUN}`, id, future);
    const found = await findCustomerSessionByTokenHash(`hash-a-${RUN}`);
    expect(found?.customer.id).toBe(id);
    expect(found?.expiresAt.getTime()).toBe(future.getTime());

    const later = new Date(Date.now() + 120_000);
    await renewCustomerSession(found!.id, later, new Date());
    expect((await findCustomerSessionByTokenHash(`hash-a-${RUN}`))?.expiresAt.getTime()).toBe(
      later.getTime(),
    );

    await deleteCustomerSessionByTokenHash(`hash-a-${RUN}`);
    expect(await findCustomerSessionByTokenHash(`hash-a-${RUN}`)).toBeNull();

    // expired rows disappear on sweep; live rows survive
    const past = new Date(Date.now() - 1000);
    await createCustomerSession(`hash-expired-${RUN}`, id, past);
    await createCustomerSession(`hash-live-${RUN}`, id, future);
    await sweepExpiredCustomerSessions(new Date());
    expect(await findCustomerSessionByTokenHash(`hash-expired-${RUN}`)).toBeNull();
    expect(await findCustomerSessionByTokenHash(`hash-live-${RUN}`)).not.toBeNull();
  });
});

describe.skipIf(skipDb)("orders ownership + guest-order linking (T03)", () => {
  it("stamps customer_id at insert when given, NULL when absent", async () => {
    const customerId = await createTestCustomer("stamp");
    const owned = await createTestOrder({ customerId });
    const guest = await createTestOrder({});

    const rows = await db
      .select({ id: orders.id, customerId: orders.customerId })
      .from(orders)
      .where(inArray(orders.id, [owned, guest]));
    expect(rows.find((r) => r.id === owned)?.customerId).toBe(customerId);
    expect(rows.find((r) => r.id === guest)?.customerId).toBeNull();
  });

  it("claims unclaimed guest orders by phone — first claim wins, second gets none", async () => {
    const phone = `+4073${String(Date.now()).slice(-7)}`;
    const a = await createTestOrder({ phone });
    const b = await createTestOrder({ phone });
    await createTestOrder({ phone: "+40799999999" }); // different phone — untouched

    const first = await createTestCustomer("claim1");
    expect(await claimGuestOrders(first, { phone })).toBe(2);

    const second = await createTestCustomer("claim2");
    expect(await claimGuestOrders(second, { phone })).toBe(0);

    const rows = await db
      .select({ id: orders.id, customerId: orders.customerId })
      .from(orders)
      .where(inArray(orders.id, [a, b]));
    expect(rows.every((r) => r.customerId === first)).toBe(true);
  });

  it("claims by lowercase email regardless of how the guest typed it", async () => {
    const email = testEmail("claimmail");
    const orderId = await createTestOrder({ email: email.toUpperCase() });
    const customerId = await createTestCustomer("claimer");

    expect(await claimGuestOrders(customerId, { emailLower: email })).toBe(1);
    const [row] = await db
      .select({ customerId: orders.customerId })
      .from(orders)
      .where(inArray(orders.id, [orderId]));
    expect(row.customerId).toBe(customerId);
  });

  it("claims nothing when no keys are provided", async () => {
    const customerId = await createTestCustomer("nokeys");
    expect(await claimGuestOrders(customerId, {})).toBe(0);
    expect(await claimGuestOrders(customerId, { phone: null, emailLower: null })).toBe(0);
  });

  it("lists ONLY the owner's orders, newest first, with item counts", async () => {
    const alice = await createTestCustomer("alice");
    const bob = await createTestCustomer("bob");
    const older = await createTestOrder({ customerId: alice });
    const newer = await createTestOrder({ customerId: alice, quantity: 2 });
    await createTestOrder({ customerId: bob });

    const list = await listOrdersForCustomer(alice, 20);
    expect(list.map((o) => o.id)).toEqual([newer, older]);
    expect(list[0].itemCount).toBe(1);
    expect(list[0].totalBani).toBeGreaterThan(0);
    expect(await listOrdersForCustomer(bob, 20)).toHaveLength(1);
  });

  it("detail answers for the owner and stays silent for everyone else", async () => {
    const owner = await createTestCustomer("owner");
    const other = await createTestCustomer("other");
    const orderId = await createTestOrder({ customerId: owner });

    const detail = await getOrderForCustomer(orderId, owner);
    expect(detail?.status).toBe("new");
    expect(detail?.mode).toBe("pickup");
    expect(detail?.totalBani).toBeGreaterThan(0);

    expect(await getOrderForCustomer(orderId, other)).toBeNull();
    expect(await getOrderForCustomer(99_999_999, owner)).toBeNull();
  });
});

describe.skipIf(skipDb)("customer auth service (T04)", () => {
  const PASSWORD = "parola-client-123";

  function requestWithCookie(token: string | null): Request {
    return new Request("http://localhost/api/account/test", {
      headers: token ? { cookie: `${CUSTOMER_SESSION_COOKIE_NAME}=${token}` } : {},
    });
  }

  it("registers, stores only a scrypt hash, auto-logs-in and links guest orders", async () => {
    const email = testEmail("register");
    const phone = `+4072${String(Date.now()).slice(-7)}`;
    const guestOrder = await createTestOrder({ phone });

    const result = await register({
      email,
      password: PASSWORD,
      firstName: "Ana",
      lastName: "Pop",
      phone,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.claimedOrders).toBe(1);
    expect(result.customer.email).toBe(email);
    expect(result.customer.hasPassword).toBe(true);
    expect(result.customer.hasGoogle).toBe(false);

    const row = await findCustomerByEmail(email);
    expect(row?.passwordHash).toMatch(/^scrypt:/);
    expect(row?.passwordHash).not.toContain(PASSWORD);
    expect(row?.termsAcceptedAt).toBeInstanceOf(Date);

    // auto-login: the returned token verifies without a separate login
    expect((await verifyCustomerSession(result.token))?.id).toBe(result.customer.id);
    // the guest order is now in the account's history (FR6)
    expect((await listOrdersForCustomer(result.customer.id, 20)).map((o) => o.id)).toEqual([guestOrder]);
  });

  it("refuses a duplicate email as email_taken, case-insensitively", async () => {
    const email = testEmail("dupauth");
    const base = { password: PASSWORD, firstName: "A", lastName: "B" };
    expect((await register({ email, ...base })).ok).toBe(true);
    // the boundary schema lowercases; the service arbiter is the unique index
    expect(await register({ email, ...base })).toEqual({ ok: false, error: "email_taken" });
  });

  it("logs in with correct credentials and refuses wrong/unknown/google-only generically", async () => {
    const email = testEmail("login");
    await register({ email, password: PASSWORD, firstName: "A", lastName: "B" });

    const ok = await loginCustomer(email, PASSWORD, null);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((await verifyCustomerSession(ok.token))?.email).toBe(email);

    expect(await loginCustomer(email, "gresita-parola", null)).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect(await loginCustomer(testEmail("ghost"), PASSWORD, null)).toEqual({
      ok: false,
      error: "invalid_credentials",
    });

    // Google-only account: no password to check — same generic refusal
    const googleOnly = testEmail("gonly");
    await createCustomer({ email: googleOnly, googleSub: `sub-login-${RUN}`, termsAcceptedAt: new Date() });
    expect(await loginCustomer(googleOnly, PASSWORD, null)).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
  });

  it("logout invalidates the session server-side (FR2)", async () => {
    const email = testEmail("logout");
    const result = await register({ email, password: PASSWORD, firstName: "A", lastName: "B" });
    if (!result.ok) throw new Error("register failed");

    await logoutCustomer(result.token);
    expect(await verifyCustomerSession(result.token)).toBeNull();
    // idempotent
    await logoutCustomer(result.token);
  });

  it("rolls the 30-day expiry on use (throttled) and drops expired sessions", async () => {
    const email = testEmail("rolling");
    const t0 = new Date();
    const result = await register({ email, password: PASSWORD, firstName: "A", lastName: "B" }, t0);
    if (!result.ok) throw new Error("register failed");
    expect(result.expiresAt.getTime()).toBe(t0.getTime() + CUSTOMER_SESSION_TTL_MS);

    // 2 minutes later (past the 60s throttle): verification extends the expiry
    const t1 = new Date(t0.getTime() + 2 * 60 * 1000);
    expect(await verifyCustomerSession(result.token, t1)).not.toBeNull();
    const renewed = await findCustomerSessionByTokenHash(hashToken(result.token));
    expect(renewed?.expiresAt.getTime()).toBe(t1.getTime() + CUSTOMER_SESSION_TTL_MS);

    // past the (renewed) expiry: gone, and the row is deleted
    const t2 = new Date(t1.getTime() + CUSTOMER_SESSION_TTL_MS + 1000);
    expect(await verifyCustomerSession(result.token, t2)).toBeNull();
    expect(await findCustomerSessionByTokenHash(hashToken(result.token))).toBeNull();
  });

  it("rate-limits login failures per ip+email (10/15min) and recovers on success elsewhere", async () => {
    resetCustomerLoginRateLimiter();
    const email = testEmail("ratelimit");
    await register({ email, password: PASSWORD, firstName: "A", lastName: "B" });

    for (let i = 0; i < 10; i += 1) {
      expect((await loginCustomer(email, "gresit", "1.2.3.4")).ok).toBe(false);
    }
    // 11th attempt: limited BEFORE touching the password — even the right one
    expect(await loginCustomer(email, PASSWORD, "1.2.3.4")).toEqual({
      ok: false,
      error: "too_many_attempts",
    });
    // a different IP is a different bucket
    expect((await loginCustomer(email, PASSWORD, "5.6.7.8")).ok).toBe(true);
    resetCustomerLoginRateLimiter();
  });

  it("requireCustomer guards routes by cookie", async () => {
    const email = testEmail("guard");
    const result = await register({ email, password: PASSWORD, firstName: "A", lastName: "B" });
    if (!result.ok) throw new Error("register failed");

    const granted = await requireCustomer(requestWithCookie(result.token));
    expect(granted.ok).toBe(true);
    if (granted.ok) expect(granted.customer.email).toBe(email);

    expect(await requireCustomer(requestWithCookie(null))).toEqual({
      ok: false,
      status: 401,
      error: "unauthenticated",
    });
    expect((await requireCustomer(requestWithCookie("token-inventat"))).ok).toBe(false);
  });
});

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-secret",
  APP_BASE_URL: "http://localhost:3000/",
};

function googleClaims(overrides: Partial<GoogleClaims> = {}): GoogleClaims {
  return {
    sub: `sub-${RUN}-${(seq += 1)}`,
    email: testEmail("google"),
    emailVerified: true,
    givenName: "Gigi",
    familyName: "Google",
    ...overrides,
  };
}

/** Hand-built JWT — signature is NOT verified by design (research D1 / OIDC §3.1.3.7). */
function fakeIdToken(payload: Record<string, unknown>): string {
  const encode = (part: unknown) => Buffer.from(JSON.stringify(part)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode(payload)}.fake-signature`;
}

describe("google module (T05, no network)", () => {
  it("reports configured only when all three env vars are present", () => {
    expect(isGoogleConfigured(GOOGLE_ENV)).toBe(true);
    expect(isGoogleConfigured({ ...GOOGLE_ENV, GOOGLE_CLIENT_SECRET: "" })).toBe(false);
    expect(isGoogleConfigured({})).toBe(false);
  });

  it("builds the auth URL with code flow, PKCE S256 and the derived redirect URI", () => {
    const url = new URL(
      buildGoogleAuthUrl({ state: "the-state", codeChallenge: "the-challenge" }, GOOGLE_ENV),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(GOOGLE_ENV.GOOGLE_CLIENT_ID);
    // trailing slash on APP_BASE_URL must not double up
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/account/google/callback");
    expect(googleRedirectUri(GOOGLE_ENV)).toBe("http://localhost:3000/api/account/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("the-state");
    expect(url.searchParams.get("code_challenge")).toBe("the-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  it("accepts a valid id_token and normalizes the claims", () => {
    const now = new Date();
    const claims = decodeAndValidateIdToken(
      fakeIdToken({
        iss: "https://accounts.google.com",
        aud: GOOGLE_ENV.GOOGLE_CLIENT_ID,
        exp: Math.floor(now.getTime() / 1000) + 300,
        sub: "sub-123",
        email: "Ana.Pop@Gmail.com",
        email_verified: true,
        given_name: "Ana",
      }),
      GOOGLE_ENV.GOOGLE_CLIENT_ID,
      now,
    );
    expect(claims).toEqual({
      sub: "sub-123",
      email: "ana.pop@gmail.com",
      emailVerified: true,
      givenName: "Ana",
      familyName: null,
    });
  });

  it("refuses malformed, mis-issued, mis-audienced and expired tokens with typed codes", () => {
    const now = new Date();
    const valid = {
      iss: "accounts.google.com",
      aud: GOOGLE_ENV.GOOGLE_CLIENT_ID,
      exp: Math.floor(now.getTime() / 1000) + 300,
      sub: "s",
      email: "a@b.co",
    };
    const codeOf = (fn: () => unknown): string | undefined => {
      try {
        fn();
        return undefined;
      } catch (error) {
        return error instanceof GoogleAuthError ? error.code : "not-a-google-error";
      }
    };

    expect(codeOf(() => decodeAndValidateIdToken("nu-e-jwt", "c", now))).toBe("bad_token");
    expect(
      codeOf(() =>
        decodeAndValidateIdToken(fakeIdToken({ ...valid, iss: "https://evil.example" }), valid.aud, now),
      ),
    ).toBe("wrong_issuer");
    expect(
      codeOf(() => decodeAndValidateIdToken(fakeIdToken({ ...valid, aud: "alt-client" }), valid.aud, now)),
    ).toBe("wrong_audience");
    expect(
      codeOf(() =>
        decodeAndValidateIdToken(
          fakeIdToken({ ...valid, exp: Math.floor(now.getTime() / 1000) - 10 }),
          valid.aud,
          now,
        ),
      ),
    ).toBe("expired");
    expect(
      codeOf(() => decodeAndValidateIdToken(fakeIdToken({ ...valid, email: undefined }), valid.aud, now)),
    ).toBe("missing_claims");
  });
});

describe.skipIf(skipDb)("loginWithGoogle resolution (T05)", () => {
  it("refuses an unverified email outright — nothing is created or linked", async () => {
    const claims = googleClaims({ emailVerified: false });
    expect(await loginWithGoogle(claims)).toEqual({ ok: false, error: "google_email_unverified" });
    expect(await findCustomerByEmail(claims.email)).toBeNull();
  });

  it("creates a Google-only account (terms stamped, guest orders claimed by email)", async () => {
    const claims = googleClaims();
    const guestOrder = await createTestOrder({ email: claims.email.toUpperCase() });

    const result = await loginWithGoogle(claims);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.claimedOrders).toBe(1);
    expect(result.customer.hasGoogle).toBe(true);
    expect(result.customer.hasPassword).toBe(false);
    expect(result.customer.firstName).toBe("Gigi");

    const row = await findCustomerByEmail(claims.email);
    expect(row?.googleSub).toBe(claims.sub);
    expect(row?.passwordHash).toBeNull();
    expect(row?.termsAcceptedAt).toBeInstanceOf(Date);

    expect((await verifyCustomerSession(result.token))?.id).toBe(result.customer.id);
    expect((await listOrdersForCustomer(result.customer.id, 20)).map((o) => o.id)).toEqual([guestOrder]);
  });

  it("logs into the SAME account on a second visit (sub match, nothing new created)", async () => {
    const claims = googleClaims();
    const first = await loginWithGoogle(claims);
    if (!first.ok) throw new Error("first google login failed");

    // even with a changed Google-side email, the sub wins and ours stays (v1: email immutable)
    const second = await loginWithGoogle({ ...claims, email: testEmail("changed") });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false);
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.customer.email).toBe(claims.email);
    expect(second.token).not.toBe(first.token);
  });

  it("links Google to an existing password account with the same verified email (D-e)", async () => {
    const email = testEmail("linkme");
    const password = await register({ email, password: "parola-clientului", firstName: "A", lastName: "B" });
    if (!password.ok) throw new Error("register failed");

    const result = await loginWithGoogle(googleClaims({ email }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);
    expect(result.customer.id).toBe(password.customer.id);
    expect(result.customer.hasPassword).toBe(true);
    expect(result.customer.hasGoogle).toBe(true);

    // both methods now reach the same account
    expect((await loginCustomer(email, "parola-clientului", null)).ok).toBe(true);
  });
});

describe.skipIf(skipDb)("customer-account service (T06)", () => {
  it("returns the profile view with a resolved zone slug", async () => {
    const [zone] = await db
      .select({ id: deliveryZones.id, slug: deliveryZones.slug })
      .from(deliveryZones)
      .limit(1);
    const customerId = await createTestCustomer("profview");
    await updateCustomerProfile(customerId, { firstName: "Vio", zoneId: zone.id });

    const view = await getProfile(customerId);
    expect(view?.firstName).toBe("Vio");
    expect(view?.zoneSlug).toBe(zone.slug);
    expect(view?.hasPassword).toBe(true);
    expect(view?.hasGoogle).toBe(false);
    expect(view).not.toHaveProperty("passwordHash");
  });

  it("patches profile fields, resolves zoneSlug and refuses an unknown one", async () => {
    const customerId = await createTestCustomer("patchsvc");
    const [zone] = await db.select({ slug: deliveryZones.slug }).from(deliveryZones).limit(1);

    const ok = await updateProfile(customerId, {
      firstName: "Dan",
      lastName: "Ionescu",
      addressStreet: "Str. Nouă 5",
      zoneSlug: zone.slug,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.customer.firstName).toBe("Dan");
      expect(ok.customer.zoneSlug).toBe(zone.slug);
      expect(ok.claimedOrders).toBe(0);
    }

    expect(await updateProfile(customerId, { zoneSlug: "zona-inventata" })).toEqual({
      ok: false,
      error: "unknown_zone",
    });

    // clearing works with null
    const cleared = await updateProfile(customerId, { zoneSlug: null, addressStreet: null });
    if (cleared.ok) {
      expect(cleared.customer.zoneSlug).toBeNull();
      expect(cleared.customer.addressStreet).toBeNull();
    } else {
      throw new Error("clear patch failed");
    }
  });

  it("re-runs the guest-order backfill when the phone is set or changed — not otherwise", async () => {
    const phone = `+4074${String(Date.now()).slice(-7)}`;
    const guestOrder = await createTestOrder({ phone });
    const customerId = await createTestCustomer("relink");

    // unrelated patch: no claim
    const unrelated = await updateProfile(customerId, { firstName: "Fără" });
    if (unrelated.ok) expect(unrelated.claimedOrders).toBe(0);

    // phone set: claims the guest order
    const withPhone = await updateProfile(customerId, { phone });
    expect(withPhone.ok).toBe(true);
    if (withPhone.ok) expect(withPhone.claimedOrders).toBe(1);
    expect((await listCustomerOrders(customerId)).map((o) => o.id)).toEqual([guestOrder]);

    // same phone again: nothing new to claim, no re-run
    const samePhone = await updateProfile(customerId, { phone });
    if (samePhone.ok) expect(samePhone.claimedOrders).toBe(0);
  });

  it("absorbs the first logged-in order into an EMPTY profile and links by its phone (D-h)", async () => {
    const phone = `+4075${String(Date.now()).slice(-7)}`;
    const olderGuestOrder = await createTestOrder({ phone });
    const customerId = await createTestCustomer("absorb");

    const result = await absorbOrderIntoEmptyProfile(customerId, {
      firstName: "Radu",
      lastName: "Marin",
      phone,
      addressStreet: "Str. Absorbției 9",
      zoneId: null,
    });
    expect(result.absorbed).toBe(true);
    expect(result.claimedOrders).toBe(1);

    const view = await getProfile(customerId);
    expect(view?.firstName).toBe("Radu");
    expect(view?.phone).toBe(phone);
    expect((await listCustomerOrders(customerId)).map((o) => o.id)).toEqual([olderGuestOrder]);
  });

  it("never overwrites a profile that has ANY contact field set", async () => {
    const customerId = await createTestCustomer("noabsorb");
    await updateCustomerProfile(customerId, { firstName: "Deja" });

    const result = await absorbOrderIntoEmptyProfile(customerId, {
      firstName: "Alt",
      lastName: "Nume",
      phone: "+40761234567",
      addressStreet: null,
      zoneId: null,
    });
    expect(result).toEqual({ absorbed: false, claimedOrders: 0 });
    expect((await getProfile(customerId))?.firstName).toBe("Deja");
    expect((await getProfile(customerId))?.phone).toBeNull();
  });

  it("shapes the order list and detail views per the contract, isolation included", async () => {
    const owner = await createTestCustomer("views");
    const stranger = await createTestCustomer("stranger");
    const orderId = await createTestOrder({ customerId: owner, quantity: 2 });

    const list = await listCustomerOrders(owner);
    expect(list).toHaveLength(1);
    expect(list[0].orderNumber).toBe(`#${orderId}`);
    expect(list[0].status).toBe("new");
    expect(list[0].itemCount).toBe(1);

    const detail = await getCustomerOrderDetail(owner, orderId);
    expect(detail?.orderNumber).toBe(`#${orderId}`);
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0].quantity).toBe(2);
    expect(detail?.items[0].options).toEqual([]);
    expect(detail?.paymentMethod).toBe("cash");
    expect(detail).not.toHaveProperty("clientIp");

    expect(await getCustomerOrderDetail(stranger, orderId)).toBeNull();
  });
});
