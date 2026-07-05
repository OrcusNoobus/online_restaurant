/**
 * Idempotent menu seed: validates data/menu-seed.json (the owner may hand-edit
 * it) and upserts it into Postgres. Run via `npm run db:seed`; running twice
 * must not duplicate anything (001 01-spec.md FR4).
 *
 * Upsert keys: slug for categories/products; (group, name) for toppings;
 * (topping, size) for topping prices; (product, size name) for variants —
 * variant ids are STABLE because order lines reference them (002 03-research D4).
 * Variants dropped from the JSON are deleted; once orders exist, deleting a
 * referenced variant fails loudly (RESTRICT) instead of silently rewriting history.
 * `active` is set only on insert, so re-seeding never reactivates rows the
 * admin has hidden. Rows removed from the JSON stay in the database.
 *
 * SGR transform (002 03-research D5): the JSON stays a faithful legacy
 * snapshot; here the "Garanție SGR" topping becomes price 0 + deposit, and
 * drink add-ons get the deposit on top of their price (002 02-clarify Q15).
 */
import { readFileSync } from "node:fs";

import { and, eq, isNotNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  categories,
  deliveryZones,
  products,
  productToppingGroups,
  productVariants,
  restaurantSettings,
  toppingGroups,
  toppingPrices,
  toppings,
} from "../src/server/db/schema";

/** JSON group keys the SGR transform recognizes (002 05-data-model.md). */
const SGR_GROUP_KEY = "garantie-sgr";
const DRINK_ADDON_GROUP_KEY = "adauga-bautura";

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
      required: z.boolean().default(false),
      displayType: z.enum(["radio", "checkbox"]).default("checkbox"),
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

const zonesSchema = z.object({
  zones: z
    .array(
      z.object({
        slug,
        name: z.string().min(1),
        feeBani: z.number().int().nonnegative(),
        freeFromBani: z.number().int().nonnegative(),
      }),
    )
    .min(1),
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
  const zonesRaw = readFileSync(new URL("../data/delivery-zones.json", import.meta.url), "utf8");
  const zoneSeed = zonesSchema.parse(JSON.parse(zonesRaw));

  assertUnique(seed.categories.map((c) => c.slug), "category slug");
  assertUnique(seed.categories.flatMap((c) => c.products.map((p) => p.slug)), "product slug");
  assertUnique(seed.toppingGroups.map((g) => g.key), "topping group key");
  assertUnique(zoneSeed.zones.map((zone) => zone.slug), "delivery zone slug");

  const counts = { categories: 0, products: 0, variants: 0, groups: 0, toppings: 0, prices: 0, links: 0, zones: 0 };

  // Seed-ownership guard (003 research D7): once an admin edits a domain in
  // the panel, the DB owns it and the seed must not overwrite that section.
  // SEED_FORCE=1 is the deliberate human override — it resets the flags too.
  if (process.env.SEED_FORCE === "1") {
    await db
      .update(restaurantSettings)
      .set({ catalogProtectedSince: null, zonesProtectedSince: null })
      .where(eq(restaurantSettings.id, 1));
    console.log("SEED_FORCE=1: ownership flags reset — seeding every section.");
  }
  const flagRows = await db
    .select({
      catalogProtectedSince: restaurantSettings.catalogProtectedSince,
      zonesProtectedSince: restaurantSettings.zonesProtectedSince,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.id, 1));
  const flags = flagRows[0] ?? { catalogProtectedSince: null, zonesProtectedSince: null };
  const seedZonesSection = flags.zonesProtectedSince === null;
  const seedCatalogSection = flags.catalogProtectedSince === null;
  if (!seedZonesSection) {
    console.error(
      `SKIPPED zones section: delivery zones are admin-owned since ` +
        `${flags.zonesProtectedSince!.toISOString()} (edited in the panel). ` +
        `Run SEED_FORCE=1 npm run db:seed to overwrite them anyway.`,
    );
  }
  if (!seedCatalogSection) {
    console.error(
      `SKIPPED catalog section: the menu is admin-owned since ` +
        `${flags.catalogProtectedSince!.toISOString()} (edited in the panel). ` +
        `Run SEED_FORCE=1 npm run db:seed to overwrite it anyway.`,
    );
  }
  if (!seedZonesSection && !seedCatalogSection) {
    console.error("Nothing to seed — both sections are admin-owned.");
    await db.$client.end();
    return;
  }

  await db.transaction(async (tx) => {
    // Delivery zones: upsert by slug; `active` only on insert (admin may hide zones).
    if (seedZonesSection) {
      for (const [zoneIndex, zone] of zoneSeed.zones.entries()) {
        const zoneValues = {
          slug: zone.slug,
          name: zone.name,
          feeBani: zone.feeBani,
          freeFromBani: zone.freeFromBani,
          sortOrder: zoneIndex,
        };
        await tx
          .insert(deliveryZones)
          .values(zoneValues)
          .onConflictDoUpdate({ target: deliveryZones.slug, set: zoneValues });
        counts.zones += 1;
      }
    }

    if (!seedCatalogSection) return;

    // Topping groups + toppings + per-size prices; groups matched by name
    // (the JSON `key` is not stored — 05-data-model.md defines only `name`).
    const groupIdByKey = new Map<string, number>();
    for (const [groupIndex, group] of seed.toppingGroups.entries()) {
      // SGR transform: the deposit moves out of prices into sgr_deposit_bani
      // so pricing can total it as the separate SGR line (002 03-research D5).
      const isSgrGroup = group.key === SGR_GROUP_KEY;
      const isDrinkAddonGroup = group.key === DRINK_ADDON_GROUP_KEY;
      const sgrDepositBani = isSgrGroup || isDrinkAddonGroup ? seed.sgrDepositBani : 0;

      const groupValues = {
        name: group.name,
        required: group.required,
        displayType: group.displayType,
        sortOrder: groupIndex,
      };
      const existing = await tx
        .select({ id: toppingGroups.id })
        .from(toppingGroups)
        .where(eq(toppingGroups.name, group.name));
      let groupId: number;
      if (existing[0]) {
        groupId = existing[0].id;
        await tx.update(toppingGroups).set(groupValues).where(eq(toppingGroups.id, groupId));
      } else {
        [{ id: groupId }] = await tx
          .insert(toppingGroups)
          .values(groupValues)
          .returning({ id: toppingGroups.id });
      }
      groupIdByKey.set(group.key, groupId);
      counts.groups += 1;

      for (const topping of group.toppings) {
        const found = await tx
          .select({ id: toppings.id })
          .from(toppings)
          .where(and(eq(toppings.groupId, groupId), eq(toppings.name, topping.name)));
        let toppingId: number;
        if (found[0]) {
          toppingId = found[0].id;
          await tx.update(toppings).set({ sgrDepositBani }).where(eq(toppings.id, toppingId));
        } else {
          [{ id: toppingId }] = await tx
            .insert(toppings)
            .values({ groupId, name: topping.name, sgrDepositBani })
            .returning({ id: toppings.id });
        }
        counts.toppings += 1;

        for (const price of topping.prices) {
          // the SGR group's own "price" was the deposit — it lives in sgr_deposit_bani now
          const priceBani = isSgrGroup ? 0 : price.priceBani;
          await tx
            .insert(toppingPrices)
            .values({ toppingId, sizeName: price.sizeName ?? null, priceBani })
            .onConflictDoUpdate({
              target: [toppingPrices.toppingId, toppingPrices.sizeName],
              set: { priceBani },
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

        // Variants upsert by (product, name) — ids stay stable for order lines.
        await tx
          .insert(productVariants)
          .values(
            product.variants.map((variant, variantIndex) => ({
              productId: productRow.id,
              name: variant.name ?? null,
              priceBani: variant.priceBani,
              sortOrder: variantIndex,
            })),
          )
          .onConflictDoUpdate({
            target: [productVariants.productId, productVariants.name],
            set: {
              priceBani: sql`excluded.price_bani`,
              sortOrder: sql`excluded.sort_order`,
            },
          });
        // Drop variants no longer in the JSON. Once orders reference one,
        // the RESTRICT FK makes this fail loudly — a human decision, not data loss.
        const keptNames = product.variants
          .map((variant) => variant.name ?? null)
          .filter((name): name is string => name !== null);
        const keepsNull = product.variants.some((variant) => (variant.name ?? null) === null);
        const staleName = keptNames.length > 0 ? notInArray(productVariants.name, keptNames) : undefined;
        const stale = keepsNull
          ? and(isNotNull(productVariants.name), staleName)
          : or(sql`${productVariants.name} IS NULL`, ...(staleName ? [staleName] : []));
        await tx.delete(productVariants).where(and(eq(productVariants.productId, productRow.id), stale));
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
      `${counts.toppings} toppings, ${counts.prices} topping prices, ${counts.links} product-group links, ` +
      `${counts.zones} delivery zones.`,
  );
  await db.$client.end();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
