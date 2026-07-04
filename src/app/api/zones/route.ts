/** GET /api/zones — contract: harness/specs/002-cos-comanda/06-contracts/api.md */
import { getActiveZones } from "@/server/repositories/zones";

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  try {
    const zones = await getActiveZones();
    console.log(`route=/api/zones status=ok zones=${zones.length} durationMs=${Date.now() - startedAt}`);
    return Response.json({ zones });
  } catch (error) {
    console.error(`route=/api/zones status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
