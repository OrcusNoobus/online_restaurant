/**
 * GET/POST /api/admin/zones — admin only (Q14). The list includes inactive
 * zones (public GET /api/zones stays active-only); zones referenced by past
 * orders are protected by RESTRICT — deactivate, never delete.
 */
import { zoneCreateSchema } from "@/lib/admin-schemas";
import { addZone, getZones } from "@/server/services/admin-catalog";
import { requireAdmin } from "@/server/services/auth";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    const zones = await getZones();
    console.log(
      `route=/api/admin/zones status=ok actor=${guard.user.id} zones=${zones.length} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ zones });
  } catch (error) {
    console.error(`route=/api/admin/zones status=error durationMs=${Date.now() - startedAt}`, error);
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
    const parsed = zoneCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await addZone(parsed.data);
    console.log(
      `route=/api/admin/zones status=${result.ok ? "created" : result.error} actor=${guard.user.id} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
    return Response.json({ zone: result.zone }, { status: 201 });
  } catch (error) {
    console.error(`route=/api/admin/zones status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
