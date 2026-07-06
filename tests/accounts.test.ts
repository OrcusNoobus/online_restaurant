/**
 * Integration tests for feat-010 (customer accounts). Needs the dev Postgres
 * from docker-compose (./init.sh starts it); the suite migrates and seeds
 * itself. Fixtures use "test-acc-" emails and clean up after themselves.
 */
import { execSync } from "node:child_process";

import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { customers } from "@/server/db/schema";
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

afterAll(async () => {
  if (skipDb) return;
  // cascades customer_sessions
  await db.delete(customers).where(like(customers.email, "test-acc-%"));
});

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
