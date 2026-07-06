/**
 * Route-layer tests for feat-010 /api/account/* (status codes, cookies,
 * redirects). Separate file because vi.mock of the google module is
 * file-global (008 T07 lesson) — the service-layer suite in accounts.test.ts
 * uses the REAL module. Needs the dev Postgres; self-migrates and seeds.
 */
import { execSync } from "node:child_process";

import { like } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getGoogleCallbackRoute } from "@/app/api/account/google/callback/route";
import { GET as getGoogleStartRoute } from "@/app/api/account/google/start/route";
import { POST as postLoginRoute } from "@/app/api/account/login/route";
import { POST as postLogoutRoute } from "@/app/api/account/logout/route";
import { GET as getMeRoute } from "@/app/api/account/me/route";
import { GET as getOrderDetailRoute } from "@/app/api/account/orders/[id]/route";
import { GET as getOrdersRoute } from "@/app/api/account/orders/route";
import { PATCH as patchProfileRoute } from "@/app/api/account/profile/route";
import { POST as postRegisterRoute } from "@/app/api/account/register/route";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  type CustomerView,
  GOOGLE_OAUTH_COOKIE_NAME,
} from "@/lib/account-schemas";
import type { GoogleClaims } from "@/server/auth/google";
import { db } from "@/server/db/client";
import { customers } from "@/server/db/schema";

// Controllable google-module behavior; everything not overridden stays real.
const googleMock = {
  configured: true,
  claims: null as GoogleClaims | null,
  failExchange: false,
};

vi.mock("@/server/auth/google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/google")>();
  return {
    ...actual,
    isGoogleConfigured: () => googleMock.configured,
    buildGoogleAuthUrl: (handshake: { state: string; codeChallenge: string }) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${handshake.state}&code_challenge=${handshake.codeChallenge}`,
    exchangeCode: async () => {
      if (googleMock.failExchange) throw new actual.GoogleAuthError("exchange_failed");
      if (!googleMock.claims) throw new Error("test forgot to script claims");
      return googleMock.claims;
    },
  };
});

const skipDb = process.env.SKIP_DB === "1";

const RUN = `${process.pid}-${Date.now()}`;
let seq = 0;
function testEmail(tag: string): string {
  seq += 1;
  return `test-accroute-${tag}-${RUN}-${seq}@example.com`;
}

beforeAll(() => {
  if (skipDb) return;
  execSync("npm run db:migrate", { stdio: "pipe" });
  execSync("npm run db:seed", { stdio: "pipe" });
}, 120_000);

afterAll(async () => {
  if (skipDb) return;
  await db.delete(customers).where(like(customers.email, "test-accroute-%"));
});

beforeEach(() => {
  googleMock.configured = true;
  googleMock.claims = null;
  googleMock.failExchange = false;
});

function jsonRequest(path: string, body: unknown, cookie?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, cookie?: string): Request {
  return new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });
}

function sessionCookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${CUSTOMER_SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) throw new Error(`no session cookie in: ${header}`);
  return `${CUSTOMER_SESSION_COOKIE_NAME}=${match[1]}`;
}

async function registerVia(routeEmail: string): Promise<{ cookie: string; customer: CustomerView }> {
  const response = await postRegisterRoute(
    jsonRequest("/api/account/register", {
      email: routeEmail,
      password: "parola-ruta-123",
      firstName: "Ruta",
      lastName: "Test",
      termsAccepted: true,
    }),
  );
  if (response.status !== 201) throw new Error(`register route answered ${response.status}`);
  const body = (await response.json()) as { customer: CustomerView };
  return { cookie: sessionCookieFrom(response), customer: body.customer };
}

describe.skipIf(skipDb)("account auth routes (T07)", () => {
  it("register: 201 + httpOnly session cookie + CustomerView; 422 on duplicate; 400 on bad shape", async () => {
    const email = testEmail("reg");
    const response = await postRegisterRoute(
      jsonRequest("/api/account/register", {
        email,
        password: "parola-ruta-123",
        firstName: "Ana",
        lastName: "Pop",
        phone: "0712345678",
        termsAccepted: true,
      }),
    );
    expect(response.status).toBe(201);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${CUSTOMER_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    const body = (await response.json()) as { customer: CustomerView };
    expect(body.customer.email).toBe(email);
    expect(body.customer.phone).toBe("+40712345678");
    expect(body.customer).not.toHaveProperty("passwordHash");

    const duplicate = await postRegisterRoute(
      jsonRequest("/api/account/register", {
        email: email.toUpperCase(),
        password: "alta-parola-123",
        firstName: "A",
        lastName: "B",
        termsAccepted: true,
      }),
    );
    expect(duplicate.status).toBe(422);
    expect(await duplicate.json()).toEqual({ error: "email_taken" });

    const invalid = await postRegisterRoute(
      jsonRequest("/api/account/register", { email, password: "scurt", termsAccepted: true }),
    );
    expect(invalid.status).toBe(400);
  });

  it("login: 200 + fresh cookie for good credentials, 401 for bad", async () => {
    const email = testEmail("login");
    await registerVia(email);

    const ok = await postLoginRoute(
      jsonRequest("/api/account/login", { email, password: "parola-ruta-123" }),
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain(`${CUSTOMER_SESSION_COOKIE_NAME}=`);

    const bad = await postLoginRoute(jsonRequest("/api/account/login", { email, password: "gresita-99" }));
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: "invalid_credentials" });
  });

  it("me: 200 with the profile when authenticated, 401 otherwise; logout invalidates", async () => {
    const email = testEmail("me");
    const { cookie } = await registerVia(email);

    const me = await getMeRoute(getRequest("/api/account/me", cookie));
    expect(me.status).toBe(200);
    expect(((await me.json()) as { customer: CustomerView }).customer.email).toBe(email);

    expect((await getMeRoute(getRequest("/api/account/me"))).status).toBe(401);

    const logout = await postLogoutRoute(getRequest("/api/account/logout", cookie));
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await getMeRoute(getRequest("/api/account/me", cookie))).status).toBe(401);
  });

  it("profile PATCH: 200 applies, 422 unknown zone, 400 empty patch, 401 anonymous", async () => {
    const { cookie } = await registerVia(testEmail("patch"));

    const ok = await patchProfileRoute(
      new Request("http://localhost/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ addressStreet: "Str. Rutei 3" }),
      }),
    );
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { customer: CustomerView }).customer.addressStreet).toBe("Str. Rutei 3");

    const unknownZone = await patchProfileRoute(
      new Request("http://localhost/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ zoneSlug: "nu-exista" }),
      }),
    );
    expect(unknownZone.status).toBe(422);

    const empty = await patchProfileRoute(
      new Request("http://localhost/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({}),
      }),
    );
    expect(empty.status).toBe(400);

    const anonymous = await patchProfileRoute(
      new Request("http://localhost/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: "X" }),
      }),
    );
    expect(anonymous.status).toBe(401);
  });

  it("orders list + detail: 401 anonymous, empty list, 404 for unknown/foreign/malformed ids", async () => {
    const { cookie } = await registerVia(testEmail("orders"));

    expect((await getOrdersRoute(getRequest("/api/account/orders"))).status).toBe(401);

    const list = await getOrdersRoute(getRequest("/api/account/orders", cookie));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ orders: [] });

    const unknown = await getOrderDetailRoute(getRequest("/api/account/orders/99999999", cookie), {
      params: Promise.resolve({ id: "99999999" }),
    });
    expect(unknown.status).toBe(404);

    const malformed = await getOrderDetailRoute(getRequest("/api/account/orders/abc", cookie), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(malformed.status).toBe(404);
  });
});

describe.skipIf(skipDb)("google routes (T07)", () => {
  it("start: 503 when unconfigured; 302 to Google with the transient cookie when configured", async () => {
    googleMock.configured = false;
    const unavailable = getGoogleStartRoute();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: "google_not_configured" });

    googleMock.configured = true;
    const redirect = getGoogleStartRoute();
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toContain("https://accounts.google.com/");
    const cookie = redirect.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${GOOGLE_OAUTH_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Max-Age=600");
  });

  function oauthCookie(state: string, codeVerifier = "the-verifier"): string {
    const value = Buffer.from(JSON.stringify({ state, codeVerifier })).toString("base64url");
    return `${GOOGLE_OAUTH_COOKIE_NAME}=${value}`;
  }

  it("callback: happy path creates the session and lands on /cont with the transient cookie cleared", async () => {
    const email = testEmail("gcb");
    googleMock.claims = {
      sub: `sub-route-${RUN}`,
      email,
      emailVerified: true,
      givenName: "G",
      familyName: "C",
    };

    const response = await getGoogleCallbackRoute(
      getRequest("/api/account/google/callback?code=the-code&state=the-state", oauthCookie("the-state")),
    );
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/cont");
    const cookies = response.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith(`${GOOGLE_OAUTH_COOKIE_NAME}=;`))).toBe(true);
    const session = cookies.find((c) => c.startsWith(`${CUSTOMER_SESSION_COOKIE_NAME}=`));
    expect(session).toBeDefined();

    // the session actually works
    const me = await getMeRoute(getRequest("/api/account/me", session!.split(";")[0]));
    expect(me.status).toBe(200);
  });

  it("callback: state mismatch, missing cookie, Google error param and exchange failure all land on /cont?eroare=google", async () => {
    googleMock.claims = {
      sub: "s",
      email: testEmail("gfail"),
      emailVerified: true,
      givenName: null,
      familyName: null,
    };

    const cases = [
      getRequest("/api/account/google/callback?code=c&state=WRONG", oauthCookie("the-state")),
      getRequest("/api/account/google/callback?code=c&state=s"),
      getRequest("/api/account/google/callback?error=access_denied&code=c&state=the-state", oauthCookie("the-state")),
    ];
    for (const request of cases) {
      const response = await getGoogleCallbackRoute(request);
      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname + "?" + location.searchParams.toString()).toBe("/cont?eroare=google");
      expect(response.headers.getSetCookie().some((c) => c.includes(CUSTOMER_SESSION_COOKIE_NAME))).toBe(false);
    }

    googleMock.failExchange = true;
    const failed = await getGoogleCallbackRoute(
      getRequest("/api/account/google/callback?code=c&state=the-state", oauthCookie("the-state")),
    );
    expect(new URL(failed.headers.get("location")!).search).toBe("?eroare=google");
  });

  it("callback: an unverified Google email is refused with the same generic redirect", async () => {
    googleMock.claims = {
      sub: `sub-unv-${RUN}`,
      email: testEmail("gunv"),
      emailVerified: false,
      givenName: null,
      familyName: null,
    };
    const response = await getGoogleCallbackRoute(
      getRequest("/api/account/google/callback?code=c&state=the-state", oauthCookie("the-state")),
    );
    expect(new URL(response.headers.get("location")!).search).toBe("?eroare=google");
    // and no account was created
    const rows = await db.select({ id: customers.id }).from(customers).where(like(customers.email, "test-accroute-gunv-%"));
    expect(rows).toHaveLength(0);
  });
});
