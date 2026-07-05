/**
 * The single restaurant_settings row (003 research D6/D7) — created by
 * migration 0004, id always 1. Reads are one indexed SELECT per request; no
 * cache, so an admin edit applies to the very next checkout (spec FR9).
 */
import { eq } from "drizzle-orm";

import type { ScheduleConfig } from "@/lib/restaurant-config";

import { db } from "../db/client";
import { restaurantSettings } from "../db/schema";

const SETTINGS_ROW_ID = 1;

export interface RestaurantSettingsRow extends ScheduleConfig {
  catalogProtectedSince: Date | null;
  zonesProtectedSince: Date | null;
  updatedAt: Date;
}

export async function getSettingsRow(): Promise<RestaurantSettingsRow> {
  const rows = await db
    .select({
      openMinutes: restaurantSettings.openMinutes,
      closeMinutes: restaurantSettings.closeMinutes,
      earliestFulfillmentMinutes: restaurantSettings.earliestFulfillmentMinutes,
      deliveryEstimateMinutes: restaurantSettings.deliveryEstimateMinutes,
      pickupEstimateOptionsMinutes: restaurantSettings.pickupEstimateOptionsMinutes,
      catalogProtectedSince: restaurantSettings.catalogProtectedSince,
      zonesProtectedSince: restaurantSettings.zonesProtectedSince,
      updatedAt: restaurantSettings.updatedAt,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.id, SETTINGS_ROW_ID));
  if (!rows[0]) throw new Error("restaurant_settings row missing — was migration 0004 applied?");
  return rows[0];
}

/** Full replacement of the five editable fields; protection flags are system-written only. */
export async function updateSettingsRow(config: ScheduleConfig): Promise<RestaurantSettingsRow> {
  await db
    .update(restaurantSettings)
    .set({ ...config, updatedAt: new Date() })
    .where(eq(restaurantSettings.id, SETTINGS_ROW_ID));
  return getSettingsRow();
}
