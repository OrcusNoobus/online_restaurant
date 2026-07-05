/** POST /api/admin/orders/:id/undo — one step back, empty body (003 06-contracts). */
import { idParamSchema } from "@/lib/admin-schemas";
import { type TransitionResult, undo } from "@/server/services/admin-orders";
import { requireStaff } from "@/server/services/auth";

/** Mirrors transition/route.ts — route files may export only HTTP methods. */
function shapeTransitionFailure(result: Exclude<TransitionResult, { ok: true }>): Response {
  if (result.error === "not_found") return Response.json({ error: "not_found" }, { status: 404 });
  if (result.error === "stale_state") {
    return Response.json({ error: "stale_state", currentStatus: result.currentStatus }, { status: 409 });
  }
  return Response.json({ error: result.error }, { status: 422 });
}

export async function POST(request: Request, ctx: RouteContext<"/api/admin/orders/[id]/undo">): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireStaff(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    const { id } = await ctx.params;
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) return Response.json({ error: "not_found" }, { status: 404 });

    const result = await undo(parsedId.data, guard.user.id);
    console.log(
      `route=/api/admin/orders/:id/undo status=${result.ok ? "ok" : result.error} actor=${guard.user.id} ` +
        `entity=${parsedId.data} durationMs=${Date.now() - startedAt}`,
    );
    if (!result.ok) return shapeTransitionFailure(result);
    return Response.json(result.detail);
  } catch (error) {
    console.error(`route=/api/admin/orders/:id/undo status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
