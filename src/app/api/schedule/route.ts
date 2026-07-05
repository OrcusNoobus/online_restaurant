/**
 * GET /api/schedule — public live schedule/estimates (003 06-contracts). The
 * checkout UI (and future channels) renders these; the server stays
 * authoritative. No auth, no ownership flags, no cache headers — must be live.
 */
import { getScheduleConfig } from "@/server/services/settings";

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  try {
    const schedule = await getScheduleConfig();
    console.log(`route=/api/schedule status=ok durationMs=${Date.now() - startedAt}`);
    return Response.json({ schedule });
  } catch (error) {
    console.error(`route=/api/schedule status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
