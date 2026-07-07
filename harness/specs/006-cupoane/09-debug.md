# Debug: Cupoane de reducere

> Authored by: Agent (append-only during implementation and quickstart).
> Reads from: running the code.
> Feeds into: fixes, `harness/DEV_LOG.md`, future sessions' context.
> Records what broke, why, and what was decided — so no session re-debugs it.

## 2026-07-06 — SQL 3-valued logic almost let a NULL value through the CHECK

- **Symptom:** the T01 test expected `coupons_value_by_type` to reject a
  `percent` coupon with `value = NULL`; the insert SUCCEEDED.
- **Cause:** `value BETWEEN 1 AND 100` evaluates to NULL (not false) when
  `value` is NULL, and a CHECK whose expression is NULL passes — every
  disjunct was NULL-or-false, so the whole constraint was NULL → accepted.
- **Fix:** explicit `value IS NOT NULL AND …` guards inside the percent and
  fixed disjuncts (migration 0007 regenerated before it was ever committed;
  the applied dev copy was rolled back manually and re-applied).
- **Lesson:** CHECK constraints with nullable columns need explicit
  IS NOT NULL guards; the test that "fails on the first run" is doing its
  job — write the negative case BEFORE trusting the constraint.

## 2026-07-06 — quote-contract literals in older suites

- The shared `QuoteView` gained two ALWAYS-present fields (`discountBani`,
  `coupon`); `tests/orders` (exact key list) and `tests/assistant`
  (toEqual literal) failed until the expected shapes listed them. Recorded
  as plan file-target additions — expected-shape edits only, no behavior
  change. The assistant's `toQuoteView` projection widened mechanically
  (it still never sends a couponCode — D-e intact).

## 2026-07-07 — test fixture codes vs couponCodeSchema max length

- The first fixture generator produced codes longer than 32 chars; they
  passed repository-level tests but failed the moment a fixture travelled
  through `orderRequestSchema` (T04). Shortened the run-suffix so the SAME
  fixtures work end-to-end through the real schemas — fixtures should
  always satisfy the public contract they will eventually cross.

## 2026-07-07 — quickstart executed against the sleeping-Mac lesson

- Two full-suite runs ran 60–85 minutes wall-clock with spurious failures
  (individual tests "taking" 15–17 minutes) because the machine slept
  mid-run overnight. Not a code problem: re-run with `caffeinate -is
  npm test` → 49s, all green. Use caffeinate for unattended runs.

## Quickstart observations (2026-07-07) — no code changes needed

- The free_delivery display rule (fee line «gratuită (cupon)», no separate
  discount line) reads naturally in the UI and avoids the visual
  double-count; the percent/fixed discount line with the code in
  parentheses matches the admin panel wording.
- A fixed coupon larger than the subtotal yields a legitimate 0-lei
  products total in the cart (SGR/fee still due when present) — the
  relaxed `orders_total_non_negative` CHECK covers the extreme case of a
  0-lei ORDER too (percent 100 / fixed ≥ subtotal on an SGR-free pickup
  cart); placing one was not exercised manually, but the engine invariants
  and DB CHECKs are test-covered.
