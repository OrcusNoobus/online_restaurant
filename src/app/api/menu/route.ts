/** GET /api/menu — contract: harness/specs/001-meniu-catalog/06-contracts/api.md */
import { getMenu } from "@/server/repositories/menu";

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  try {
    const categories = await getMenu();
    console.log(`route=/api/menu status=ok categories=${categories.length} durationMs=${Date.now() - startedAt}`);
    return Response.json({ categories });
  } catch (error) {
    console.error(`route=/api/menu status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
