/** POST /api/orders — contract: harness/specs/002-cos-comanda/06-contracts/api.md */
import { orderRequestSchema } from "@/lib/order-schemas";
import { placeOrder } from "@/server/services/orders";

/** First hop of x-forwarded-for, or null — never trusted from the body (Q14). */
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

    const parsed = orderRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`route=/api/orders status=invalid_shape durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await placeOrder(parsed.data, { clientIp: clientIpFrom(request) });
    if (!result.ok) {
      const codes = [...new Set(result.reasons.map(({ code }) => code))].join(",");
      console.log(`route=/api/orders status=${result.error} reasons=${codes} durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: result.error, reasons: result.reasons }, { status: 422 });
    }

    const { order } = result;
    console.log(
      `route=/api/orders status=created orderId=${order.orderId} mode=${order.mode} ` +
        `totalBani=${order.totalBani} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json(order, { status: 201 });
  } catch (error) {
    console.error(`route=/api/orders status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
