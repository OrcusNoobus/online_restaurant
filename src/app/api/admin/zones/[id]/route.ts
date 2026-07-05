/** PATCH /api/admin/zones/:id — admin only; fees/thresholds apply from the next quote. */
import { idParamSchema, zonePatchSchema } from "@/lib/admin-schemas";
import { updateZone } from "@/server/services/admin-catalog";
import { requireAdmin } from "@/server/services/auth";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/zones/[id]">): Promise<Response> {
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
    const parsed = zonePatchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await updateZone(parsedId.data, parsed.data);
    if (!result.ok) return Response.json({ error: "not_found" }, { status: 404 });

    console.log(
      `route=/api/admin/zones/:id status=ok actor=${guard.user.id} entity=${parsedId.data} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ zone: result.entity });
  } catch (error) {
    console.error(`route=/api/admin/zones/:id status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
