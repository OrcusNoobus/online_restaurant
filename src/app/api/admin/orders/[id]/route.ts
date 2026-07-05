/** GET /api/admin/orders/:id — full detail with items, options, journal. */
import { idParamSchema } from "@/lib/admin-schemas";
import { getDetail } from "@/server/services/admin-orders";
import { requireStaff } from "@/server/services/auth";

export async function GET(request: Request, ctx: RouteContext<"/api/admin/orders/[id]">): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireStaff(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    const { id } = await ctx.params;
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) return Response.json({ error: "not_found" }, { status: 404 });

    const detail = await getDetail(parsed.data);
    if (!detail) return Response.json({ error: "not_found" }, { status: 404 });

    console.log(
      `route=/api/admin/orders/:id status=ok actor=${guard.user.id} entity=${parsed.data} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    return Response.json(detail);
  } catch (error) {
    console.error(`route=/api/admin/orders/:id status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
