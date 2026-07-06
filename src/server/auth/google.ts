/**
 * Google OIDC — hand-rolled authorization-code flow + PKCE, zero dependencies
 * (005-conturi-clienti research D1). Endpoints are pinned constants: Google's
 * OIDC endpoints have been stable for a decade and a runtime discovery fetch
 * only adds a failure mode. The id_token is accepted WITHOUT local JWKS
 * signature verification because it arrives directly from Google's token
 * endpoint over TLS (OIDC Core §3.1.3.7); iss/aud/exp are still validated
 * here, email_verified is returned as data and enforced by the customer-auth
 * service. No refresh tokens are requested or stored — Google authenticates,
 * then is never called again. Env is injectable (anthropic-adapter pattern)
 * so tests never touch process.env.
 */
import { createHash, randomBytes } from "node:crypto";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const VALID_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
export const GOOGLE_CALLBACK_PATH = "/api/account/google/callback";

export interface GoogleEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_BASE_URL?: string;
}

// ProcessEnv is an index signature with no declared keys — structurally
// disjoint from GoogleEnv, hence the one-time cast.
const processEnv = process.env as GoogleEnv;

/** Absent config = the button does not exist and google/start answers 503 (D8). */
export function isGoogleConfigured(env: GoogleEnv = processEnv): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.APP_BASE_URL);
}

export function googleRedirectUri(env: GoogleEnv = processEnv): string {
  const base = (env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}${GOOGLE_CALLBACK_PATH}`;
}

export class GoogleAuthError extends Error {
  constructor(
    readonly code:
      | "not_configured"
      | "exchange_failed"
      | "bad_token"
      | "wrong_issuer"
      | "wrong_audience"
      | "expired"
      | "missing_claims",
    message?: string,
    options?: { cause?: unknown },
  ) {
    super(message ?? code, options);
    this.name = "GoogleAuthError";
  }
}

export interface OauthHandshake {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

/** state (CSRF) + PKCE verifier/challenge — both live in the transient cookie. */
export function createOauthHandshake(): OauthHandshake {
  const state = randomBytes(16).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { state, codeVerifier, codeChallenge };
}

export function buildGoogleAuthUrl(
  handshake: Pick<OauthHandshake, "state" | "codeChallenge">,
  env: GoogleEnv = processEnv,
): string {
  if (!isGoogleConfigured(env)) throw new GoogleAuthError("not_configured");
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleRedirectUri(env));
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", handshake.state);
  url.searchParams.set("code_challenge", handshake.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/** Contract shape (006-contracts) — nothing Google-wire-shaped leaves this module. */
export interface GoogleClaims {
  sub: string;
  /** Lowercased here — it feeds the customers.email identifier. */
  email: string;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

/**
 * Decode + validate an id_token payload (no signature check — see module
 * header). Exported separately so tests cover every refusal deterministically
 * with hand-built JWTs.
 */
export function decodeAndValidateIdToken(
  idToken: string,
  clientId: string,
  now: Date = new Date(),
): GoogleClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleAuthError("bad_token");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new GoogleAuthError("bad_token", undefined, { cause: error });
  }

  if (typeof payload.iss !== "string" || !VALID_ISSUERS.includes(payload.iss)) {
    throw new GoogleAuthError("wrong_issuer", String(payload.iss));
  }
  if (payload.aud !== clientId) throw new GoogleAuthError("wrong_audience");
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now.getTime()) {
    throw new GoogleAuthError("expired");
  }
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new GoogleAuthError("missing_claims");
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    givenName: typeof payload.given_name === "string" ? payload.given_name : null,
    familyName: typeof payload.family_name === "string" ? payload.family_name : null,
  };
}

/** The ONLY Google test seam: the callback route passes this to the service, tests pass a script. */
export type GoogleCodeExchange = (params: { code: string; codeVerifier: string }) => Promise<GoogleClaims>;

/** code → tokens at Google's token endpoint (server-to-server, TLS). */
export async function exchangeCode(
  params: { code: string; codeVerifier: string },
  env: GoogleEnv = processEnv,
): Promise<GoogleClaims> {
  if (!isGoogleConfigured(env)) throw new GoogleAuthError("not_configured");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      code_verifier: params.codeVerifier,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(env),
    }),
  });

  if (!response.ok) {
    throw new GoogleAuthError("exchange_failed", `token endpoint answered ${response.status}`);
  }
  const body = (await response.json()) as { id_token?: string };
  if (!body.id_token) throw new GoogleAuthError("bad_token", "no id_token in response");

  return decodeAndValidateIdToken(body.id_token, env.GOOGLE_CLIENT_ID!);
}
