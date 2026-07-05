/**
 * PATCH /api/admin/toppings/:id — Q14: staff may toggle {active} only; admin
 * field/price edits arrive in T08.
 */
import { availabilityPatchSchema, idParamSchema } from "@/lib/admin-schemas";
import { updateTopping } from "@/server/services/admin-catalog";
import { requireStaff } from "@/server/services/auth";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/toppings/[id]">): Promise<Response> {
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
          `route=/api/admin/toppings/:id status=forbidden_role actor=${guard.user.id} ` +
            `entity=${parsedId.data} durationMs=${Date.now() - startedAt}`,
        );
        return Response.json({ error: "forbidden_role" }, { status: 403 });
      }
    }

    const parsed = availabilityPatchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await updateTopping(parsedId.data, parsed.data);
    if (!result.ok) return Response.json({ error: "not_found" }, { status: 404 });

    console.log(
      `route=/api/admin/toppings/:id status=ok actor=${guard.user.id} entity=${parsedId.data} ` +
        `active=${result.entity.active} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ topping: result.entity });
  } catch (error) {
    console.error(`route=/api/admin/toppings/:id status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
