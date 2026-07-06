/**
 * GET /api/account/google/callback — completes the Google OIDC code flow
 * (contract: 005-conturi-clienti/06-contracts/api.md). ANY failure (state
 * mismatch, exchange error, invalid claims, unverified email, Google error
 * param) redirects to /cont?eroare=google with the transient cookie cleared —
 * nothing more specific leaks into the URL. Success sets the session cookie
 * and lands on /cont. No `next` parameter exists in v1 (no open-redirect
 * surface).
 */
import { GOOGLE_OAUTH_COOKIE_NAME } from "@/lib/account-schemas";
import { exchangeCode, GoogleAuthError } from "@/server/auth/google";
import { tokenFromRequest } from "@/server/auth/primitives";
import { customerSessionCookie, loginWithGoogle } from "@/server/services/customer-auth";

function clearedOauthCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GOOGLE_OAUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function redirectTo(request: Request, path: string, extraCookie?: string): Response {
  const headers = new Headers({ location: new URL(path, request.url).toString() });
  headers.append("set-cookie", clearedOauthCookie());
  if (extraCookie) headers.append("set-cookie", extraCookie);
  return new Response(null, { status: 302, headers });
}

function readHandshakeCookie(request: Request): { state: string; codeVerifier: string } | null {
  const raw = tokenFromRequest(request, GOOGLE_OAUTH_COOKIE_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      state?: unknown;
      codeVerifier?: unknown;
    };
    if (typeof parsed.state !== "string" || typeof parsed.codeVerifier !== "string") return null;
    return { state: parsed.state, codeVerifier: parsed.codeVerifier };
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const handshake = readHandshakeCookie(request);

    if (url.searchParams.get("error") || !code || !state || !handshake || state !== handshake.state) {
      console.log(`route=/api/account/google/callback status=handshake_failed durationMs=${Date.now() - startedAt}`);
      return redirectTo(request, "/cont?eroare=google");
    }

    let result;
    try {
      const claims = await exchangeCode({ code, codeVerifier: handshake.codeVerifier });
      result = await loginWithGoogle(claims);
    } catch (error) {
      if (error instanceof GoogleAuthError) {
        console.log(
          `route=/api/account/google/callback status=${error.code} durationMs=${Date.now() - startedAt}`,
        );
        return redirectTo(request, "/cont?eroare=google");
      }
      throw error;
    }

    if (!result.ok) {
      console.log(
        `route=/api/account/google/callback status=${result.error} durationMs=${Date.now() - startedAt}`,
      );
      return redirectTo(request, "/cont?eroare=google");
    }

    console.log(
      `route=/api/account/google/callback status=ok customer=${result.customer.id} created=${result.created} ` +
        `claimed=${result.claimedOrders} durationMs=${Date.now() - startedAt}`,
    );
    return redirectTo(request, "/cont", customerSessionCookie(result.token, result.expiresAt));
  } catch (error) {
    console.error(`route=/api/account/google/callback status=error durationMs=${Date.now() - startedAt}`, error);
    return redirectTo(request, "/cont?eroare=google");
  }
}
