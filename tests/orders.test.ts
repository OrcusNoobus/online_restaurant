/**
 * Integration tests for feat-006 (cart pricing + order placement + zones).
 * Needs the dev Postgres from docker-compose (./init.sh starts it); the suite
 * migrates and seeds itself. Fixtures use "test-" slugs and clean up after
 * themselves so the seeded data stays untouched.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { POST as postQuoteRoute } from "@/app/api/cart/quote/route";
import { POST as postOrderRoute } from "@/app/api/orders/route";
import { GET as getZonesRoute } from "@/app/api/zones/route";
import { orderRequestSchema } from "@/lib/order-schemas";
import { db } from "@/server/db/client";
import {
  deliveryZones,
  orderItemOptions,
  orderItems,
  orders,
  products,
  productVariants,
  toppingGroups,
  toppings,
} from "@/server/db/schema";
import { insertOrder, type NewOrder } from "@/server/repositories/orders";
import { getActiveZones } from "@/server/repositories/zones";
import { placeOrder } from "@/server/services/orders";
import { type QuoteReason, quoteCart } from "@/server/services/pricing";

interface ZonesFile {
  zones: { slug: string; name: string; feeBani: number; freeFromBani: number }[];
}

const zonesFile: ZonesFile = JSON.parse(readFileSync("data/delivery-zones.json", "utf8"));

// SKIP_DB=1 runs ./init.sh without Docker (e.g. CI); these suites need Postgres.
const skipDb = process.env.SKIP_DB === "1";

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

beforeAll(() => {
  if (skipDb) return;
  run("npm run db:migrate");
  run("npm run db:seed");
}, 120_000);

/** Seeded fixture: ids for a product, one of its variants, and named toppings. */
async function findProduct(slug: string, variantName: string | null) {
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  const variantRows = await db
    .select({ id: productVariants.id, name: productVariants.name })
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  const variant = variantRows.find(({ name }) => name === variantName)!;
  return { productId: product.id, variantId: variant.id };
}

async function findTopping(groupName: string, name: string): Promise<number> {
  const rows = await db
    .select({ id: toppings.id })
    .from(toppings)
    .innerJoin(toppingGroups, eq(toppings.groupId, toppingGroups.id))
    .where(and(eq(toppingGroups.name, groupName), eq(toppings.name, name)));
  expect(rows).toHaveLength(1);
  return rows[0].id;
}

function codesOf(result: Awaited<ReturnType<typeof quoteCart>>): QuoteReason["code"][] {
  return result.ok ? [] : result.reasons.map(({ code }) => code);
}

describe.skipIf(skipDb)("delivery zones", () => {
  it("seeds every zone from data/delivery-zones.json with its fee and threshold", async () => {
    const zones = await getActiveZones();
    expect(zones.map(({ slug, name, feeBani, freeFromBani }) => ({ slug, name, feeBani, freeFromBani }))).toEqual(
      zonesFile.zones,
    );
  });

  it("GET /api/zones matches the contract and hides inactive zones", async () => {
    const [hidden] = await db
      .insert(deliveryZones)
      .values({ slug: "test-zone-inactive", name: "Test Zonă", feeBani: 100, freeFromBani: 200, active: false })
      .returning({ id: deliveryZones.id });

    try {
      const response = await getZonesRoute();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as { zones: { slug: string }[] };
      expect(body).toEqual({ zones: await getActiveZones() });
      expect(body.zones.some((zone) => zone.slug === "test-zone-inactive")).toBe(false);
    } finally {
      await db.delete(deliveryZones).where(eq(deliveryZones.id, hidden.id));
    }
  });

  it("re-seeding keeps admin-hidden zones hidden (active only on insert)", async () => {
    const [seeded] = await db
      .select({ id: deliveryZones.id })
      .from(deliveryZones)
      .where(eq(deliveryZones.slug, "corunca"));
    await db.update(deliveryZones).set({ active: false }).where(eq(deliveryZones.id, seeded.id));

    try {
      run("npm run db:seed");
      const [after] = await db
        .select({ active: deliveryZones.active })
        .from(deliveryZones)
        .where(eq(deliveryZones.id, seeded.id));
      expect(after.active).toBe(false);
    } finally {
      await db.update(deliveryZones).set({ active: true }).where(eq(deliveryZones.id, seeded.id));
    }
  }, 120_000);
});

describe.skipIf(skipDb)("quoteCart()", () => {
  it("prices toppings by the chosen size (Ambalaj: 300 on 30cm, 400 on 40cm)", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const pizza40 = await findProduct("pizza-bambini", "40 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const sosId = await findTopping("Adauga un sos", "Sos Dulce 80 ml");

    const small = await quoteCart({
      mode: "pickup",
      items: [{ ...pizza30, quantity: 1, toppingIds: [ambalajId, sosId] }],
    });
    expect(small.ok).toBe(true);
    if (small.ok) {
      // 3700 (30cm) + 300 (ambalaj 30cm) + 500 (sos)
      expect(small.quote.subtotalBani).toBe(4500);
      expect(small.quote.sgrBani).toBe(0);
      expect(small.quote.totalBani).toBe(4500);
    }

    const big = await quoteCart({
      mode: "pickup",
      items: [{ ...pizza40, quantity: 1, toppingIds: [ambalajId, sosId] }],
    });
    expect(big.ok).toBe(true);
    // 4700 (40cm) + 400 (ambalaj 40cm) + 500 (sos)
    if (big.ok) expect(big.quote.subtotalBani).toBe(5600);
  });

  it("totals SGR separately for drinks (base price + deposit line)", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");

    const result = await quoteCart({
      mode: "delivery",
      zoneSlug: "santana-de-mures",
      items: [{ ...heineken, quantity: 2, toppingIds: [sgrId] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2 × 1100 base; 2 × 50 SGR as its own line; below 4000 → fee 2000
    expect(result.quote.subtotalBani).toBe(2200);
    expect(result.quote.sgrBani).toBe(100);
    expect(result.quote.deliveryFeeBani).toBe(2000);
    expect(result.quote.freeDeliveryGapBani).toBe(4000 - 2300);
    expect(result.quote.totalBani).toBe(2200 + 100 + 2000);
    const sgrOption = result.quote.items[0].options.find(({ toppingName }) => toppingName === "Garanție SGR");
    expect(sgrOption).toMatchObject({ priceBani: 0, sgrDepositBani: 50 });
  });

  it("applies the zone fee below the threshold and drops it at the threshold (two zones)", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const item = { ...pizza30, quantity: 1, toppingIds: [ambalajId] }; // 3700 + 300 = 4000

    // Sântana: freeFrom 4000 → exactly at threshold → free delivery
    const atThreshold = await quoteCart({ mode: "delivery", zoneSlug: "santana-de-mures", items: [item] });
    expect(atThreshold.ok).toBe(true);
    if (atThreshold.ok) {
      expect(atThreshold.quote.deliveryFeeBani).toBe(0);
      expect(atThreshold.quote.freeDeliveryGapBani).toBe(0);
      expect(atThreshold.quote.totalBani).toBe(4000);
    }

    // Sâncraiu: fee 3000, freeFrom 5000 → below threshold → fee applies, order NOT blocked
    const below = await quoteCart({ mode: "delivery", zoneSlug: "sancraiu-de-mures", items: [item] });
    expect(below.ok).toBe(true);
    if (below.ok) {
      expect(below.quote.deliveryFeeBani).toBe(3000);
      expect(below.quote.freeDeliveryGapBani).toBe(1000);
      expect(below.quote.totalBani).toBe(7000);
    }
  });

  it("never charges a delivery fee for pickup", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const result = await quoteCart({
      mode: "pickup",
      items: [{ ...heineken, quantity: 1, toppingIds: [sgrId] }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.deliveryFeeBani).toBe(0);
      expect(result.quote.freeDeliveryGapBani).toBe(0);
      expect(result.quote.totalBani).toBe(1150);
    }
  });

  it("rejects a required group left unselected, with the group name", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const result = await quoteCart({
      mode: "pickup",
      items: [{ ...pizza30, quantity: 1, toppingIds: [] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContainEqual(
        expect.objectContaining({ code: "missing_required_group", groupName: "Ambalaj", itemIndex: 0 }),
      );
    }
  });

  it("rejects cart-shape violations with per-item reason codes", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const heineken = await findProduct("heineken-0-5-l", null);
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");

    expect(codesOf(await quoteCart({ mode: "pickup", items: [] }))).toEqual(["empty_cart"]);

    // variant of another product
    const mismatch = await quoteCart({
      mode: "pickup",
      items: [{ productId: pizza30.productId, variantId: heineken.variantId, quantity: 1, toppingIds: [ambalajId] }],
    });
    expect(codesOf(mismatch)).toContain("variant_mismatch");

    // SGR group is not attached to pizza
    const notAllowed = await quoteCart({
      mode: "pickup",
      items: [{ ...pizza30, quantity: 1, toppingIds: [ambalajId, sgrId] }],
    });
    expect(codesOf(notAllowed)).toContain("topping_not_allowed");

    const duplicate = await quoteCart({
      mode: "pickup",
      items: [{ ...pizza30, quantity: 1, toppingIds: [ambalajId, ambalajId] }],
    });
    expect(codesOf(duplicate)).toContain("duplicate_topping");

    const unknownProduct = await quoteCart({
      mode: "pickup",
      items: [{ productId: 999_999, variantId: 1, quantity: 1, toppingIds: [] }],
    });
    expect(codesOf(unknownProduct)).toContain("product_not_found");
  });

  it("rejects unknown/missing zones only for delivery", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const items = [{ ...heineken, quantity: 1, toppingIds: [sgrId] }];

    expect(codesOf(await quoteCart({ mode: "delivery", items }))).toEqual(["zone_required"]);
    expect(codesOf(await quoteCart({ mode: "delivery", zoneSlug: "atlantida", items }))).toEqual(["zone_unknown"]);
    expect(codesOf(await quoteCart({ mode: "pickup", items }))).toEqual([]);
  });

  it("reports inactive products and inactive toppings distinctly", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");
    const sosId = await findTopping("Adauga un sos", "Sos Dulce 80 ml");

    await db.update(products).set({ active: false }).where(eq(products.id, pizza30.productId));
    try {
      const inactiveProduct = await quoteCart({
        mode: "pickup",
        items: [{ ...pizza30, quantity: 1, toppingIds: [ambalajId] }],
      });
      expect(codesOf(inactiveProduct)).toEqual(["product_inactive"]);
    } finally {
      await db.update(products).set({ active: true }).where(eq(products.id, pizza30.productId));
    }

    await db.update(toppings).set({ active: false }).where(eq(toppings.id, sosId));
    try {
      const inactiveTopping = await quoteCart({
        mode: "pickup",
        items: [{ ...pizza30, quantity: 1, toppingIds: [ambalajId, sosId] }],
      });
      expect(codesOf(inactiveTopping)).toContain("topping_inactive");
    } finally {
      await db.update(toppings).set({ active: true }).where(eq(toppings.id, sosId));
    }
  });
});

describe.skipIf(skipDb)("insertOrder()", () => {
  function pickupOrderDraft(item: { productId: number; variantId: number }, unitPriceBani: number): NewOrder {
    return {
      mode: "pickup",
      customerFirstName: "Test",
      customerLastName: "Client",
      phone: "+40740000000",
      email: null,
      zoneId: null,
      addressStreet: null,
      notes: null,
      scheduledFor: null,
      estimateMinutes: 15,
      paymentMethod: "cash",
      subtotalBani: unitPriceBani,
      sgrBani: 0,
      deliveryFeeBani: 0,
      totalBani: unitPriceBani,
      termsAcceptedAt: new Date(),
      clientIp: "127.0.0.1",
      items: [
        {
          ...item,
          productName: "Test",
          variantName: null,
          unitPriceBani,
          quantity: 1,
          lineTotalBani: unitPriceBani,
          options: [],
        },
      ],
    };
  }

  it("is atomic: a failing line rolls back the whole order", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const countBefore = await db.$count(orders);

    const draft = pickupOrderDraft(heineken, 1100);
    draft.items.push({
      productId: heineken.productId,
      variantId: heineken.variantId,
      productName: "Test",
      variantName: null,
      unitPriceBani: 1100,
      quantity: 1,
      lineTotalBani: 1100,
      options: [
        // FK violation: no such topping
        { toppingId: 999_999, groupName: "X", toppingName: "X", priceBani: 0, sgrDepositBani: 0 },
      ],
    });

    await expect(insertOrder(draft)).rejects.toThrow();
    expect(await db.$count(orders)).toBe(countBefore);
  });

  it("blocks deleting a variant referenced by an order (RESTRICT, loud seed failure)", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const orderId = await insertOrder(pickupOrderDraft(heineken, 1100));

    try {
      await expect(
        db.delete(productVariants).where(eq(productVariants.id, heineken.variantId)),
      ).rejects.toThrow();
    } finally {
      await db.delete(orders).where(eq(orders.id, orderId));
    }
  });
});

describe.skipIf(skipDb)("placeOrder()", () => {
  // Saturday 2026-07-04, 18:00 restaurant time (EEST = UTC+3) — open.
  const OPEN_NOW = new Date("2026-07-04T15:00:00Z");
  const CLOSED_NOW = new Date("2026-07-04T20:31:00Z"); // 23:31 local

  async function orderBody(overrides: Record<string, unknown> = {}) {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    return orderRequestSchema.parse({
      mode: "delivery",
      zoneSlug: "santana-de-mures",
      items: [{ ...heineken, quantity: 2, toppingIds: [sgrId] }],
      customer: { firstName: "Ion", lastName: "Pop", phone: "0740123456", email: null },
      addressStreet: "Str. Principală 10",
      notes: "interfon 12",
      scheduledFor: null,
      paymentMethod: "cash",
      termsAccepted: true,
      ...overrides,
    });
  }

  async function cleanupOrder(orderId: number) {
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  it("places a delivery order: status new, snapshots, normalized phone, IP, totals", async () => {
    const result = await placeOrder(await orderBody(), { clientIp: "5.15.30.53", now: OPEN_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    try {
      expect(result.order).toMatchObject({
        orderNumber: `#${result.order.orderId}`,
        status: "new",
        mode: "delivery",
        estimateMinutes: 60,
        subtotalBani: 2200,
        sgrBani: 100,
        deliveryFeeBani: 2000,
        totalBani: 4300,
      });

      const [row] = await db.select().from(orders).where(eq(orders.id, result.order.orderId));
      expect(row).toMatchObject({
        status: "new",
        phone: "+40740123456",
        clientIp: "5.15.30.53",
        addressStreet: "Str. Principală 10",
        totalBani: 4300,
      });
      expect(row.zoneId).not.toBeNull();

      const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, result.order.orderId));
      expect(itemRows).toHaveLength(1);
      expect(itemRows[0]).toMatchObject({ productName: "Heineken 0,5 L", unitPriceBani: 1100, quantity: 2 });

      const optionRows = await db
        .select()
        .from(orderItemOptions)
        .where(eq(orderItemOptions.orderItemId, itemRows[0].id));
      expect(optionRows).toContainEqual(
        expect.objectContaining({ toppingName: "Garanție SGR", priceBani: 0, sgrDepositBani: 50 }),
      );
    } finally {
      await cleanupOrder(result.order.orderId);
    }
  });

  it("places a pickup order with the chosen estimate and no fee/zone", async () => {
    const body = await orderBody({
      mode: "pickup",
      zoneSlug: undefined,
      addressStreet: null,
      paymentMethod: "card_restaurant",
      pickupEstimateMinutes: 25,
    });
    const result = await placeOrder(body, { clientIp: null, now: OPEN_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    try {
      expect(result.order).toMatchObject({ mode: "pickup", estimateMinutes: 25, deliveryFeeBani: 0, totalBani: 2300 });
      const [row] = await db.select().from(orders).where(eq(orders.id, result.order.orderId));
      expect(row.zoneId).toBeNull();
      expect(row.deliveryFeeBani).toBe(0);
    } finally {
      await cleanupOrder(result.order.orderId);
    }
  });

  it("stores a valid scheduled time and leaves the estimate null", async () => {
    // 20:00 restaurant time = 17:00Z on an open day
    const body = await orderBody({ scheduledFor: "2026-07-04T17:00:00Z" });
    const result = await placeOrder(body, { clientIp: null, now: OPEN_NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    try {
      expect(result.order.estimateMinutes).toBeNull();
      expect(result.order.scheduledFor).toBe(new Date("2026-07-04T17:00:00Z").toISOString());
    } finally {
      await cleanupOrder(result.order.orderId);
    }
  });

  it("rejects placement while closed, bad schedules and mode-mismatched payment", async () => {
    const closed = await placeOrder(await orderBody(), { clientIp: null, now: CLOSED_NOW });
    expect(closed).toMatchObject({ ok: false, error: "invalid_order" });
    if (!closed.ok && closed.error === "invalid_order") {
      expect(closed.reasons).toContainEqual(expect.objectContaining({ code: "shop_closed" }));
    }

    // scheduled before the 11:30 fulfillment floor (08:15Z = 11:15 local); now = 11:00 local
    const tooEarly = await placeOrder(await orderBody({ scheduledFor: "2026-07-04T08:15:00Z" }), {
      clientIp: null,
      now: new Date("2026-07-04T08:00:00Z"),
    });
    if (!tooEarly.ok && tooEarly.error === "invalid_order") {
      expect(tooEarly.reasons).toContainEqual(expect.objectContaining({ code: "schedule_out_of_hours" }));
    } else {
      expect.unreachable("expected invalid_order");
    }

    // next-day scheduling is v1-forbidden (Q16)
    const nextDay = await placeOrder(await orderBody({ scheduledFor: "2026-07-05T10:00:00Z" }), {
      clientIp: null,
      now: OPEN_NOW,
    });
    if (!nextDay.ok && nextDay.error === "invalid_order") {
      expect(nextDay.reasons).toContainEqual(expect.objectContaining({ code: "schedule_out_of_hours" }));
    } else {
      expect.unreachable("expected invalid_order");
    }

    // card_restaurant is a pickup-only method
    const badPayment = await placeOrder(await orderBody({ paymentMethod: "card_restaurant" }), {
      clientIp: null,
      now: OPEN_NOW,
    });
    if (!badPayment.ok && badPayment.error === "invalid_order") {
      expect(badPayment.reasons).toContainEqual(expect.objectContaining({ code: "payment_not_allowed_for_mode" }));
    } else {
      expect.unreachable("expected invalid_order");
    }
  });

  it("propagates cart problems as invalid_cart without writing anything", async () => {
    const countBefore = await db.$count(orders);
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const body = await orderBody({ items: [{ ...pizza30, quantity: 1, toppingIds: [] }] });
    const result = await placeOrder(body, { clientIp: null, now: OPEN_NOW });
    expect(result).toMatchObject({ ok: false, error: "invalid_cart" });
    expect(await db.$count(orders)).toBe(countBefore);
  });

  it("zod rejects bad phones, missing delivery address and unaccepted terms", async () => {
    const heineken = await findProduct("heineken-0-5-l", null);
    const sgrId = await findTopping("Garantie SGR", "Garanție SGR");
    const base = {
      mode: "delivery",
      zoneSlug: "santana-de-mures",
      items: [{ ...heineken, quantity: 1, toppingIds: [sgrId] }],
      customer: { firstName: "Ion", lastName: "Pop", phone: "0740123456" },
      addressStreet: "Str. Principală 10",
      paymentMethod: "cash",
      termsAccepted: true,
    };

    expect(orderRequestSchema.safeParse(base).success).toBe(true);
    expect(
      orderRequestSchema.safeParse({ ...base, customer: { ...base.customer, phone: "12345" } }).success,
    ).toBe(false);
    expect(orderRequestSchema.safeParse({ ...base, addressStreet: null }).success).toBe(false);
    expect(orderRequestSchema.safeParse({ ...base, termsAccepted: false }).success).toBe(false);
  });
});

describe.skipIf(skipDb)("POST /api/orders", () => {
  function orderRequest(body: unknown): Request {
    return new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "5.15.30.53, 10.0.0.1" },
      body: JSON.stringify(body),
    });
  }

  it("answers 400 for shape violations and 422 for cart problems", async () => {
    const badShape = await postOrderRoute(orderRequest({ mode: "delivery", items: [] }));
    expect(badShape.status).toBe(400);
    expect((await badShape.json()).error).toBe("validation");

    const heineken = await findProduct("heineken-0-5-l", null);
    const emptyRequired = await postOrderRoute(
      orderRequest({
        mode: "pickup",
        items: [{ ...heineken, quantity: 1, toppingIds: [] }],
        customer: { firstName: "Ion", lastName: "Pop", phone: "0740123456" },
        paymentMethod: "cash",
        termsAccepted: true,
      }),
    );
    expect(emptyRequired.status).toBe(422);
    const body = await emptyRequired.json();
    expect(body.error).toBe("invalid_cart");
    expect(body.reasons).toContainEqual(expect.objectContaining({ code: "missing_required_group" }));
  });
});

describe.skipIf(skipDb)("POST /api/cart/quote", () => {
  function quoteRequest(body: unknown): Request {
    return new Request("http://localhost/api/cart/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns the contract shape on success (no zone leak)", async () => {
    const pizza30 = await findProduct("pizza-bambini", "30 cm");
    const ambalajId = await findTopping("Ambalaj", "Ambalaj");

    const response = await postQuoteRoute(
      quoteRequest({
        mode: "delivery",
        zoneSlug: "targu-mures",
        items: [{ ...pizza30, quantity: 1, toppingIds: [ambalajId] }],
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // coupon + discountBani joined the contract at feat-011 (006 06-contracts)
    expect(Object.keys(body).sort()).toEqual([
      "coupon",
      "deliveryFeeBani",
      "discountBani",
      "freeDeliveryGapBani",
      "items",
      "sgrBani",
      "subtotalBani",
      "totalBani",
    ]);
    expect(body.items[0]).toMatchObject({
      productName: "Pizza Bambini",
      variantName: "30 cm",
      unitPriceBani: 3700,
      lineTotalBani: 4000,
    });
  });

  it("answers 400 for malformed shapes and 422 for semantic failures", async () => {
    const badShape = await postQuoteRoute(quoteRequest({ mode: "teleport", items: [] }));
    expect(badShape.status).toBe(400);
    expect((await badShape.json()).error).toBe("validation");

    const semantic = await postQuoteRoute(quoteRequest({ mode: "pickup", items: [] }));
    expect(semantic.status).toBe(422);
    const semanticBody = await semantic.json();
    expect(semanticBody.error).toBe("invalid_cart");
    expect(semanticBody.reasons).toContainEqual(expect.objectContaining({ code: "empty_cart" }));
  });
});
