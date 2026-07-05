/** POST /api/admin/orders/:id/transition — contract: 003 06-contracts Orders. */
import { idParamSchema, transitionRequestSchema } from "@/lib/admin-schemas";
import { transition, type TransitionResult } from "@/server/services/admin-orders";
import { requireStaff } from "@/server/services/auth";

/** Route files may export only HTTP methods — keep this private (undo/route.ts mirrors it). */
function shapeTransitionFailure(result: Exclude<TransitionResult, { ok: true }>): Response {
  if (result.error === "not_found") return Response.json({ error: "not_found" }, { status: 404 });
  if (result.error === "stale_state") {
    return Response.json({ error: "stale_state", currentStatus: result.currentStatus }, { status: 409 });
  }
  return Response.json({ error: result.error }, { status: 422 });
}

export async function POST(request: Request, ctx: RouteContext<"/api/admin/orders/[id]/transition">): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireStaff(request);
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
    const parsed = transitionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await transition(parsedId.data, parsed.data, guard.user.id);
    const outcome = result.ok ? `ok to=${parsed.data.to}` : result.error;
    console.log(
      `route=/api/admin/orders/:id/transition status=${outcome} actor=${guard.user.id} ` +
        `entity=${parsedId.data} durationMs=${Date.now() - startedAt}`,
    );
    if (!result.ok) return shapeTransitionFailure(result);
    return Response.json(result.detail);
  } catch (error) {
    console.error(
      `route=/api/admin/orders/:id/transition status=error durationMs=${Date.now() - startedAt}`,
      error,
    );
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
