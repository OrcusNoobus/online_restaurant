/** POST /api/account/register — contract: 005-conturi-clienti/06-contracts/api.md */
import { registerRequestSchema } from "@/lib/account-schemas";
import { getProfile } from "@/server/services/customer-account";
import { customerSessionCookie, register } from "@/server/services/customer-auth";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "validation", issues: [{ message: "invalid JSON body" }] }, { status: 400 });
    }

    const parsed = registerRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`route=/api/account/register status=invalid_shape durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await register({
      email: parsed.data.email,
      password: parsed.data.password,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone ?? null,
    });
    if (!result.ok) {
      console.log(`route=/api/account/register status=email_taken durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: result.error }, { status: 422 });
    }

    // customer id + claim count in the log, NEVER the email/password (Observability)
    console.log(
      `route=/api/account/register status=ok customer=${result.customer.id} claimed=${result.claimedOrders} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    const customer = await getProfile(result.customer.id);
    return Response.json(
      { customer },
      { status: 201, headers: { "set-cookie": customerSessionCookie(result.token, result.expiresAt) } },
    );
  } catch (error) {
    console.error(`route=/api/account/register status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
