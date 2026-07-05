/**
 * Admin catalog reads + mutations (003 06-contracts Catalog). The panel READS
 * through getAdminCatalog — the FULL tree including inactive entities, which
 * the public menu hides, so it cannot drive an editor. Mutations are plain
 * row patches; role rules live at the HTTP boundary, seed-ownership flags in
 * the service (T11).
 */
import { asc, eq } from "drizzle-orm";

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
  active?: boolean;
}

export async function patchTopping(id: number, patch: ToppingPatch): Promise<(AdminTopping & { groupId: number }) | null> {
  const rows = await db.update(toppings).set(patch).where(eq(toppings.id, id)).returning({
    id: toppings.id,
    groupId: toppings.groupId,
    name: toppings.name,
    sgrDepositBani: toppings.sgrDepositBani,
    active: toppings.active,
  });
  if (!rows[0]) return null;
  const prices = await db
    .select({ sizeName: toppingPrices.sizeName, priceBani: toppingPrices.priceBani })
    .from(toppingPrices)
    .where(eq(toppingPrices.toppingId, id))
    .orderBy(asc(toppingPrices.id));
  return { ...rows[0], prices };
}
