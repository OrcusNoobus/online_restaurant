/** POST /api/admin/categories — admin only (Q14). Slug generated server-side. */
import { categoryCreateSchema } from "@/lib/admin-schemas";
import { addCategory } from "@/server/services/admin-catalog";
import { requireAdmin } from "@/server/services/auth";

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
    const parsed = categoryCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await addCategory(parsed.data);
    console.log(
      `route=/api/admin/categories status=${result.ok ? "created" : result.error} actor=${guard.user.id} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
    return Response.json({ category: result.category }, { status: 201 });
  } catch (error) {
    console.error(`route=/api/admin/categories status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
