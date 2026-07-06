/**
 * POST /api/orders — contract: harness/specs/002-cos-comanda/06-contracts/api.md.
 * feat-010 addition (005 06-contracts "Changed"): a valid customer session
 * stamps the order's customer_id and fills MISSING profile fields (D-h); an
 * absent/invalid cookie is byte-identical to the guest behavior (FR3).
 */
import { orderRequestSchema } from "@/lib/order-schemas";
import { absorbOrderIntoProfile } from "@/server/services/customer-account";
import { customerSessionTokenFromRequest, verifyCustomerSession } from "@/server/services/customer-auth";
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

    // session-derived only; an invalid/absent cookie means guest, never an error (FR3)
    const sessionToken = customerSessionTokenFromRequest(request);
    const customer = sessionToken ? await verifyCustomerSession(sessionToken) : null;

    const result = await placeOrder(parsed.data, {
      clientIp: clientIpFrom(request),
      customerId: customer?.id ?? null,
    });
    if (!result.ok) {
      const codes = [...new Set(result.reasons.map(({ code }) => code))].join(",");
      console.log(`route=/api/orders status=${result.error} reasons=${codes} durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: result.error, reasons: result.reasons }, { status: 422 });
    }

    const { order } = result;
    if (customer) {
      const absorbed = await absorbOrderIntoProfile(customer.id, {
        firstName: parsed.data.customer.firstName,
        lastName: parsed.data.customer.lastName,
        phone: parsed.data.customer.phone,
        addressStreet: parsed.data.addressStreet ?? null,
        zoneSlug: parsed.data.zoneSlug ?? null,
      });
      console.log(
        `route=/api/orders customer=${customer.id} absorbed=${absorbed.absorbed} ` +
          `claimed=${absorbed.claimedOrders}`,
      );
    }
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
