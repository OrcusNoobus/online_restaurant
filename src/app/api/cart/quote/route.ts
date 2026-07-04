/** POST /api/cart/quote — contract: harness/specs/002-cos-comanda/06-contracts/api.md */
import { quoteRequestSchema } from "@/lib/order-schemas";
import { quoteCart } from "@/server/services/pricing";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "validation", issues: [{ message: "invalid JSON body" }] }, { status: 400 });
    }

    const parsed = quoteRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`route=/api/cart/quote status=invalid_shape durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await quoteCart(parsed.data);
    if (!result.ok) {
      const codes = [...new Set(result.reasons.map(({ code }) => code))].join(",");
      console.log(`route=/api/cart/quote status=invalid_cart reasons=${codes} durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "invalid_cart", reasons: result.reasons }, { status: 422 });
    }

    // the resolved zone row is service-internal (placeOrder uses it) — not part of this contract
    const { items, subtotalBani, sgrBani, deliveryFeeBani, freeDeliveryGapBani, totalBani } = result.quote;
    console.log(
      `route=/api/cart/quote status=ok mode=${parsed.data.mode} items=${items.length} ` +
        `totalBani=${totalBani} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ items, subtotalBani, sgrBani, deliveryFeeBani, freeDeliveryGapBani, totalBani });
  } catch (error) {
    console.error(`route=/api/cart/quote status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
