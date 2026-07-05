/**
 * Admin catalog reads + mutations (003 06-contracts Catalog). The panel READS
 * through getAdminCatalog — the FULL tree including inactive entities, which
 * the public menu hides, so it cannot drive an editor. Mutations are plain
 * row patches; role rules live at the HTTP boundary, seed-ownership flags in
 * the service (T11).
 */
import { asc, eq, inArray, sql } from "drizzle-orm";

import { slugify } from "@/lib/admin-schemas";

import { db } from "../db/client";
import {
  categories,
  products,
  productToppingGroups,
  productVariants,
  toppingGroups,
  toppingPrices,
  toppings,
} from "../db/schema";

export interface AdminVariant {
  id: number;
  name: string | null;
  priceBani: number;
  active: boolean;
  sortOrder: number;
}

export interface AdminProduct {
  id: number;
  name: string;
  description: string | null;
  ingredients: string | null;
  allergens: string | null;
  active: boolean;
  sortOrder: number;
  variants: AdminVariant[];
  toppingGroupIds: number[];
}

export interface AdminCategory {
  id: number;
  name: string;
  sortOrder: number;
  active: boolean;
  products: AdminProduct[];
}

export interface AdminToppingPrice {
  sizeName: string | null;
  priceBani: number;
}

export interface AdminTopping {
  id: number;
  name: string;
  sgrDepositBani: number;
  active: boolean;
  prices: AdminToppingPrice[];
}

export interface AdminToppingGroup {
  id: number;
  name: string;
  required: boolean;
  displayType: string;
  sortOrder: number;
  toppings: AdminTopping[];
}

export interface AdminCatalog {
  categories: AdminCategory[];
  toppingGroups: AdminToppingGroup[];
}

export async function getAdminCatalog(): Promise<AdminCatalog> {
  const [categoryRows, productRows, variantRows, linkRows, groupRows, toppingRows, priceRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        sortOrder: categories.sortOrder,
        active: categories.active,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.id)),
    db
      .select({
        id: products.id,
        categoryId: products.categoryId,
        name: products.name,
        description: products.description,
        ingredients: products.ingredients,
        allergens: products.allergens,
        active: products.active,
        sortOrder: products.sortOrder,
      })
      .from(products)
      .orderBy(asc(products.sortOrder), asc(products.id)),
    db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        name: productVariants.name,
        priceBani: productVariants.priceBani,
        active: productVariants.active,
        sortOrder: productVariants.sortOrder,
      })
      .from(productVariants)
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.id)),
    db
      .select({ productId: productToppingGroups.productId, groupId: productToppingGroups.groupId })
      .from(productToppingGroups),
    db
      .select({
        id: toppingGroups.id,
        name: toppingGroups.name,
        required: toppingGroups.required,
        displayType: toppingGroups.displayType,
        sortOrder: toppingGroups.sortOrder,
      })
      .from(toppingGroups)
      .orderBy(asc(toppingGroups.sortOrder), asc(toppingGroups.id)),
    db
      .select({
        id: toppings.id,
        groupId: toppings.groupId,
        name: toppings.name,
        sgrDepositBani: toppings.sgrDepositBani,
        active: toppings.active,
      })
      .from(toppings)
      .orderBy(asc(toppings.id)),
    db
      .select({
        toppingId: toppingPrices.toppingId,
        sizeName: toppingPrices.sizeName,
        priceBani: toppingPrices.priceBani,
      })
      .from(toppingPrices)
      .orderBy(asc(toppingPrices.id)),
  ]);

  const pricesByTopping = new Map<number, AdminToppingPrice[]>();
  for (const { toppingId, ...price } of priceRows) {
    const list = pricesByTopping.get(toppingId) ?? [];
    list.push(price);
    pricesByTopping.set(toppingId, list);
  }

  const toppingsByGroup = new Map<number, AdminTopping[]>();
  for (const { groupId, ...topping } of toppingRows) {
    const list = toppingsByGroup.get(groupId) ?? [];
    list.push({ ...topping, prices: pricesByTopping.get(topping.id) ?? [] });
    toppingsByGroup.set(groupId, list);
  }

  const variantsByProduct = new Map<number, AdminVariant[]>();
  for (const { productId, ...variant } of variantRows) {
    const list = variantsByProduct.get(productId) ?? [];
    list.push(variant);
    variantsByProduct.set(productId, list);
  }

  const groupIdsByProduct = new Map<number, number[]>();
  for (const { productId, groupId } of linkRows) {
    const list = groupIdsByProduct.get(productId) ?? [];
    list.push(groupId);
    groupIdsByProduct.set(productId, list);
  }

  const categoriesById = new Map<number, AdminCategory>(
    categoryRows.map((category) => [category.id, { ...category, products: [] }]),
  );
  for (const { categoryId, ...product } of productRows) {
    categoriesById.get(categoryId)?.products.push({
      ...product,
      variants: variantsByProduct.get(product.id) ?? [],
      toppingGroupIds: groupIdsByProduct.get(product.id) ?? [],
    });
  }

  return {
    categories: [...categoriesById.values()],
    toppingGroups: groupRows.map((group) => ({ ...group, toppings: toppingsByGroup.get(group.id) ?? [] })),
  };
}

// --- Creates (003 06-contracts: POST categories/products) --------------------

/** base, base-2, base-3 … until free — distinct names may collide to one slug. */
async function uniqueSlug(base: string, slugExists: (candidate: string) => Promise<boolean>) {
  let candidate = base;
  for (let suffix = 2; await slugExists(candidate); suffix++) {
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export interface NewCategoryInput {
  name: string;
  sortOrder?: number;
}

export type CreateCategoryResult = { ok: true; category: CategoryRow } | { ok: false; error: "name_taken" };

export async function createCategory(input: NewCategoryInput): Promise<CreateCategoryResult> {
  const duplicate = await db
    .select({ id: categories.id })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${input.name})`);
  if (duplicate.length > 0) return { ok: false, error: "name_taken" };

  const slug = await uniqueSlug(slugify(input.name), async (candidate) => {
    const rows = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, candidate));
    return rows.length > 0;
  });

  const [row] = await db
    .insert(categories)
    .values({ slug, name: input.name, sortOrder: input.sortOrder ?? 0 })
    .returning({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      sortOrder: categories.sortOrder,
      active: categories.active,
    });
  return { ok: true, category: row };
}

export interface NewProductInput {
  categoryId: number;
  name: string;
  description?: string | null;
  ingredients?: string | null;
  allergens?: string | null;
  sortOrder?: number;
  variants: { name: string | null; priceBani: number }[];
  toppingGroupIds: number[];
}

export type CreateProductResult =
  | { ok: true; product: ProductRow & { variants: AdminVariant[]; toppingGroupIds: number[] } }
  | { ok: false; error: "name_taken" | "category_not_found" | "topping_group_not_found" };

export async function createProduct(input: NewProductInput): Promise<CreateProductResult> {
  return db.transaction(async (tx) => {
    const category = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId));
    if (category.length === 0) return { ok: false as const, error: "category_not_found" as const };

    if (input.toppingGroupIds.length > 0) {
      const found = await tx
        .select({ id: toppingGroups.id })
        .from(toppingGroups)
        .where(inArray(toppingGroups.id, input.toppingGroupIds));
      if (found.length !== new Set(input.toppingGroupIds).size) {
        return { ok: false as const, error: "topping_group_not_found" as const };
      }
    }

    const duplicate = await tx
      .select({ id: products.id })
      .from(products)
      .where(sql`lower(${products.name}) = lower(${input.name})`);
    if (duplicate.length > 0) return { ok: false as const, error: "name_taken" as const };

    const slug = await uniqueSlug(slugify(input.name), async (candidate) => {
      const rows = await tx.select({ id: products.id }).from(products).where(eq(products.slug, candidate));
      return rows.length > 0;
    });

    const [product] = await tx
      .insert(products)
      .values({
        categoryId: input.categoryId,
        slug,
        name: input.name,
        description: input.description ?? null,
        ingredients: input.ingredients ?? null,
        allergens: input.allergens ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning({
        id: products.id,
        categoryId: products.categoryId,
        slug: products.slug,
        name: products.name,
        description: products.description,
        ingredients: products.ingredients,
        allergens: products.allergens,
        sortOrder: products.sortOrder,
        active: products.active,
      });

    const variants = await tx
      .insert(productVariants)
      .values(
        input.variants.map((variant, index) => ({
          productId: product.id,
          name: variant.name,
          priceBani: variant.priceBani,
          sortOrder: index,
        })),
      )
      .returning({
        id: productVariants.id,
        name: productVariants.name,
        priceBani: productVariants.priceBani,
        active: productVariants.active,
        sortOrder: productVariants.sortOrder,
      });

    if (input.toppingGroupIds.length > 0) {
      await tx
        .insert(productToppingGroups)
        .values(input.toppingGroupIds.map((groupId) => ({ productId: product.id, groupId })));
    }

    return { ok: true as const, product: { ...product, variants, toppingGroupIds: input.toppingGroupIds } };
  });
}

// --- Row patches (fields grow with T08; T07 wires availability) --------------

export interface CategoryPatch {
  name?: string;
  sortOrder?: number;
  active?: boolean;
}

export interface CategoryRow {
  id: number;
  slug: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export async function patchCategory(id: number, patch: CategoryPatch): Promise<CategoryRow | null> {
  const rows = await db.update(categories).set(patch).where(eq(categories.id, id)).returning({
    id: categories.id,
    slug: categories.slug,
    name: categories.name,
    sortOrder: categories.sortOrder,
    active: categories.active,
  });
  return rows[0] ?? null;
}

export interface ProductPatch {
  name?: string;
  description?: string | null;
  ingredients?: string | null;
  allergens?: string | null;
  categoryId?: number;
  sortOrder?: number;
  active?: boolean;
}

export interface ProductRow {
  id: number;
  categoryId: number;
  slug: string;
  name: string;
  description: string | null;
  ingredients: string | null;
  allergens: string | null;
  sortOrder: number;
  active: boolean;
}

export async function patchProduct(id: number, patch: ProductPatch): Promise<ProductRow | null> {
  const rows = await db.update(products).set(patch).where(eq(products.id, id)).returning({
    id: products.id,
    categoryId: products.categoryId,
    slug: products.slug,
    name: products.name,
    description: products.description,
    ingredients: products.ingredients,
    allergens: products.allergens,
    sortOrder: products.sortOrder,
    active: products.active,
  });
  return rows[0] ?? null;
}

export interface VariantPatch {
  name?: string | null;
  priceBani?: number;
  sortOrder?: number;
  active?: boolean;
}

export async function patchVariant(id: number, patch: VariantPatch): Promise<(AdminVariant & { productId: number }) | null> {
  const rows = await db.update(productVariants).set(patch).where(eq(productVariants.id, id)).returning({
    id: productVariants.id,
    productId: productVariants.productId,
    name: productVariants.name,
    priceBani: productVariants.priceBani,
    active: productVariants.active,
    sortOrder: productVariants.sortOrder,
  });
  return rows[0] ?? null;
}

export interface ToppingPatch {
  name?: string;
  sgrDepositBani?: number;
  active?: boolean;
  /** Upserted by (topping, sizeName) — existing sizes not listed here stay untouched. */
  prices?: AdminToppingPrice[];
}

export async function patchTopping(id: number, patch: ToppingPatch): Promise<(AdminTopping & { groupId: number }) | null> {
  const { prices: priceUpserts, ...fields } = patch;

  const row = await db.transaction(async (tx) => {
    const rows = Object.keys(fields).length
      ? await tx.update(toppings).set(fields).where(eq(toppings.id, id)).returning({
          id: toppings.id,
          groupId: toppings.groupId,
          name: toppings.name,
          sgrDepositBani: toppings.sgrDepositBani,
          active: toppings.active,
        })
      : await tx
          .select({
            id: toppings.id,
            groupId: toppings.groupId,
            name: toppings.name,
            sgrDepositBani: toppings.sgrDepositBani,
            active: toppings.active,
          })
          .from(toppings)
          .where(eq(toppings.id, id));
    if (!rows[0]) return null;

    if (priceUpserts?.length) {
      for (const price of priceUpserts) {
        await tx
          .insert(toppingPrices)
          .values({ toppingId: id, sizeName: price.sizeName, priceBani: price.priceBani })
          .onConflictDoUpdate({
            target: [toppingPrices.toppingId, toppingPrices.sizeName],
            set: { priceBani: price.priceBani },
          });
      }
    }
    return rows[0];
  });
  if (!row) return null;

  const prices = await db
    .select({ sizeName: toppingPrices.sizeName, priceBani: toppingPrices.priceBani })
    .from(toppingPrices)
    .where(eq(toppingPrices.toppingId, id))
    .orderBy(asc(toppingPrices.id));
  return { ...row, prices };
}
