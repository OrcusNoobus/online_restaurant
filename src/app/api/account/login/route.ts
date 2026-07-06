/** POST /api/account/login — contract: 005-conturi-clienti/06-contracts/api.md */
import { customerLoginRequestSchema } from "@/lib/account-schemas";
import { getProfile } from "@/server/services/customer-account";
import { customerSessionCookie, loginCustomer } from "@/server/services/customer-auth";

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

    const parsed = customerLoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`route=/api/account/login status=invalid_shape durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await loginCustomer(parsed.data.email, parsed.data.password, clientIpFrom(request));
    if (!result.ok) {
      console.log(`route=/api/account/login status=${result.error} durationMs=${Date.now() - startedAt}`);
      const status = result.error === "too_many_attempts" ? 429 : 401;
      return Response.json({ error: result.error }, { status });
    }

    console.log(
      `route=/api/account/login status=ok customer=${result.customer.id} durationMs=${Date.now() - startedAt}`,
    );
    const customer = await getProfile(result.customer.id);
    return Response.json(
      { customer },
      { status: 200, headers: { "set-cookie": customerSessionCookie(result.token, result.expiresAt) } },
    );
  } catch (error) {
    console.error(`route=/api/account/login status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
