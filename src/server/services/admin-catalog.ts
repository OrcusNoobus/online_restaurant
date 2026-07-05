/**
 * Catalog admin operations (003 06-contracts Catalog). Thin over the
 * repository for now: role rules live at the HTTP boundary (Q14), the
 * seed-ownership flag flip arrives with the seed guard task (T11, research D7).
 */
import {
  type AdminCatalog,
  type CategoryPatch,
  type CategoryRow,
  getAdminCatalog,
  patchCategory,
  patchProduct,
  patchTopping,
  patchVariant,
  type ProductPatch,
  type ProductRow,
  type ToppingPatch,
  type VariantPatch,
} from "@/server/repositories/catalog-admin";

export async function getCatalog(): Promise<AdminCatalog> {
  return getAdminCatalog();
}

type PatchResult<T> = { ok: true; entity: T } | { ok: false; error: "not_found" };

export async function updateCategory(id: number, patch: CategoryPatch): Promise<PatchResult<CategoryRow>> {
  const row = await patchCategory(id, patch);
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}

export async function updateProduct(id: number, patch: ProductPatch): Promise<PatchResult<ProductRow>> {
  const row = await patchProduct(id, patch);
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}

export async function updateVariant(
  id: number,
  patch: VariantPatch,
): Promise<PatchResult<NonNullable<Awaited<ReturnType<typeof patchVariant>>>>> {
  const row = await patchVariant(id, patch);
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}

export async function updateTopping(
  id: number,
  patch: ToppingPatch,
): Promise<PatchResult<NonNullable<Awaited<ReturnType<typeof patchTopping>>>>> {
  const row = await patchTopping(id, patch);
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}
