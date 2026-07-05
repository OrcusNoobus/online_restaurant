/** POST /api/admin/auth/login — contract: 003-panou-admin/06-contracts/api.md */
import { loginRequestSchema } from "@/lib/admin-schemas";
import { login, sessionCookie } from "@/server/services/auth";

/** First hop of x-forwarded-for, or null — feeds the per-IP rate limiter. */
function clientIpFrom(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "validation", issues: [{ message: "invalid JSON body" }] }, { status: 400 });
    }

    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`route=/api/admin/auth/login status=invalid_shape durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await login(parsed.data.username, parsed.data.password, clientIpFrom(request));
    if (!result.ok) {
      // username in the log, NEVER the password (contract, Observability)
      console.log(
        `route=/api/admin/auth/login status=${result.error} username=${parsed.data.username.toLowerCase()} ` +
          `durationMs=${Date.now() - startedAt}`,
      );
      const status = result.error === "too_many_attempts" ? 429 : 401;
      return Response.json({ error: result.error }, { status });
    }

    console.log(
      `route=/api/admin/auth/login status=ok actor=${result.user.id} role=${result.user.role} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    return Response.json(
      { user: result.user },
      { status: 200, headers: { "set-cookie": sessionCookie(result.token, result.expiresAt) } },
    );
  } catch (error) {
    console.error(`route=/api/admin/auth/login status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
