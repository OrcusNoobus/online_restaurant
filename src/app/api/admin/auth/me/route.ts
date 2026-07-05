/**
 * GET /api/admin/auth/me — contract: 003-panou-admin/06-contracts/api.md.
 * Same payload as login; doubles as the poller's cheap session keep-alive
 * (verifySession applies the rolling renewal).
 */
import { requireStaff } from "@/server/services/auth";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireStaff(request);
    if (!guard.ok) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }
    console.log(
      `route=/api/admin/auth/me status=ok actor=${guard.user.id} durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ user: guard.user });
  } catch (error) {
    console.error(`route=/api/admin/auth/me status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
