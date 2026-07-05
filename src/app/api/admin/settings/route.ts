/** GET/PUT /api/admin/settings — admin only (Q14). Contract: 003 06-contracts Settings. */
import { settingsUpdateSchema } from "@/lib/admin-schemas";
import type { RestaurantSettingsRow } from "@/server/repositories/settings";
import { requireAdmin } from "@/server/services/auth";
import { getSettings, updateSettings } from "@/server/services/settings";

function shapeSettings(row: RestaurantSettingsRow) {
  return {
    settings: {
      openMinutes: row.openMinutes,
      closeMinutes: row.closeMinutes,
      earliestFulfillmentMinutes: row.earliestFulfillmentMinutes,
      deliveryEstimateMinutes: row.deliveryEstimateMinutes,
      pickupEstimateOptionsMinutes: row.pickupEstimateOptionsMinutes,
      catalogProtectedSince: row.catalogProtectedSince ? row.catalogProtectedSince.toISOString() : null,
      zonesProtectedSince: row.zonesProtectedSince ? row.zonesProtectedSince.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    const settings = await getSettings();
    console.log(`route=/api/admin/settings status=ok actor=${guard.user.id} durationMs=${Date.now() - startedAt}`);
    return Response.json(shapeSettings(settings));
  } catch (error) {
    console.error(`route=/api/admin/settings status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<Response> {
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
    const parsed = settingsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const settings = await updateSettings(parsed.data);
    console.log(
      `route=/api/admin/settings status=updated actor=${guard.user.id} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json(shapeSettings(settings));
  } catch (error) {
    console.error(`route=/api/admin/settings status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
