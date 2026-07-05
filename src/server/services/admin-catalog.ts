/**
 * Catalog admin operations (003 06-contracts Catalog). Role rules live at the
 * HTTP boundary (Q14). Every successful mutation stamps its domain's
 * seed-ownership flag (research D7): the first CATALOG write sets
 * catalog_protected_since, the first ZONE write sets zones_protected_since —
 * from then on `npm run db:seed` refuses that section (SEED_FORCE=1 resets).
 */
import {
  type AdminCatalog,
  type CategoryPatch,
  type CategoryRow,
  createCategory,
  type CreateCategoryResult,
  createProduct,
  type CreateProductResult,
  getAdminCatalog,
  type NewCategoryInput,
  type NewProductInput,
  patchCategory,
  patchProduct,
  patchTopping,
  patchVariant,
  type ProductPatch,
  type ProductRow,
  type ToppingPatch,
  type VariantPatch,
} from "@/server/repositories/catalog-admin";
import { markCatalogProtected, markZonesProtected } from "@/server/repositories/settings";
import {
  type AdminZoneRow,
  createZone,
  type CreateZoneResult,
  listAllZones,
  type NewZoneInput,
  patchZone,
  type ZonePatch,
} from "@/server/repositories/zones";

export async function getCatalog(): Promise<AdminCatalog> {
  return getAdminCatalog();
}

// --- Zones (admin only; deactivate, never delete — RESTRICT FKs) -------------

export async function getZones(): Promise<AdminZoneRow[]> {
  return listAllZones();
}

export async function addZone(input: NewZoneInput): Promise<CreateZoneResult> {
  const result = await createZone(input);
  if (result.ok) await markZonesProtected(new Date());
  return result;
}

export async function updateZone(id: number, patch: ZonePatch): Promise<PatchResult<AdminZoneRow>> {
  const row = await patchZone(id, patch);
  if (row) await markZonesProtected(new Date());
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}

export async function addCategory(input: NewCategoryInput): Promise<CreateCategoryResult> {
  const result = await createCategory(input);
  if (result.ok) await markCatalogProtected(new Date());
  return result;
}

export async function addProduct(input: NewProductInput): Promise<CreateProductResult> {
  const result = await createProduct(input);
  if (result.ok) await markCatalogProtected(new Date());
  return result;
}

type PatchResult<T> = { ok: true; entity: T } | { ok: false; error: "not_found" };

export async function updateCategory(id: number, patch: CategoryPatch): Promise<PatchResult<CategoryRow>> {
  const row = await patchCategory(id, patch);
  if (row) await markCatalogProtected(new Date());
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}

export async function updateProduct(id: number, patch: ProductPatch): Promise<PatchResult<ProductRow>> {
  const row = await patchProduct(id, patch);
  if (row) await markCatalogProtected(new Date());
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}

export async function updateVariant(
  id: number,
  patch: VariantPatch,
): Promise<PatchResult<NonNullable<Awaited<ReturnType<typeof patchVariant>>>>> {
  const row = await patchVariant(id, patch);
  if (row) await markCatalogProtected(new Date());
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}

export async function updateTopping(
  id: number,
  patch: ToppingPatch,
): Promise<PatchResult<NonNullable<Awaited<ReturnType<typeof patchTopping>>>>> {
  const row = await patchTopping(id, patch);
  if (row) await markCatalogProtected(new Date());
  return row ? { ok: true, entity: row } : { ok: false, error: "not_found" };
}
