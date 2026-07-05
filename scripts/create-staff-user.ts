/**
 * Install-time staff account creation (003-panou-admin 05-data-model: no
 * signup, no management UI in v1). Run with:
 *
 *   STAFF_PASSWORD='...' npx tsx scripts/create-staff-user.ts \
 *     --username ana --name "Ana" --role admin
 *
 * The password comes from the STAFF_PASSWORD env var or from piped stdin
 * (`echo 'pass' | npx tsx scripts/create-staff-user.ts ...`) — never from
 * argv, which would leak into shell history and `ps` output.
 */
import { parseArgs } from "node:util";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const MIN_PASSWORD_LENGTH = 8;

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  console.error(
    "Usage: STAFF_PASSWORD='...' npx tsx scripts/create-staff-user.ts --username <u> --name <display> --role <admin|staff>",
  );
  process.exit(1);
}

async function readPassword(): Promise<string> {
  if (process.env.STAFF_PASSWORD) return process.env.STAFF_PASSWORD;
  if (process.stdin.isTTY) {
    fail("no password given — set STAFF_PASSWORD or pipe the password on stdin (argv is not accepted)");
  }
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      username: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
    },
  });

  const username = values.username?.trim().toLowerCase();
  const displayName = values.name?.trim();
  const role = values.role;

  if (!username || !USERNAME_PATTERN.test(username)) {
    fail("--username is required: 2-32 chars, lowercase letters/digits/._- (stored lowercase)");
  }
  if (!displayName) fail("--name (display name) is required");
  if (role !== "admin" && role !== "staff") fail("--role must be 'admin' or 'staff'");

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
  const { createUser, findUserByUsername } = await import("../src/server/repositories/staff");
  const { hashPassword } = await import("../src/server/services/auth");

  if (await findUserByUsername(username)) {
    await db.$client.end();
    fail(`username '${username}' already exists`);
  }

  const passwordHash = await hashPassword(password);
  const id = await createUser({ username, displayName, passwordHash, role });
  console.log(`Created staff user #${id}: ${username} (${displayName}), role=${role}`);
  await db.$client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
