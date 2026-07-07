/**
 * PATCH /api/admin/coupons/:id — admin only. The RESULTING row is
 * re-validated as a whole (006 06-contracts); existing orders keep their
 * snapshots regardless of edits.
 */
import { couponPatchSchema, idParamSchema } from "@/lib/admin-schemas";
import { adminPatchCoupon } from "@/server/services/admin-coupons";
import { requireAdmin } from "@/server/services/auth";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/coupons/[id]">): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    const { id } = await ctx.params;
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) return Response.json({ error: "not_found" }, { status: 404 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "validation", issues: [{ message: "invalid JSON body" }] }, { status: 400 });
    }
    const parsed = couponPatchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await adminPatchCoupon(parsedId.data, parsed.data);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 422;
      return Response.json({ error: result.error }, { status });
    }

    console.log(
      `route=/api/admin/coupons/:id status=ok actor=${guard.user.id} entity=${parsedId.data} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ coupon: result.coupon });
  } catch (error) {
    console.error(`route=/api/admin/coupons/:id status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
