/**
 * Menu reads. Shape mirrors 001 + 002 + 003 06-contracts/api.md: only active
 * categories/products/variants/toppings, sorted by sortOrder; every product
 * carries >= 1 active variant (none left → product omitted, 003 T07);
 * products carry their topping groups for the options UI
 * (preview prices only — the cart quote is authoritative).
 */
import { and, asc, eq, inArray } from "drizzle-orm";

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
  // additive since feat-007 (003 research D8) — shown in the options sheet
  ingredients: string | null;
  allergens: string | null;
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

/** Everything the pricing service needs to validate + price one product. */
export interface CatalogTopping {
  id: number;
  name: string;
  active: boolean;
  sgrDepositBani: number;
  /** priceBani by ProductVariant.name (null = single/default variant). */
  prices: MenuToppingPrice[];
}

export interface CatalogGroup {
  id: number;
  name: string;
  required: boolean;
  toppings: CatalogTopping[];
}

export interface CatalogVariant {
  id: number;
  name: string | null;
  priceBani: number;
}

export interface CatalogProduct {
  id: number;
  name: string;
  active: boolean;
  variants: CatalogVariant[];
  groups: CatalogGroup[];
}

/**
 * Catalog rows for the given product ids, INCLUDING inactive products and
 * toppings — the pricing service tells "inactive" apart from "not allowed"
 * (002 06-contracts reason codes). Missing ids are simply absent from the map.
 */
export async function getCatalogForProducts(productIds: number[]): Promise<Map<number, CatalogProduct>> {
  if (productIds.length === 0) return new Map();

  const productRows = await db
    .select({ id: products.id, name: products.name, active: products.active })
    .from(products)
    .where(inArray(products.id, productIds));

  // Inactive variants are ABSENT here on purpose: the pricing service then
  // answers variant_mismatch — the existing reason code — and the cart drops
  // the line, exactly like a variant that never existed (003 T07).
  const variantRows = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      priceBani: productVariants.priceBani,
    })
    .from(productVariants)
    .where(and(inArray(productVariants.productId, productIds), eq(productVariants.active, true)));

  const linkRows = await db
    .select({ productId: productToppingGroups.productId, groupId: productToppingGroups.groupId })
    .from(productToppingGroups)
    .where(inArray(productToppingGroups.productId, productIds));
  const groupIds = [...new Set(linkRows.map(({ groupId }) => groupId))];

  const groupRows = groupIds.length
    ? await db
        .select({
          id: toppingGroups.id,
          name: toppingGroups.name,
          required: toppingGroups.required,
        })
        .from(toppingGroups)
        .where(inArray(toppingGroups.id, groupIds))
        .orderBy(asc(toppingGroups.sortOrder), asc(toppingGroups.id))
    : [];

  const toppingRows = groupIds.length
    ? await db
        .select({
          id: toppings.id,
          groupId: toppings.groupId,
          name: toppings.name,
          active: toppings.active,
          sgrDepositBani: toppings.sgrDepositBani,
        })
        .from(toppings)
        .where(inArray(toppings.groupId, groupIds))
        .orderBy(asc(toppings.id))
    : [];
  const toppingIds = toppingRows.map(({ id }) => id);

  const priceRows = toppingIds.length
    ? await db
        .select({
          toppingId: toppingPrices.toppingId,
          sizeName: toppingPrices.sizeName,
          priceBani: toppingPrices.priceBani,
        })
        .from(toppingPrices)
        .where(inArray(toppingPrices.toppingId, toppingIds))
    : [];

  const pricesByTopping = new Map<number, MenuToppingPrice[]>();
  for (const { toppingId, ...price } of priceRows) {
    const list = pricesByTopping.get(toppingId) ?? [];
    list.push(price);
    pricesByTopping.set(toppingId, list);
  }

  const toppingsByGroup = new Map<number, CatalogTopping[]>();
  for (const { groupId, ...topping } of toppingRows) {
    const list = toppingsByGroup.get(groupId) ?? [];
    list.push({ ...topping, prices: pricesByTopping.get(topping.id) ?? [] });
    toppingsByGroup.set(groupId, list);
  }

  const groupsById = new Map<number, CatalogGroup>(
    groupRows.map((group) => [group.id, { ...group, toppings: toppingsByGroup.get(group.id) ?? [] }]),
  );

  const catalog = new Map<number, CatalogProduct>(
    productRows.map((product) => [product.id, { ...product, variants: [], groups: [] }]),
  );
  for (const { productId, ...variant } of variantRows) catalog.get(productId)?.variants.push(variant);
  for (const { productId, groupId } of linkRows) {
    const group = groupsById.get(groupId);
    if (group) catalog.get(productId)?.groups.push(group);
  }

  return catalog;
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
      ingredients: products.ingredients,
      allergens: products.allergens,
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
    .where(eq(productVariants.active, true))
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
    // no active variants left → nothing orderable → omit the product (003 T07)
    const activeVariants = variantsByProduct.get(product.id) ?? [];
    if (activeVariants.length === 0) continue;
    const productGroups = (groupIdsByProduct.get(product.id) ?? [])
      .map((groupId) => groupsById.get(groupId))
      .filter((group): group is MenuToppingGroup => group !== undefined)
      .sort((a, b) => groupOrder.get(a.id)! - groupOrder.get(b.id)!);
    menu.get(categoryId)?.products.push({
      ...product,
      variants: activeVariants,
      toppingGroups: productGroups,
    });
  }

  return [...menu.values()];
}
