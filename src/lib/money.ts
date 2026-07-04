/**
 * Money flows through this app EXCLUSIVELY as integer bani (1 leu = 100 bani).
 * Floats are forbidden for prices and totals — see harness/docs/ARCHITECTURE.md.
 */

/** Format integer bani as a Romanian price string, e.g. 2990 -> "29,90 lei". */
export function formatBani(bani: number): string {
  assertBani(bani);
  const sign = bani < 0 ? "-" : "";
  const abs = Math.abs(bani);
  const lei = Math.trunc(abs / 100);
  const rest = (abs % 100).toString().padStart(2, "0");
  return `${sign}${lei},${rest} lei`;
}

/** Throw if a value is not a safe integer amount in bani. */
export function assertBani(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Amounts must be integer bani, got: ${value}`);
  }
}
