/**
 * POST /api/admin/products — admin only (Q14). >= 1 variant, prices > 0,
 * server-side slug, topping-group links (003 06-contracts Catalog).
 */
import { productCreateSchema } from "@/lib/admin-schemas";
import { addProduct } from "@/server/services/admin-catalog";
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
    const parsed = productCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await addProduct(parsed.data);
    console.log(
      `route=/api/admin/products status=${result.ok ? "created" : result.error} actor=${guard.user.id} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
    return Response.json({ product: result.product }, { status: 201 });
  } catch (error) {
    console.error(`route=/api/admin/products status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
