/**
 * Menu + ordering + admin + assistant schema — mirrors
 * harness/specs/001-meniu-catalog/05-data-model.md,
 * harness/specs/002-cos-comanda/05-data-model.md,
 * harness/specs/003-panou-admin/05-data-model.md,
 * harness/specs/004-asistent-ai/05-data-model.md and
 * harness/specs/005-conturi-clienti/05-data-model.md.
 * If they disagree, one of them is a bug.
 * Prices are integer bani everywhere (see harness/docs/ARCHITECTURE.md).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
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
  // free text, admin-edited (003 research D8); shown in the options sheet when present
  ingredients: text("ingredients"),
  allergens: text("allergens"),
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
    // availability per size (003 05-data-model): menu omits inactive variants, pricing rejects them
    active: boolean("active").notNull().default(true),
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
/**
 * Full lifecycle defined once (002 03-research D6); feat-006 only creates 'new'.
 * 'ready_for_pickup' added by feat-007 (003 05-data-model): pickup orders go
 * new → accepted → ready_for_pickup → completed instead of in_delivery.
 */
export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "accepted",
  "in_delivery",
  "ready_for_pickup",
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
    // NULL = guest order (or erased account — SET NULL keeps the restaurant
    // record). Set at insert for logged-in checkouts or ONCE by the
    // guest-order backfill; a non-NULL value is never rewritten (010 D4).
    customerId: integer("customer_id").references((): AnyPgColumn => customers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // the "my orders" read path (010 05-data-model)
    index("orders_customer_idx").on(t.customerId),
    // backfill probes: unclaimed rows by normalized phone / lowercase email
    index("orders_claim_phone_idx").on(t.phone).where(sql`${t.customerId} IS NULL`),
    index("orders_claim_email_idx")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.customerId} IS NULL`),
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

export const staffRoleEnum = pgEnum("staff_role", ["admin", "staff"]);

/**
 * Restaurant staff accounts (003 05-data-model). Created only by
 * scripts/create-staff-user.ts at install — no signup, no management UI in v1.
 */
export const staffUsers = pgTable("staff_users", {
  id: serial("id").primaryKey(),
  // stored lowercase — uniqueness is case-insensitive by construction
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  // scrypt, format scrypt:N:r:p:salt:hash (base64url); NEVER plaintext
  passwordHash: text("password_hash").notNull(),
  role: staffRoleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One logged-in device (003 research D1). The opaque token lives only in the
 * httpOnly cookie; the DB stores its SHA-256, so a DB leak yields no usable tokens.
 */
export const staffSessions = pgTable("staff_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  staffUserId: integer("staff_user_id")
    .notNull()
    .references(() => staffUsers.id, { onDelete: "cascade" }),
  // rolling: extended to now + 7 days on authenticated use
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Journal of every status change (003 research D4). orders.status stays the
 * authoritative current state; events are history, attribution, cancel
 * reasons and the undo source. Append-only — undo writes a compensating
 * event, it never deletes.
 */
export const orderStatusEvents = pgTable("order_status_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: orderStatusEnum("from_status").notNull(),
  toStatus: orderStatusEnum("to_status").notNull(),
  // REQUIRED when toStatus='canceled' — service-enforced
  reason: text("reason"),
  staffUserId: integer("staff_user_id")
    .notNull()
    .references(() => staffUsers.id, { onDelete: "restrict" }),
  // set on compensating (undo) events → the event being reverted; an event
  // with this set can NOT itself be undone (no redo ping-pong)
  undoOfEventId: integer("undo_of_event_id").references((): AnyPgColumn => orderStatusEvents.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Live schedule/estimate configuration + per-domain seed-protection flags
 * (003 research D6/D7). Exactly one row, id = 1 — created by migration 0004
 * from the former src/lib/restaurant-config.ts constants. Timezone and
 * address/phone stay in code, not here.
 */
export const restaurantSettings = pgTable(
  "restaurant_settings",
  {
    id: integer("id").primaryKey(),
    // minutes after local midnight (Europe/Bucharest)
    openMinutes: integer("open_minutes").notNull(),
    closeMinutes: integer("close_minutes").notNull(),
    earliestFulfillmentMinutes: integer("earliest_fulfillment_minutes").notNull(),
    deliveryEstimateMinutes: integer("delivery_estimate_minutes").notNull(),
    // non-empty, each > 0 — enforced by zod at the boundary (array CHECK is app-level)
    pickupEstimateOptionsMinutes: integer("pickup_estimate_options_minutes").array().notNull(),
    // null = seed may write the CATALOG section; set by the first admin
    // mutation of categories/products/variants/toppings (SEED_FORCE=1 resets)
    catalogProtectedSince: timestamp("catalog_protected_since", { withTimezone: true }),
    // same, for the ZONES seed section; settings edits set NEITHER flag
    zonesProtectedSince: timestamp("zones_protected_since", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("restaurant_settings_single_row", sql`${t.id} = 1`),
    check(
      "restaurant_settings_hours_valid",
      sql`${t.openMinutes} >= 0 AND ${t.closeMinutes} <= 1440 AND ${t.openMinutes} < ${t.closeMinutes}`,
    ),
    check(
      "restaurant_settings_earliest_after_open",
      sql`${t.earliestFulfillmentMinutes} >= ${t.openMinutes}`,
    ),
    check("restaurant_settings_delivery_estimate_positive", sql`${t.deliveryEstimateMinutes} > 0`),
  ],
);

export const assistantRoleEnum = pgEnum("assistant_role", ["user", "assistant", "tool"]);

/**
 * jsonb shapes per role (004 05-data-model):
 * - user: text; assistant: text OR toolCalls (intermediate tool round);
 * - tool: one tool execution result, isError set only when the run failed.
 */
export type AssistantMessageContent =
  | { text: string }
  | { toolCalls: { id: string; name: string; input: unknown }[] }
  | { toolCallId: string; name: string; result: unknown; isError?: true };

/**
 * One chat conversation on one device (004 05-data-model). The uuid is
 * server-issued and unguessable — it doubles as the access token to the
 * transcript, so it must never be sequential. Deleted (with messages,
 * CASCADE) by retention once last_activity_at is older than 30 days.
 */
export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // same normalization as orders.client_ip; drives the per-IP daily limit
    clientIp: text("client_ip").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // bumped on every appended message; retention scans this index
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assistant_conversations_last_activity_idx").on(t.lastActivityAt)],
);

/**
 * One transcript entry — user text, assistant text/tool-calls, or a tool
 * result (004 05-data-model). content is jsonb, shape per role, validated
 * in code (repositories/assistant.ts). Token counts are observability only
 * (DECISIONS 2026-07-05) and live on assistant rows.
 */
export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => assistantConversations.id, { onDelete: "cascade" }),
    role: assistantRoleEnum("role").notNull(),
    content: jsonb("content").$type<AssistantMessageContent>().notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // transcript reads and the per-conversation counter go by (conversation, id)
  (t) => [index("assistant_messages_conversation_id_idx").on(t.conversationId, t.id)],
);

/**
 * One customer account (005 05-data-model). Email is the account identifier
 * (both v1 methods guarantee one) — stored lowercase, immutable in v1.
 * password_hash NULL = Google-only account; google_sub NULL = password-only;
 * the CHECK forbids a row with neither. Profile fields are the guest-checkout
 * fields (D-b), phone always normalized +40… by phoneSchema at the boundary.
 */
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    // stored lowercase — uniqueness is case-insensitive by construction
    email: text("email").notNull().unique(),
    // scrypt, format scrypt:N:r:p:salt:hash (base64url); NEVER plaintext
    passwordHash: text("password_hash"),
    // Google's stable OIDC `sub` claim; set at Google signup or when linking
    // by verified email (D-e)
    googleSub: text("google_sub").unique(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    // normalized +40…; the PRIMARY guest-order linking key (Q3/Q5); not
    // unique — households share numbers
    phone: text("phone"),
    addressStreet: text("address_street"),
    zoneId: integer("zone_id").references(() => deliveryZones.id, { onDelete: "set null" }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "customers_has_credential",
      sql`${t.passwordHash} IS NOT NULL OR ${t.googleSub} IS NOT NULL`,
    ),
  ],
);

/**
 * One logged-in customer device (005 05-data-model — mirror of
 * staff_sessions with a 30-day rolling TTL). The opaque token lives only in
 * the httpOnly rf_client_session cookie; the DB stores its SHA-256.
 */
export const customerSessions = pgTable("customer_sessions", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  // rolling: extended to now + 30 days on authenticated use (D-a)
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
});
