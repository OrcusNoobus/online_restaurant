/**
 * Delivery zone reads. Shape mirrors 002-cos-comanda/06-contracts/api.md:
 * only active zones, sorted by sortOrder.
 */
import { asc, eq } from "drizzle-orm";

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
