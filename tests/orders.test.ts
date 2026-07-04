/**
 * Integration tests for feat-006 (cart pricing + order placement + zones).
 * Needs the dev Postgres from docker-compose (./init.sh starts it); the suite
 * migrates and seeds itself. Fixtures use "test-" slugs and clean up after
 * themselves so the seeded data stays untouched.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { GET as getZonesRoute } from "@/app/api/zones/route";
import { db } from "@/server/db/client";
import { deliveryZones } from "@/server/db/schema";
import { getActiveZones } from "@/server/repositories/zones";

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
