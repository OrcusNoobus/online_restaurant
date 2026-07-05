/**
 * Restaurant constants + schedule TYPES. Since feat-007 the live schedule/
 * estimate values live in the `restaurant_settings` DB row (003 research D6),
 * editable from the admin panel; this module keeps what is NOT editable —
 * timezone, contact info — plus the install defaults migration 0004 seeded
 * the row from. Runtime code reads the DB via the settings service, never
 * these defaults.
 */

/** All schedule math happens in the restaurant's timezone, never the server's. Not editable (Q10). */
export const RESTAURANT_TIMEZONE = "Europe/Bucharest";

/** The editable schedule/estimate set — one row in `restaurant_settings`. */
export interface ScheduleConfig {
  /** Orders can be PLACED while open; minutes after local midnight. */
  openMinutes: number;
  closeMinutes: number;
  /** Nothing is delivered or picked up earlier, under any circumstance. */
  earliestFulfillmentMinutes: number;
  /** Default quoted estimate for ASAP delivery orders. */
  deliveryEstimateMinutes: number;
  /** ASAP pickup: the customer picks one of these. */
  pickupEstimateOptionsMinutes: number[];
}

/** Install-time values (11:00–22:30, floor 11:30, 60 min, 15/25 min). */
export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  openMinutes: 11 * 60,
  closeMinutes: 22 * 60 + 30,
  earliestFulfillmentMinutes: 11 * 60 + 30,
  deliveryEstimateMinutes: 60,
  pickupEstimateOptionsMinutes: [15, 25],
};

/** Shown for pickup orders (checkout + confirmation) and on the legal pages. Contact info, not schedule — stays in code. */
export const RESTAURANT_ADDRESS = "Str. Principală nr. 2, Sântana de Mureș";
export const RESTAURANT_PHONE = "0371 717 177";
