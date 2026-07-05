/** POST /api/admin/auth/logout — contract: 003-panou-admin/06-contracts/api.md. Idempotent. */
import { clearedSessionCookie, logout, sessionTokenFromRequest } from "@/server/services/auth";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const token = sessionTokenFromRequest(request);
    if (token) await logout(token);
    console.log(`route=/api/admin/auth/logout status=ok durationMs=${Date.now() - startedAt}`);
    return new Response(null, { status: 204, headers: { "set-cookie": clearedSessionCookie() } });
  } catch (error) {
    console.error(`route=/api/admin/auth/logout status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
