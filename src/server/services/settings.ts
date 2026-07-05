/**
 * Settings reads/writes (003 research D6). getScheduleConfig feeds the order
 * service and the public schedule endpoint; the full row (with seed-protection
 * flags) is admin-panel data. Values are zod-validated at the boundary and
 * CHECK-constrained in the DB.
 */
import type { ScheduleConfig } from "@/lib/restaurant-config";
import {
  getSettingsRow,
  type RestaurantSettingsRow,
  updateSettingsRow,
} from "@/server/repositories/settings";

/** The live schedule/estimate values — one row read, no cache (spec FR9). */
export async function getScheduleConfig(): Promise<ScheduleConfig> {
  const row = await getSettingsRow();
  return {
    openMinutes: row.openMinutes,
    closeMinutes: row.closeMinutes,
    earliestFulfillmentMinutes: row.earliestFulfillmentMinutes,
    deliveryEstimateMinutes: row.deliveryEstimateMinutes,
    pickupEstimateOptionsMinutes: row.pickupEstimateOptionsMinutes,
  };
}

export async function getSettings(): Promise<RestaurantSettingsRow> {
  return getSettingsRow();
}

export async function updateSettings(config: ScheduleConfig): Promise<RestaurantSettingsRow> {
  return updateSettingsRow(config);
}
