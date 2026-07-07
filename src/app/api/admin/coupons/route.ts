/**
 * GET/POST /api/admin/coupons — admin only (006 Q4; role rule at the HTTP
 * boundary, feat-007 Q14). The list includes inactive/expired coupons;
 * retirement is PATCH {active:false}, never delete.
 */
import { couponCreateSchema } from "@/lib/admin-schemas";
import { adminCreateCoupon, adminListCoupons } from "@/server/services/admin-coupons";
import { requireAdmin } from "@/server/services/auth";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    const coupons = await adminListCoupons();
    console.log(
      `route=/api/admin/coupons status=ok actor=${guard.user.id} coupons=${coupons.length} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ coupons });
  } catch (error) {
    console.error(`route=/api/admin/coupons status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "validation", issues: [{ message: "invalid JSON body" }] }, { status: 400 });
    }
    const parsed = couponCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await adminCreateCoupon(parsed.data);
    console.log(
      `route=/api/admin/coupons status=${result.ok ? "created" : result.error} actor=${guard.user.id} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
    return Response.json({ coupon: result.coupon }, { status: 201 });
  } catch (error) {
    console.error(`route=/api/admin/coupons status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
