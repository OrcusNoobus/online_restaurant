/**
 * Idempotent menu seed: validates data/menu-seed.json (the owner may hand-edit
 * it) and upserts it into Postgres. Run via `npm run db:seed`; running twice
 * must not duplicate anything (01-spec.md FR4).
 *
 * Upsert keys: slug for categories/products; (group, name) for toppings;
 * (topping, size) for topping prices. Variants have no natural key and are
 * replaced per product — revisit before orders reference variant ids (feat-006).
 * `active` is set only on insert, so re-seeding never reactivates rows the
 * admin has hidden. Rows removed from the JSON stay in the database.
 */
import { readFileSync } from "node:fs";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  categories,
  products,
  productToppingGroups,
  productVariants,
  toppingGroups,
  toppingPrices,
  toppings,
} from "../src/server/db/schema";

const slug = z.string().regex(/^[a-z0-9-]+$/);

const seedSchema = z.object({
  sgrDepositBani: z.number().int().nonnegative(),
  categories: z
    .array(
      z.object({
        slug,
        name: z.string().min(1),
        products: z
          .array(
            z.object({
              slug,
              name: z.string().min(1),
              description: z.string().nullish(),
              imageUrl: z.string().nullish(),
              // >= 1 variant per product — data-model validation rule
              variants: z
                .array(
                  z.object({
                    name: z.string().nullish(),
                    priceBani: z.number().int().positive(),
                  }),
                )
                .min(1),
              toppingGroupKeys: z.array(z.string()).default([]),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
  toppingGroups: z.array(
    z.object({
      key: z.string(),
      name: z.string().min(1),
      toppings: z
        .array(
          z.object({
            name: z.string().min(1),
            prices: z
              .array(
                z.object({
                  sizeName: z.string().nullish(),
                  priceBani: z.number().int().nonnegative(),
                }),
              )
              .min(1),
          }),
        )
        .min(1),
    }),
  ),
});

function assertUnique(values: string[], what: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${what} in seed file: ${value}`);
    seen.add(value);
  }
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env — DATABASE_URL must come from the environment
  }
  const { db } = await import("../src/server/db/client");

  const raw = readFileSync(new URL("../data/menu-seed.json", import.meta.url), "utf8");
  const seed = seedSchema.parse(JSON.parse(raw));

  assertUnique(seed.categories.map((c) => c.slug), "category slug");
  assertUnique(seed.categories.flatMap((c) => c.products.map((p) => p.slug)), "product slug");
  assertUnique(seed.toppingGroups.map((g) => g.key), "topping group key");

  const counts = { categories: 0, products: 0, variants: 0, groups: 0, toppings: 0, prices: 0, links: 0 };

  await db.transaction(async (tx) => {
    // Topping groups + toppings + per-size prices; groups matched by name
    // (the JSON `key` is not stored — 05-data-model.md defines only `name`).
    const groupIdByKey = new Map<string, number>();
    for (const group of seed.toppingGroups) {
      const existing = await tx
        .select({ id: toppingGroups.id })
        .from(toppingGroups)
        .where(eq(toppingGroups.name, group.name));
      const groupId =
        existing[0]?.id ??
        (await tx.insert(toppingGroups).values({ name: group.name }).returning({ id: toppingGroups.id }))[0].id;
      groupIdByKey.set(group.key, groupId);
      counts.groups += 1;

      for (const topping of group.toppings) {
        const found = await tx
          .select({ id: toppings.id })
          .from(toppings)
          .where(and(eq(toppings.groupId, groupId), eq(toppings.name, topping.name)));
        const toppingId =
          found[0]?.id ??
          (await tx.insert(toppings).values({ groupId, name: topping.name }).returning({ id: toppings.id }))[0].id;
        counts.toppings += 1;

        for (const price of topping.prices) {
          await tx
            .insert(toppingPrices)
            .values({ toppingId, sizeName: price.sizeName ?? null, priceBani: price.priceBani })
            .onConflictDoUpdate({
              target: [toppingPrices.toppingId, toppingPrices.sizeName],
              set: { priceBani: price.priceBani },
            });
          counts.prices += 1;
        }
      }
    }

    for (const [categoryIndex, category] of seed.categories.entries()) {
      const [categoryRow] = await tx
        .insert(categories)
        .values({ slug: category.slug, name: category.name, sortOrder: categoryIndex })
        .onConflictDoUpdate({
          target: categories.slug,
          set: { name: category.name, sortOrder: categoryIndex },
        })
        .returning({ id: categories.id });
      counts.categories += 1;

      for (const [productIndex, product] of category.products.entries()) {
        const values = {
          categoryId: categoryRow.id,
          slug: product.slug,
          name: product.name,
          description: product.description ?? null,
          imageUrl: product.imageUrl ?? null,
          sortOrder: productIndex,
        };
        const [productRow] = await tx
          .insert(products)
          .values(values)
          .onConflictDoUpdate({ target: products.slug, set: values })
          .returning({ id: products.id });
        counts.products += 1;

        await tx.delete(productVariants).where(eq(productVariants.productId, productRow.id));
        await tx.insert(productVariants).values(
          product.variants.map((variant, variantIndex) => ({
            productId: productRow.id,
            name: variant.name ?? null,
            priceBani: variant.priceBani,
            sortOrder: variantIndex,
          })),
        );
        counts.variants += product.variants.length;

        await tx.delete(productToppingGroups).where(eq(productToppingGroups.productId, productRow.id));
        for (const key of product.toppingGroupKeys) {
          const groupId = groupIdByKey.get(key);
          if (groupId === undefined) {
            throw new Error(`Product ${product.slug} references unknown topping group key: ${key}`);
          }
          await tx.insert(productToppingGroups).values({ productId: productRow.id, groupId });
          counts.links += 1;
        }
      }
    }
  });

  console.log(
    `Seed complete: ${counts.categories} categories, ${counts.products} products, ` +
      `${counts.variants} variants, ${counts.groups} topping groups, ` +
      `${counts.toppings} toppings, ${counts.prices} topping prices, ${counts.links} product-group links.`,
  );
  await db.$client.end();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
