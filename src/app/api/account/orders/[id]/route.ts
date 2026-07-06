/**
 * GET /api/account/orders/:id — own-order detail. Unknown ids and other
 * customers' orders BOTH answer 404 — ownership is not leaked
 * (contract: 005-conturi-clienti/06-contracts/api.md).
 */
import { idParamSchema } from "@/lib/admin-schemas";
import { getCustomerOrderDetail } from "@/server/services/customer-account";
import { requireCustomer } from "@/server/services/customer-auth";

export async function GET(request: Request, ctx: RouteContext<"/api/account/orders/[id]">): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireCustomer(request);
    if (!guard.ok) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await ctx.params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) return Response.json({ error: "not_found" }, { status: 404 });

    const order = await getCustomerOrderDetail(guard.customer.id, parsed.data);
    if (!order) return Response.json({ error: "not_found" }, { status: 404 });

    console.log(
      `route=/api/account/orders/:id status=ok customer=${guard.customer.id} entity=${parsed.data} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ order });
  } catch (error) {
    console.error(`route=/api/account/orders/:id status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
