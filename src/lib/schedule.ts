/**
 * Pure schedule rules (002 02-clarify.md Q10/Q16): no I/O, no implicit "now" —
 * callers pass the clock, tests pass fixed instants. All comparisons happen
 * in the restaurant's timezone via Intl, so a UTC server clock cannot skew
 * open/closed decisions.
 */
import {
  CLOSE_MINUTES,
  DELIVERY_ESTIMATE_MINUTES,
  EARLIEST_FULFILLMENT_MINUTES,
  OPEN_MINUTES,
  PICKUP_ESTIMATE_OPTIONS_MINUTES,
  RESTAURANT_TIMEZONE,
} from "./restaurant-config";

export type OrderMode = "delivery" | "pickup";

interface LocalParts {
  dateKey: string; // "2026-07-04" in restaurant time — same-day comparisons
  minutesOfDay: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESTAURANT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function localParts(instant: Date): LocalParts {
  const parts = new Map(partsFormatter.formatToParts(instant).map(({ type, value }) => [type, value]));
  // Intl reports midnight as hour "24" with hourCycle h24 quirks; normalize.
  const hour = Number(parts.get("hour")) % 24;
  return {
    dateKey: `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`,
    minutesOfDay: hour * 60 + Number(parts.get("minute")),
  };
}

/** The restaurant-local calendar date ("YYYY-MM-DD") of an instant — the admin day view's "today". */
export function localDateKey(instant: Date): string {
  return localParts(instant).dateKey;
}

/** Can an order be placed right now? (placement window = opening hours) */
export function isOpenAt(instant: Date): boolean {
  const { minutesOfDay } = localParts(instant);
  return minutesOfDay >= OPEN_MINUTES && minutesOfDay <= CLOSE_MINUTES;
}

/** The estimate quoted for an ASAP order; pickupChoice must be 15 or 25 (zod-enforced upstream). */
export function estimateMinutesFor(mode: OrderMode, pickupChoice?: number): number {
  if (mode === "delivery") return DELIVERY_ESTIMATE_MINUTES;
  return pickupChoice ?? PICKUP_ESTIMATE_OPTIONS_MINUTES[0];
}

/**
 * A scheduled order is valid iff (Q16): same restaurant-time day as `now`,
 * not before max(now + estimate, 11:30), and not after closing.
 */
export function isValidScheduledFor(scheduledFor: Date, now: Date, estimateMinutes: number): boolean {
  const scheduled = localParts(scheduledFor);
  const current = localParts(now);
  if (scheduled.dateKey !== current.dateKey) return false;
  if (scheduled.minutesOfDay < EARLIEST_FULFILLMENT_MINUTES) return false;
  if (scheduled.minutesOfDay > CLOSE_MINUTES) return false;
  return scheduledFor.getTime() >= now.getTime() + estimateMinutes * 60_000;
}
