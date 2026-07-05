/**
 * PATCH /api/admin/variants/:id — Q14: staff may toggle {active} only; admin
 * edits any subset of name/priceBani/sortOrder/active. Deactivating the LAST
 * active variant of a product is allowed — the product then disappears from
 * the menu (documented behavior).
 */
import { adminVariantPatchSchema, availabilityPatchSchema, idParamSchema } from "@/lib/admin-schemas";
import { updateVariant } from "@/server/services/admin-catalog";
import { requireStaff } from "@/server/services/auth";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/variants/[id]">): Promise<Response> {
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

    if (guard.user.role !== "admin") {
      const keys = typeof body === "object" && body !== null ? Object.keys(body) : [];
      if (keys.some((key) => key !== "active")) {
        console.log(
          `route=/api/admin/variants/:id status=forbidden_role actor=${guard.user.id} ` +
            `entity=${parsedId.data} durationMs=${Date.now() - startedAt}`,
        );
        return Response.json({ error: "forbidden_role" }, { status: 403 });
      }
    }

    const schema = guard.user.role === "admin" ? adminVariantPatchSchema : availabilityPatchSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await updateVariant(parsedId.data, parsed.data);
    if (!result.ok) return Response.json({ error: "not_found" }, { status: 404 });

    console.log(
      `route=/api/admin/variants/:id status=ok actor=${guard.user.id} entity=${parsedId.data} ` +
        `active=${result.entity.active} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ variant: result.entity });
  } catch (error) {
    console.error(`route=/api/admin/variants/:id status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
