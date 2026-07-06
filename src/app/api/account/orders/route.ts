/**
 * GET /api/account/orders — own orders only, newest first, LIMIT 20
 * (contract: 005-conturi-clienti/06-contracts/api.md). The account page polls
 * this every 15s; identity comes exclusively from the session cookie (FR5).
 */
import { listCustomerOrders } from "@/server/services/customer-account";
import { requireCustomer } from "@/server/services/customer-auth";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireCustomer(request);
    if (!guard.ok) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }
    const orders = await listCustomerOrders(guard.customer.id);
    console.log(
      `route=/api/account/orders status=ok customer=${guard.customer.id} count=${orders.length} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ orders });
  } catch (error) {
    console.error(`route=/api/account/orders status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
