/**
 * GET /api/account/google/start — begins the Google OIDC code flow
 * (contract: 005-conturi-clienti/06-contracts/api.md). Unconfigured → 503;
 * otherwise the state + PKCE verifier go into the transient httpOnly cookie
 * and the browser is sent to Google's consent screen.
 */
import { GOOGLE_OAUTH_COOKIE_NAME } from "@/lib/account-schemas";
import { buildGoogleAuthUrl, createOauthHandshake, isGoogleConfigured } from "@/server/auth/google";

export function GET(): Response {
  const startedAt = Date.now();
  try {
    if (!isGoogleConfigured()) {
      console.log(`route=/api/account/google/start status=google_not_configured durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "google_not_configured" }, { status: 503 });
    }

    const handshake = createOauthHandshake();
    const cookieValue = Buffer.from(
      JSON.stringify({ state: handshake.state, codeVerifier: handshake.codeVerifier }),
    ).toString("base64url");
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

    console.log(`route=/api/account/google/start status=redirect durationMs=${Date.now() - startedAt}`);
    return new Response(null, {
      status: 302,
      headers: {
        location: buildGoogleAuthUrl(handshake),
        "set-cookie": `${GOOGLE_OAUTH_COOKIE_NAME}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
      },
    });
  } catch (error) {
    console.error(`route=/api/account/google/start status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
