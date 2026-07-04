/**
 * Menu reads. Shape mirrors 001 + 002 06-contracts/api.md: only active
 * categories/products/toppings, sorted by sortOrder; every product carries
 * >= 1 variant; products carry their topping groups for the options UI
 * (preview prices only — the cart quote is authoritative).
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

export interface MenuVariant {
  id: number;
  name: string | null;
  priceBani: number;
}

export interface MenuToppingPrice {
  sizeName: string | null;
  priceBani: number;
}

export interface MenuTopping {
  id: number;
  name: string;
  sgrDepositBani: number;
  prices: MenuToppingPrice[];
}

export interface MenuToppingGroup {
  id: number;
  name: string;
  required: boolean;
  displayType: string;
  toppings: MenuTopping[];
}

export interface MenuProduct {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  variants: MenuVariant[];
  toppingGroups: MenuToppingGroup[];
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

  const groupRows = await db
    .select({
      id: toppingGroups.id,
      name: toppingGroups.name,
      required: toppingGroups.required,
      displayType: toppingGroups.displayType,
    })
    .from(toppingGroups)
    .orderBy(asc(toppingGroups.sortOrder), asc(toppingGroups.id));

  const toppingRows = await db
    .select({
      id: toppings.id,
      groupId: toppings.groupId,
      name: toppings.name,
      sgrDepositBani: toppings.sgrDepositBani,
    })
    .from(toppings)
    .where(eq(toppings.active, true))
    .orderBy(asc(toppings.id));

  const priceRows = await db
    .select({
      toppingId: toppingPrices.toppingId,
      sizeName: toppingPrices.sizeName,
      priceBani: toppingPrices.priceBani,
    })
    .from(toppingPrices)
    .orderBy(asc(toppingPrices.id));

  const linkRows = await db
    .select({ productId: productToppingGroups.productId, groupId: productToppingGroups.groupId })
    .from(productToppingGroups);

  const pricesByTopping = new Map<number, MenuToppingPrice[]>();
  for (const { toppingId, ...price } of priceRows) {
    const list = pricesByTopping.get(toppingId) ?? [];
    list.push(price);
    pricesByTopping.set(toppingId, list);
  }

  const toppingsByGroup = new Map<number, MenuTopping[]>();
  for (const { groupId, ...topping } of toppingRows) {
    const list = toppingsByGroup.get(groupId) ?? [];
    list.push({ ...topping, prices: pricesByTopping.get(topping.id) ?? [] });
    toppingsByGroup.set(groupId, list);
  }

  // Groups whose toppings are all inactive are omitted — a required group the
  // customer cannot satisfy must not appear (the pricing service applies the
  // same rule when enforcing required groups).
  const groupsById = new Map<number, MenuToppingGroup>();
  const groupOrder = new Map<number, number>();
  for (const group of groupRows) {
    const groupToppings = toppingsByGroup.get(group.id) ?? [];
    if (groupToppings.length === 0) continue;
    groupOrder.set(group.id, groupOrder.size);
    groupsById.set(group.id, { ...group, toppings: groupToppings });
  }

  const groupIdsByProduct = new Map<number, number[]>();
  for (const { productId, groupId } of linkRows) {
    const list = groupIdsByProduct.get(productId) ?? [];
    list.push(groupId);
    groupIdsByProduct.set(productId, list);
  }

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
    const productGroups = (groupIdsByProduct.get(product.id) ?? [])
      .map((groupId) => groupsById.get(groupId))
      .filter((group): group is MenuToppingGroup => group !== undefined)
      .sort((a, b) => groupOrder.get(a.id)! - groupOrder.get(b.id)!);
    menu.get(categoryId)?.products.push({
      ...product,
      variants: variantsByProduct.get(product.id) ?? [],
      toppingGroups: productGroups,
    });
  }

  return [...menu.values()];
}
