/**
 * Operator CLI for the phone-call password recovery (005-conturi-clienti
 * 03-research Q4 note: no transactional email in v1, so a forgotten password
 * is fixed by the operator on the host). Run with:
 *
 *   CUSTOMER_PASSWORD='...' npx tsx scripts/set-customer-password.ts \
 *     --email client@example.com
 *
 * The password comes from the CUSTOMER_PASSWORD env var or from piped stdin
 * (`echo 'pass' | npx tsx scripts/set-customer-password.ts ...`) — never from
 * argv, which would leak into shell history and `ps` output.
 */
import { parseArgs } from "node:util";

const MIN_PASSWORD_LENGTH = 8;

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  console.error(
    "Usage: CUSTOMER_PASSWORD='...' npx tsx scripts/set-customer-password.ts --email <email>",
  );
  process.exit(1);
}

async function readPassword(): Promise<string> {
  if (process.env.CUSTOMER_PASSWORD) return process.env.CUSTOMER_PASSWORD;
  if (process.stdin.isTTY) {
    fail("no password given — set CUSTOMER_PASSWORD or pipe the password on stdin (argv is not accepted)");
  }
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
    },
  });

  const email = values.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    fail("--email is required (the account's email, matched case-insensitively)");
  }

  const password = await readPassword();
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env — DATABASE_URL must come from the environment
  }
  // import after env load, same as scripts/seed.ts — the db client reads DATABASE_URL at import time
  const { db } = await import("../src/server/db/client");
  const { findCustomerByEmail, setCustomerPasswordHash } = await import(
    "../src/server/repositories/customers"
  );
  const { hashPassword } = await import("../src/server/auth/primitives");

  const customer = await findCustomerByEmail(email);
  if (!customer) {
    await db.$client.end();
    fail(`no customer account with email '${email}'`);
  }

  const passwordHash = await hashPassword(password);
  await setCustomerPasswordHash(customer.id, passwordHash);
  console.log(`Password updated for customer #${customer.id} (${customer.email})`);
  await db.$client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
