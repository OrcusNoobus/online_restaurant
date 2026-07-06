/** POST /api/account/logout — contract: 005-conturi-clienti/06-contracts/api.md. Idempotent. */
import {
  clearedCustomerSessionCookie,
  customerSessionTokenFromRequest,
  logoutCustomer,
} from "@/server/services/customer-auth";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const token = customerSessionTokenFromRequest(request);
    if (token) await logoutCustomer(token);
    console.log(`route=/api/account/logout status=ok durationMs=${Date.now() - startedAt}`);
    return new Response(null, { status: 204, headers: { "set-cookie": clearedCustomerSessionCookie() } });
  } catch (error) {
    console.error(`route=/api/account/logout status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
