/**
 * Menu reads. Shape mirrors 06-contracts/api.md: only active categories and
 * products, sorted by sortOrder; every product carries >= 1 variant.
 */
import { asc, eq } from "drizzle-orm";

import { db } from "../db/client";
import { categories, products, productVariants } from "../db/schema";

export interface MenuVariant {
  id: number;
  name: string | null;
  priceBani: number;
}

export interface MenuProduct {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  variants: MenuVariant[];
}

export interface MenuCategory {
  id: number;
  slug: string;
  name: string;
  products: MenuProduct[];
}

export async function getMenu(): Promise<MenuCategory[]> {
  const categoryRows = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.sortOrder), asc(categories.id));

  const productRows = await db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      slug: products.slug,
      name: products.name,
      description: products.description,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(eq(products.active, true))
    .orderBy(asc(products.sortOrder), asc(products.id));

  const variantRows = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      priceBani: productVariants.priceBani,
    })
    .from(productVariants)
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.id));

  const variantsByProduct = new Map<number, MenuVariant[]>();
  for (const { productId, ...variant } of variantRows) {
    const list = variantsByProduct.get(productId) ?? [];
    list.push(variant);
    variantsByProduct.set(productId, list);
  }

  const menu = new Map<number, MenuCategory>(
    categoryRows.map((c) => [c.id, { ...c, products: [] }]),
  );
  // Products of inactive categories fall out here: their category is not in the map.
  for (const { categoryId, ...product } of productRows) {
    menu.get(categoryId)?.products.push({ ...product, variants: variantsByProduct.get(product.id) ?? [] });
  }

  return [...menu.values()];
}
