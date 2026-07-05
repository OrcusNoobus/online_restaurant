/**
 * GET /api/admin/catalog — the panel's read view: the FULL catalog including
 * inactive entities (the public menu hides them). Staff + admin (Q14).
 */
import { requireStaff } from "@/server/services/auth";
import { getCatalog } from "@/server/services/admin-catalog";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireStaff(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    const catalog = await getCatalog();
    console.log(
      `route=/api/admin/catalog status=ok actor=${guard.user.id} categories=${catalog.categories.length} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    return Response.json(catalog);
  } catch (error) {
    console.error(`route=/api/admin/catalog status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
