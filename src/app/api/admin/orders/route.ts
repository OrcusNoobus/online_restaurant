/** GET /api/admin/orders?date&status — day view + totals (003 06-contracts). */
import { adminOrdersQuerySchema } from "@/lib/admin-schemas";
import { listDay } from "@/server/services/admin-orders";
import { requireStaff } from "@/server/services/auth";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireStaff(request);
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

    const url = new URL(request.url);
    const parsed = adminOrdersQuerySchema.safeParse({
      date: url.searchParams.get("date") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const view = await listDay(parsed.data.date, parsed.data.status);
    console.log(
      `route=/api/admin/orders status=ok actor=${guard.user.id} date=${view.date} ` +
        `orders=${view.orders.length} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json(view);
  } catch (error) {
    console.error(`route=/api/admin/orders status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
