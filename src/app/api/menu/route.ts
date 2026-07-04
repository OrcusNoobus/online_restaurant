/** GET /api/menu — contract: harness/specs/001-meniu-catalog/06-contracts/api.md */
import { getMenu } from "@/server/repositories/menu";

export async function GET(): Promise<Response> {
  try {
    const categories = await getMenu();
    return Response.json({ categories });
  } catch (error) {
    console.error("GET /api/menu failed:", error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
