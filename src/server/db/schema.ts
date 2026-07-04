/**
 * Menu schema — mirrors harness/specs/001-meniu-catalog/05-data-model.md.
 * If the two disagree, one of them is a bug.
 * Prices are integer bani everywhere (see harness/docs/ARCHITECTURE.md).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  unique,
} from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "restrict" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/** Every product has >= 1 variant; single-price products get one with name = null. */
export const productVariants = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name"),
    priceBani: integer("price_bani").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [check("product_variants_price_positive", sql`${t.priceBani} > 0`)],
);

export const toppingGroups = pgTable("topping_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const toppings = pgTable("toppings", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id")
    .notNull()
    .references(() => toppingGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
});

/**
 * Topping price per size label; sizeName matches ProductVariant.name,
 * null = the product's single/default variant.
 */
export const toppingPrices = pgTable(
  "topping_prices",
  {
    id: serial("id").primaryKey(),
    toppingId: integer("topping_id")
      .notNull()
      .references(() => toppings.id, { onDelete: "cascade" }),
    sizeName: text("size_name"),
    priceBani: integer("price_bani").notNull(),
  },
  (t) => [
    unique("topping_prices_topping_size_unique")
      .on(t.toppingId, t.sizeName)
      .nullsNotDistinct(),
    check("topping_prices_price_non_negative", sql`${t.priceBani} >= 0`),
  ],
);

export const productToppingGroups = pgTable(
  "product_topping_groups",
  {
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => toppingGroups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.groupId] })],
);
