/**
 * Menu + ordering schema — mirrors harness/specs/001-meniu-catalog/05-data-model.md
 * and harness/specs/002-cos-comanda/05-data-model.md.
 * If they disagree, one of them is a bug.
 * Prices are integer bani everywhere (see harness/docs/ARCHITECTURE.md).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
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

/**
 * Every product has >= 1 variant; single-price products get one with name = null.
 * (product_id, name) is unique NULLS NOT DISTINCT — the seed upsert key, so
 * variant ids stay stable once order lines reference them (002 03-research D4).
 */
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
  (t) => [
    check("product_variants_price_positive", sql`${t.priceBani} > 0`),
    unique("product_variants_product_name_unique").on(t.productId, t.name).nullsNotDistinct(),
  ],
);

export const toppingGroups = pgTable(
  "topping_groups",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // required groups (Ambalaj, Garanție SGR) block add-to-cart without a selection
    required: boolean("required").notNull().default(false),
    displayType: text("display_type").notNull().default("checkbox"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [check("topping_groups_display_type_valid", sql`${t.displayType} IN ('radio', 'checkbox')`)],
);

export const toppings = pgTable(
  "toppings",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => toppingGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // SGR container deposit per unit — counts toward the order's SGR line, never the subtotal
    sgrDepositBani: integer("sgr_deposit_bani").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [check("toppings_sgr_deposit_non_negative", sql`${t.sgrDepositBani} >= 0`)],
);

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

/**
 * Deliverable localities (002 05-data-model.md). feeBani applies only while
 * (subtotal + SGR) < freeFromBani; at/above the threshold delivery is free.
 */
export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    feeBani: integer("fee_bani").notNull(),
    freeFromBani: integer("free_from_bani").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    check("delivery_zones_fee_non_negative", sql`${t.feeBani} >= 0`),
    check("delivery_zones_free_from_non_negative", sql`${t.freeFromBani} >= 0`),
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

export const orderModeEnum = pgEnum("order_mode", ["delivery", "pickup"]);
/** Full lifecycle defined once (002 03-research D6); feat-006 only creates 'new'. */
export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "accepted",
  "in_delivery",
  "completed",
  "canceled",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card_delivery", "card_restaurant"]);

/**
 * One placed order (002 05-data-model.md). Money and names are snapshots —
 * the menu may change later, the order must not. RESTRICT FKs make catalog
 * deletions with order history loud instead of silent.
 */
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    mode: orderModeEnum("mode").notNull(),
    status: orderStatusEnum("status").notNull().default("new"),
    customerFirstName: text("customer_first_name").notNull(),
    customerLastName: text("customer_last_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    zoneId: integer("zone_id").references(() => deliveryZones.id, { onDelete: "restrict" }),
    addressStreet: text("address_street"),
    notes: text("notes"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    estimateMinutes: integer("estimate_minutes"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    subtotalBani: integer("subtotal_bani").notNull(),
    sgrBani: integer("sgr_bani").notNull().default(0),
    deliveryFeeBani: integer("delivery_fee_bani").notNull().default(0),
    totalBani: integer("total_bani").notNull(),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
    clientIp: text("client_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("orders_subtotal_non_negative", sql`${t.subtotalBani} >= 0`),
    check("orders_sgr_non_negative", sql`${t.sgrBani} >= 0`),
    check("orders_fee_non_negative", sql`${t.deliveryFeeBani} >= 0`),
    check("orders_total_positive", sql`${t.totalBani} > 0`),
    check(
      "orders_total_is_sum",
      sql`${t.totalBani} = ${t.subtotalBani} + ${t.sgrBani} + ${t.deliveryFeeBani}`,
    ),
    check(
      "orders_delivery_has_zone_and_address",
      sql`${t.mode} = 'pickup' OR (${t.zoneId} IS NOT NULL AND ${t.addressStreet} IS NOT NULL)`,
    ),
    check("orders_pickup_has_no_fee", sql`${t.mode} = 'delivery' OR ${t.deliveryFeeBani} = 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    variantName: text("variant_name"),
    unitPriceBani: integer("unit_price_bani").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalBani: integer("line_total_bani").notNull(),
  },
  (t) => [
    check("order_items_unit_price_positive", sql`${t.unitPriceBani} > 0`),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
    check("order_items_line_total_positive", sql`${t.lineTotalBani} > 0`),
  ],
);

export const orderItemOptions = pgTable(
  "order_item_options",
  {
    id: serial("id").primaryKey(),
    orderItemId: integer("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    toppingId: integer("topping_id")
      .notNull()
      .references(() => toppings.id, { onDelete: "restrict" }),
    groupName: text("group_name").notNull(),
    toppingName: text("topping_name").notNull(),
    priceBani: integer("price_bani").notNull(),
    sgrDepositBani: integer("sgr_deposit_bani").notNull().default(0),
  },
  (t) => [
    check("order_item_options_price_non_negative", sql`${t.priceBani} >= 0`),
    check("order_item_options_sgr_non_negative", sql`${t.sgrDepositBani} >= 0`),
  ],
);
