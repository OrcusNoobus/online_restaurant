/**
 * Delivery zone reads + admin mutations. Public shape mirrors
 * 002-cos-comanda/06-contracts/api.md (active only, sorted); the admin list/
 * create/patch surface is 003-panou-admin (all zones, deactivate-never-delete
 * — past orders hold RESTRICT references).
 */
import { asc, eq, sql } from "drizzle-orm";

import { slugify } from "@/lib/admin-schemas";

import { db } from "../db/client";
import { deliveryZones } from "../db/schema";

export interface DeliveryZoneRow {
  id: number;
  slug: string;
  name: string;
  feeBani: number;
  freeFromBani: number;
}

export async function getActiveZones(): Promise<DeliveryZoneRow[]> {
  return db
    .select({
      id: deliveryZones.id,
      slug: deliveryZones.slug,
      name: deliveryZones.name,
      feeBani: deliveryZones.feeBani,
      freeFromBani: deliveryZones.freeFromBani,
    })
    .from(deliveryZones)
    .where(eq(deliveryZones.active, true))
    .orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.id));
}

export interface AdminZoneRow extends DeliveryZoneRow {
  sortOrder: number;
  active: boolean;
}

const adminZoneColumns = {
  id: deliveryZones.id,
  slug: deliveryZones.slug,
  name: deliveryZones.name,
  feeBani: deliveryZones.feeBani,
  freeFromBani: deliveryZones.freeFromBani,
  sortOrder: deliveryZones.sortOrder,
  active: deliveryZones.active,
};

/** The admin list: ALL zones including inactive (the public route stays active-only). */
export async function listAllZones(): Promise<AdminZoneRow[]> {
  return db.select(adminZoneColumns).from(deliveryZones).orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.id));
}

export interface NewZoneInput {
  name: string;
  feeBani: number;
  freeFromBani: number;
  sortOrder?: number;
}

export type CreateZoneResult = { ok: true; zone: AdminZoneRow } | { ok: false; error: "name_taken" };

export async function createZone(input: NewZoneInput): Promise<CreateZoneResult> {
  const duplicate = await db
    .select({ id: deliveryZones.id })
    .from(deliveryZones)
    .where(sql`lower(${deliveryZones.name}) = lower(${input.name})`);
  if (duplicate.length > 0) return { ok: false, error: "name_taken" };

  let slug = slugify(input.name);
  for (let suffix = 2; (await getZoneBySlug(slug)) !== null; suffix++) {
    slug = `${slugify(input.name)}-${suffix}`;
  }

  const [zone] = await db
    .insert(deliveryZones)
    .values({ slug, name: input.name, feeBani: input.feeBani, freeFromBani: input.freeFromBani, sortOrder: input.sortOrder ?? 0 })
    .returning(adminZoneColumns);
  return { ok: true, zone };
}

export interface ZonePatch {
  name?: string;
  feeBani?: number;
  freeFromBani?: number;
  sortOrder?: number;
  active?: boolean;
}

export async function patchZone(id: number, patch: ZonePatch): Promise<AdminZoneRow | null> {
  const rows = await db.update(deliveryZones).set(patch).where(eq(deliveryZones.id, id)).returning(adminZoneColumns);
  return rows[0] ?? null;
}

/** Includes inactive zones — pricing tells "inactive" apart from "unknown". */
export async function getZoneBySlug(slug: string): Promise<(DeliveryZoneRow & { active: boolean }) | null> {
  const rows = await db
    .select({
      id: deliveryZones.id,
      slug: deliveryZones.slug,
      name: deliveryZones.name,
      feeBani: deliveryZones.feeBani,
      freeFromBani: deliveryZones.freeFromBani,
      active: deliveryZones.active,
    })
    .from(deliveryZones)
    .where(eq(deliveryZones.slug, slug));
  return rows[0] ?? null;
}
