/**
 * Restaurant schedule & time estimates — the single configurable place
 * (002 01-spec.md NFR, 02-clarify.md Q10/Q16). Values move to the database
 * when feat-007 lets the dispatcher adjust them; until then this module is
 * the source of truth for every schedule rule.
 */

/** All schedule math happens in the restaurant's timezone, never the server's. */
export const RESTAURANT_TIMEZONE = "Europe/Bucharest";

/** Orders can be PLACED while open: daily 11:00–22:30, no closed days. */
export const OPEN_MINUTES = 11 * 60;
export const CLOSE_MINUTES = 22 * 60 + 30;

/** Nothing is delivered or picked up before 11:30, under any circumstance. */
export const EARLIEST_FULFILLMENT_MINUTES = 11 * 60 + 30;

/** Default quoted estimate for ASAP delivery orders. */
export const DELIVERY_ESTIMATE_MINUTES = 60;

/** ASAP pickup: the customer picks one of these; scheduling an exact hour is also allowed. */
export const PICKUP_ESTIMATE_OPTIONS_MINUTES = [15, 25] as const;

/** Shown for pickup orders (checkout + confirmation). */
export const RESTAURANT_ADDRESS = "Sântana de Mureș";
