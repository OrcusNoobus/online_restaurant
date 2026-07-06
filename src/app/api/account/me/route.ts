/**
 * GET /api/account/me — contract: 005-conturi-clienti/06-contracts/api.md.
 * The checkout prefill source: 401 means guest, and the checkout does NOTHING
 * (FR3); verifyCustomerSession applies the rolling renewal as a side effect.
 */
import { getProfile } from "@/server/services/customer-account";
import { requireCustomer } from "@/server/services/customer-auth";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireCustomer(request);
    if (!guard.ok) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }
    const customer = await getProfile(guard.customer.id);
    console.log(
      `route=/api/account/me status=ok customer=${guard.customer.id} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ customer });
  } catch (error) {
    console.error(`route=/api/account/me status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
