/** PATCH /api/account/profile — contract: 005-conturi-clienti/06-contracts/api.md */
import { profilePatchSchema } from "@/lib/account-schemas";
import { updateProfile } from "@/server/services/customer-account";
import { requireCustomer } from "@/server/services/customer-auth";

export async function PATCH(request: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const guard = await requireCustomer(request);
    if (!guard.ok) {
      return Response.json({ error: guard.error }, { status: guard.status });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "validation", issues: [{ message: "invalid JSON body" }] }, { status: 400 });
    }

    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) {
      console.log(`route=/api/account/profile status=invalid_shape durationMs=${Date.now() - startedAt}`);
      return Response.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }

    const result = await updateProfile(guard.customer.id, parsed.data);
    if (!result.ok) {
      console.log(
        `route=/api/account/profile status=${result.error} customer=${guard.customer.id} ` +
          `durationMs=${Date.now() - startedAt}`,
      );
      return Response.json({ error: result.error }, { status: 422 });
    }

    console.log(
      `route=/api/account/profile status=ok customer=${guard.customer.id} claimed=${result.claimedOrders} ` +
        `durationMs=${Date.now() - startedAt}`,
    );
    return Response.json({ customer: result.customer });
  } catch (error) {
    console.error(`route=/api/account/profile status=error durationMs=${Date.now() - startedAt}`, error);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
