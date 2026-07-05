/**
 * Pure schedule rules (002 02-clarify.md Q10/Q16): no I/O, no implicit "now",
 * no implicit config — callers pass both; production reads the config from
 * the settings service (003 research D6), tests pass fixed values. All
 * comparisons happen in the restaurant's timezone via Intl, so a UTC server
 * clock cannot skew open/closed decisions.
 */
import { RESTAURANT_TIMEZONE, type ScheduleConfig } from "./restaurant-config";

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
export function isOpenAt(config: ScheduleConfig, instant: Date): boolean {
  const { minutesOfDay } = localParts(instant);
  return minutesOfDay >= config.openMinutes && minutesOfDay <= config.closeMinutes;
}

/** The estimate quoted for an ASAP order; pickupChoice membership is checked by the order service. */
export function estimateMinutesFor(config: ScheduleConfig, mode: OrderMode, pickupChoice?: number): number {
  if (mode === "delivery") return config.deliveryEstimateMinutes;
  return pickupChoice ?? config.pickupEstimateOptionsMinutes[0];
}

/**
 * A scheduled order is valid iff (Q16): same restaurant-time day as `now`,
 * not before max(now + estimate, earliest fulfillment), and not after closing.
 */
export function isValidScheduledFor(
  config: ScheduleConfig,
  scheduledFor: Date,
  now: Date,
  estimateMinutes: number,
): boolean {
  const scheduled = localParts(scheduledFor);
  const current = localParts(now);
  if (scheduled.dateKey !== current.dateKey) return false;
  if (scheduled.minutesOfDay < config.earliestFulfillmentMinutes) return false;
  if (scheduled.minutesOfDay > config.closeMinutes) return false;
  return scheduledFor.getTime() >= now.getTime() + estimateMinutes * 60_000;
}

/** "660" → "11:00" — display edge for schedule minutes. */
export function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
