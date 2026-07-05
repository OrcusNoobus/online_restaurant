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

/** Integer bani → plain "37,50" for price INPUT values (no "lei" suffix). */
export function baniToLeiInput(bani: number): string {
  const lei = Math.trunc(bani / 100);
  const rest = bani % 100;
  return rest === 0 ? String(lei) : `${lei},${String(rest).padStart(2, "0")}`;
}

/**
 * "37" / "37,5" / "37.50" → integer bani; null when the text is not a valid
 * non-negative price with at most two decimals (money is NEVER floats).
 */
export function parseLeiToBani(text: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const lei = Number(match[1]);
  const rest = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  return lei * 100 + rest;
}
