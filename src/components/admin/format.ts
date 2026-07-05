/**
 * Display-edge formatting for the admin panel: restaurant-local times and
 * Romanian labels for the English codes (same rule as src/lib/order-status.ts).
 */
import { RESTAURANT_TIMEZONE } from "@/lib/restaurant-config";

import type { PaymentMethod } from "@/components/admin/types";

export const MODE_LABELS_RO = {
  delivery: "Livrare",
  pickup: "Ridicare",
} as const;

export const PAYMENT_LABELS_RO: Record<PaymentMethod, string> = {
  cash: "Numerar",
  card_delivery: "Card la livrare",
  card_restaurant: "Card la restaurant",
};

const timeFormat = new Intl.DateTimeFormat("ro-RO", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: RESTAURANT_TIMEZONE,
});

/** ISO instant → "14:35" in restaurant-local time. */
export function formatTimeRo(iso: string): string {
  return timeFormat.format(new Date(iso));
}

const dayFormat = new Intl.DateTimeFormat("ro-RO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: RESTAURANT_TIMEZONE,
});

/** "YYYY-MM-DD" day key → "sâm., 5 iul." (noon UTC keeps the key's calendar day in any zone). */
export function formatDayLabelRo(dateKey: string): string {
  return dayFormat.format(new Date(`${dateKey}T12:00:00Z`));
}

/** Previous/next calendar day for the day browser, same "YYYY-MM-DD" form. */
export function shiftDateKey(dateKey: string, days: number): string {
  const noonUtc = new Date(`${dateKey}T12:00:00Z`);
  noonUtc.setUTCDate(noonUtc.getUTCDate() + days);
  return noonUtc.toISOString().slice(0, 10);
}
