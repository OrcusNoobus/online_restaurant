/**
 * Integration tests for the menu feature (repository + seed idempotency).
 * Needs the dev Postgres from docker-compose (./init.sh starts it); the suite
 * migrates and seeds itself. Fixtures use "test-" slugs and clean up after
 * themselves so the seeded data stays untouched.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { eq, gt, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/api/menu/route";
import { db } from "@/server/db/client";
import { categories, products, productVariants, toppingPrices, toppings } from "@/server/db/schema";
import { getMenu } from "@/server/repositories/menu";

interface SeedFile {
  categories: {
    slug: string;
    name: string;
    products: { slug: string; name: string; variants: { name?: string | null; priceBani: number }[] }[];
  }[];
}

const seedFile: SeedFile = JSON.parse(readFileSync("data/menu-seed.json", "utf8"));

// SKIP_DB=1 runs ./init.sh without Docker (e.g. CI); these suites need Postgres.
const skipDb = process.env.SKIP_DB === "1";

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

async function tableCounts(): Promise<number[]> {
  return Promise.all([db.$count(categories), db.$count(products), db.$count(productVariants)]);
}

beforeAll(() => {
  if (skipDb) return;
  run("npm run db:migrate");
  run("npm run db:seed");
}, 120_000);

describe.skipIf(skipDb)("db:seed", () => {
  it("is idempotent: a second run adds no rows", async () => {
    const before = await tableCounts();
    run("npm run db:seed");
    expect(await tableCounts()).toEqual(before);
  }, 120_000);

  it("keeps variant ids stable across re-seeds (002 03-research D4)", async () => {
    const ids = (rows: { id: number }[]) => rows.map(({ id }) => id).sort((a, b) => a - b);
    const before = await db.select({ id: productVariants.id }).from(productVariants);
    run("npm run db:seed");
    const after = await db.select({ id: productVariants.id }).from(productVariants);
    expect(ids(after)).toEqual(ids(before));
  }, 120_000);

  it("applies the SGR transform: deposits on toppings, SGR price zeroed (002 03-research D5)", async () => {
    const withDeposit = await db
      .select({ name: toppings.name, deposit: toppings.sgrDepositBani })
      .from(toppings)
      .where(gt(toppings.sgrDepositBani, 0));
    // "Garanție SGR" + the 8 drink add-ons (02-clarify.md Q15)
    expect(withDeposit).toHaveLength(9);
    expect(withDeposit.every(({ deposit }) => deposit === 50)).toBe(true);

    const sgrTopping = withDeposit.find(({ name }) => name === "Garanție SGR");
    expect(sgrTopping).toBeDefined();
    const [sgrRow] = await db
      .select({ id: toppings.id })
      .from(toppings)
      .where(eq(toppings.name, "Garanție SGR"));
    const sgrPrices = await db
      .select({ priceBani: toppingPrices.priceBani })
      .from(toppingPrices)
      .where(eq(toppingPrices.toppingId, sgrRow.id));
    // its legacy 50-bani "price" moved into sgr_deposit_bani
    expect(sgrPrices.length).toBeGreaterThan(0);
    expect(sgrPrices.every(({ priceBani }) => priceBani === 0)).toBe(true);
  });
});

describe.skipIf(skipDb)("getMenu()", () => {
  it("returns categories in seed order, each product with >= 1 variant", async () => {
    const menu = await getMenu();

    const seedSlugs = seedFile.categories.map((c) => c.slug);
    const menuSeedSlugs = menu.map((c) => c.slug).filter((s) => seedSlugs.includes(s));
    expect(menuSeedSlugs).toEqual(seedSlugs);

    for (const category of menu) {
      expect(category.id).toBeTypeOf("number");
      expect(category.name).not.toBe("");
      for (const product of category.products) {
        expect(product.variants.length).toBeGreaterThanOrEqual(1);
        for (const variant of product.variants) {
          expect(Number.isSafeInteger(variant.priceBani)).toBe(true);
          expect(variant.priceBani).toBeGreaterThan(0);
        }
      }
    }
  });

  it("shows a multi-size pizza once, with its variants in seed order", async () => {
    const seedPizza = seedFile.categories
      .flatMap((c) => c.products)
      .find((p) => p.variants.length >= 3);
    expect(seedPizza).toBeDefined();

    const menuProducts = (await getMenu()).flatMap((c) => c.products);
    const matches = menuProducts.filter((p) => p.slug === seedPizza!.slug);
    expect(matches).toHaveLength(1);
    expect(matches[0].variants.map((v) => v.name)).toEqual(seedPizza!.variants.map((v) => v.name ?? null));
  });

  it("orders products within a category by seed order", async () => {
    const seedCategory = seedFile.categories[0];
    const menuCategory = (await getMenu()).find((c) => c.slug === seedCategory.slug);
    expect(menuCategory).toBeDefined();
    const seedProductSlugs = seedCategory.products.map((p) => p.slug);
    const menuProductSlugs = menuCategory!.products.map((p) => p.slug).filter((s) => seedProductSlugs.includes(s));
    expect(menuProductSlugs).toEqual(seedProductSlugs);
  });

  it("matches the GET /api/menu contract (06-contracts/api.md)", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    // the API returns exactly the repository shape, wrapped in { categories }
    expect(await response.json()).toEqual({ categories: await getMenu() });
  });

  it("hides inactive products and inactive categories, keeps empty active categories", async () => {
    const [activeCategory] = await db
      .insert(categories)
      .values({ slug: "test-cat-active", name: "Test activă", sortOrder: 990 })
      .returning({ id: categories.id });
    const [inactiveCategory] = await db
      .insert(categories)
      .values({ slug: "test-cat-inactive", name: "Test inactivă", sortOrder: 991, active: false })
      .returning({ id: categories.id });
    const [emptyCategory] = await db
      .insert(categories)
      .values({ slug: "test-cat-empty", name: "Test goală", sortOrder: 992 })
      .returning({ id: categories.id });

    const inserted = await db
      .insert(products)
      .values([
        { categoryId: activeCategory.id, slug: "test-prod-active", name: "Produs activ", sortOrder: 0 },
        { categoryId: activeCategory.id, slug: "test-prod-inactive", name: "Produs inactiv", sortOrder: 1, active: false },
        { categoryId: inactiveCategory.id, slug: "test-prod-hidden-cat", name: "Produs din categorie ascunsă", sortOrder: 0 },
      ])
      .returning({ id: products.id });
    await db
      .insert(productVariants)
      .values(inserted.map(({ id }) => ({ productId: id, name: null, priceBani: 1000, sortOrder: 0 })));

    try {
      const menu = await getMenu();
      const bySlug = new Map(menu.map((c) => [c.slug, c]));

      expect(bySlug.get("test-cat-active")?.products.map((p) => p.slug)).toEqual(["test-prod-active"]);
      expect(bySlug.has("test-cat-inactive")).toBe(false);
      // an active category with zero active products IS returned (06-contracts/api.md)
      expect(bySlug.get("test-cat-empty")?.products).toEqual([]);
    } finally {
      await db.delete(products).where(inArray(products.id, inserted.map(({ id }) => id)));
      await db.delete(categories).where(
        inArray(categories.id, [activeCategory.id, inactiveCategory.id, emptyCategory.id]),
      );
    }
  });
});
