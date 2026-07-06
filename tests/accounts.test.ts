/**
 * Integration tests for feat-010 (customer accounts). Needs the dev Postgres
 * from docker-compose (./init.sh starts it); the suite migrates and seeds
 * itself. Fixtures use "test-acc-" emails and clean up after themselves.
 */
import { execSync } from "node:child_process";

import { inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { customers, orders, productVariants } from "@/server/db/schema";
import {
  createCustomer,
  createCustomerSession,
  deleteCustomerSessionByTokenHash,
  findCustomerByEmail,
  findCustomerByGoogleSub,
  findCustomerById,
  findCustomerSessionByTokenHash,
  renewCustomerSession,
  setCustomerGoogleSub,
  sweepExpiredCustomerSessions,
  updateCustomerProfile,
} from "@/server/repositories/customers";
import {
  claimGuestOrders,
  getOrderForCustomer,
  insertOrder,
  listOrdersForCustomer,
  type NewOrder,
} from "@/server/repositories/orders";

// SKIP_DB=1 runs ./init.sh without Docker (e.g. CI); these suites need Postgres.
const skipDb = process.env.SKIP_DB === "1";

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

/** Drizzle wraps pg errors — the violated constraint name travels in `cause`. */
async function violatedConstraint(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { cause?: { constraint?: string } }).cause?.constraint;
  }
}

/** Unique per-run suffix — the suite can rerun after a crashed cleanup. */
const RUN = `${process.pid}-${Date.now()}`;
let seq = 0;
function testEmail(tag: string): string {
  seq += 1;
  return `test-acc-${tag}-${RUN}-${seq}@example.com`;
}

beforeAll(async () => {
  if (skipDb) return;
  run("npm run db:migrate");
  run("npm run db:seed");
  await db.delete(customers).where(like(customers.email, "test-acc-%"));
}, 120_000);

const testOrderIds: number[] = [];

afterAll(async () => {
  if (skipDb) return;
  if (testOrderIds.length > 0) {
    await db.delete(orders).where(inArray(orders.id, testOrderIds));
  }
  // cascades customer_sessions
  await db.delete(customers).where(like(customers.email, "test-acc-%"));
});

/** Minimal valid guest/account order against seeded catalog — pre-priced, pickup. */
async function createTestOrder(input: {
  phone?: string;
  email?: string | null;
  customerId?: number | null;
  quantity?: number;
}): Promise<number> {
  const [variant] = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      name: productVariants.name,
      priceBani: productVariants.priceBani,
    })
    .from(productVariants)
    .limit(1);

  const quantity = input.quantity ?? 1;
  const order: NewOrder = {
    mode: "pickup",
    customerFirstName: "Test",
    customerLastName: "Client",
    phone: input.phone ?? "+40712345678",
    email: input.email ?? null,
    zoneId: null,
    addressStreet: null,
    notes: null,
    scheduledFor: null,
    estimateMinutes: 25,
    paymentMethod: "cash",
    subtotalBani: variant.priceBani * quantity,
    sgrBani: 0,
    deliveryFeeBani: 0,
    totalBani: variant.priceBani * quantity,
    termsAcceptedAt: new Date(),
    clientIp: null,
    customerId: input.customerId,
    items: [
      {
        productId: variant.productId,
        variantId: variant.id,
        productName: "Produs test",
        variantName: variant.name,
        unitPriceBani: variant.priceBani,
        quantity,
        lineTotalBani: variant.priceBani * quantity,
        options: [],
      },
    ],
  };
  const orderId = await insertOrder(order);
  testOrderIds.push(orderId);
  return orderId;
}

async function createTestCustomer(tag: string): Promise<number> {
  return createCustomer({ email: testEmail(tag), passwordHash: "x", termsAcceptedAt: new Date() });
}

describe.skipIf(skipDb)("customers repository (T02)", () => {
  it("round-trips a customer through create and the three lookups", async () => {
    const email = testEmail("roundtrip");
    const id = await createCustomer({
      email,
      passwordHash: "scrypt:1:1:1:salt:hash",
      firstName: "Ana",
      phone: "+40712345678",
      termsAcceptedAt: new Date(),
    });

    const byId = await findCustomerById(id);
    expect(byId?.email).toBe(email);
    expect(byId?.passwordHash).toBe("scrypt:1:1:1:salt:hash");
    expect(byId?.googleSub).toBeNull();
    expect(byId?.firstName).toBe("Ana");
    expect(byId?.phone).toBe("+40712345678");

    expect((await findCustomerByEmail(email))?.id).toBe(id);
    expect(await findCustomerByEmail("nu-exista@example.com")).toBeNull();

    await setCustomerGoogleSub(id, `sub-${RUN}`);
    expect((await findCustomerByGoogleSub(`sub-${RUN}`))?.id).toBe(id);
  });

  it("rejects a second customer with the same email (unique, stored lowercase)", async () => {
    const email = testEmail("dup");
    await createCustomer({ email, passwordHash: "x", termsAcceptedAt: new Date() });
    expect(
      await violatedConstraint(createCustomer({ email, passwordHash: "y", termsAcceptedAt: new Date() })),
    ).toBe("customers_email_unique");
  });

  it("rejects a customer with neither password nor google sub (has_credential CHECK)", async () => {
    expect(
      await violatedConstraint(
        db.insert(customers).values({ email: testEmail("nocred"), termsAcceptedAt: new Date() }),
      ),
    ).toBe("customers_has_credential");
  });

  it("updates profile fields without touching credentials", async () => {
    const email = testEmail("patch");
    const id = await createCustomer({ email, passwordHash: "x", termsAcceptedAt: new Date() });
    await updateCustomerProfile(id, {
      firstName: "Ion",
      lastName: "Pop",
      phone: "+40711111111",
      addressStreet: "Str. Test 1",
    });
    const row = await findCustomerById(id);
    expect(row?.firstName).toBe("Ion");
    expect(row?.addressStreet).toBe("Str. Test 1");
    expect(row?.email).toBe(email);
    expect(row?.passwordHash).toBe("x");
  });

  it("round-trips, renews, deletes and sweeps sessions", async () => {
    const id = await createCustomer({
      email: testEmail("sessions"),
      passwordHash: "x",
      termsAcceptedAt: new Date(),
    });
    const future = new Date(Date.now() + 60_000);

    await createCustomerSession(`hash-a-${RUN}`, id, future);
    const found = await findCustomerSessionByTokenHash(`hash-a-${RUN}`);
    expect(found?.customer.id).toBe(id);
    expect(found?.expiresAt.getTime()).toBe(future.getTime());

    const later = new Date(Date.now() + 120_000);
    await renewCustomerSession(found!.id, later, new Date());
    expect((await findCustomerSessionByTokenHash(`hash-a-${RUN}`))?.expiresAt.getTime()).toBe(
      later.getTime(),
    );

    await deleteCustomerSessionByTokenHash(`hash-a-${RUN}`);
    expect(await findCustomerSessionByTokenHash(`hash-a-${RUN}`)).toBeNull();

    // expired rows disappear on sweep; live rows survive
    const past = new Date(Date.now() - 1000);
    await createCustomerSession(`hash-expired-${RUN}`, id, past);
    await createCustomerSession(`hash-live-${RUN}`, id, future);
    await sweepExpiredCustomerSessions(new Date());
    expect(await findCustomerSessionByTokenHash(`hash-expired-${RUN}`)).toBeNull();
    expect(await findCustomerSessionByTokenHash(`hash-live-${RUN}`)).not.toBeNull();
  });
});

describe.skipIf(skipDb)("orders ownership + guest-order linking (T03)", () => {
  it("stamps customer_id at insert when given, NULL when absent", async () => {
    const customerId = await createTestCustomer("stamp");
    const owned = await createTestOrder({ customerId });
    const guest = await createTestOrder({});

    const rows = await db
      .select({ id: orders.id, customerId: orders.customerId })
      .from(orders)
      .where(inArray(orders.id, [owned, guest]));
    expect(rows.find((r) => r.id === owned)?.customerId).toBe(customerId);
    expect(rows.find((r) => r.id === guest)?.customerId).toBeNull();
  });

  it("claims unclaimed guest orders by phone — first claim wins, second gets none", async () => {
    const phone = `+4073${String(Date.now()).slice(-7)}`;
    const a = await createTestOrder({ phone });
    const b = await createTestOrder({ phone });
    await createTestOrder({ phone: "+40799999999" }); // different phone — untouched

    const first = await createTestCustomer("claim1");
    expect(await claimGuestOrders(first, { phone })).toBe(2);

    const second = await createTestCustomer("claim2");
    expect(await claimGuestOrders(second, { phone })).toBe(0);

    const rows = await db
      .select({ id: orders.id, customerId: orders.customerId })
      .from(orders)
      .where(inArray(orders.id, [a, b]));
    expect(rows.every((r) => r.customerId === first)).toBe(true);
  });

  it("claims by lowercase email regardless of how the guest typed it", async () => {
    const email = testEmail("claimmail");
    const orderId = await createTestOrder({ email: email.toUpperCase() });
    const customerId = await createTestCustomer("claimer");

    expect(await claimGuestOrders(customerId, { emailLower: email })).toBe(1);
    const [row] = await db
      .select({ customerId: orders.customerId })
      .from(orders)
      .where(inArray(orders.id, [orderId]));
    expect(row.customerId).toBe(customerId);
  });

  it("claims nothing when no keys are provided", async () => {
    const customerId = await createTestCustomer("nokeys");
    expect(await claimGuestOrders(customerId, {})).toBe(0);
    expect(await claimGuestOrders(customerId, { phone: null, emailLower: null })).toBe(0);
  });

  it("lists ONLY the owner's orders, newest first, with item counts", async () => {
    const alice = await createTestCustomer("alice");
    const bob = await createTestCustomer("bob");
    const older = await createTestOrder({ customerId: alice });
    const newer = await createTestOrder({ customerId: alice, quantity: 2 });
    await createTestOrder({ customerId: bob });

    const list = await listOrdersForCustomer(alice, 20);
    expect(list.map((o) => o.id)).toEqual([newer, older]);
    expect(list[0].itemCount).toBe(1);
    expect(list[0].totalBani).toBeGreaterThan(0);
    expect(await listOrdersForCustomer(bob, 20)).toHaveLength(1);
  });

  it("detail answers for the owner and stays silent for everyone else", async () => {
    const owner = await createTestCustomer("owner");
    const other = await createTestCustomer("other");
    const orderId = await createTestOrder({ customerId: owner });

    const detail = await getOrderForCustomer(orderId, owner);
    expect(detail?.status).toBe("new");
    expect(detail?.mode).toBe("pickup");
    expect(detail?.totalBani).toBeGreaterThan(0);

    expect(await getOrderForCustomer(orderId, other)).toBeNull();
    expect(await getOrderForCustomer(99_999_999, owner)).toBeNull();
  });
});
