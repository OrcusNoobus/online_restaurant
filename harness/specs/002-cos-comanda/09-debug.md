# Debug: Coș și plasare comandă

> Authored by: Agent (append-only; one entry per non-trivial obstacle).
> Reads from: implementation sessions.
> Feeds into: `harness/PROGRESS.md` blockers, future features touching the same code.

## 2026-07-04 — react-hooks/set-state-in-effect on the cart state

- **Symptom:** eslint (React 19 rules) rejected the localStorage-backed cart
  provider and the quote hook: `Calling setState synchronously within an
  effect can trigger cascading renders`.
- **Cause:** the classic "load from localStorage in useEffect + ready flag"
  pattern and a "reset payment on mode change" sync effect.
- **Fix:** cart state moved to a module-level store consumed via
  `useSyncExternalStore` (server snapshot = empty, hydration-safe); quote
  loading state derived from request-key comparison instead of a sync
  setState; payment fallback derived at render (`effectivePayment`).
- **Lesson:** with the React 19 lint rules, "sync state to X" effects are a
  smell — reach for useSyncExternalStore (external stores) or derive at
  render.

## 2026-07-04 — "Ambalaj" topping name is not unique across groups

- **Symptom:** the first pricing test failed: `findTopping("Ambalaj")`
  matched 7 rows — every packaging group (pizza, burger, crispy…) has a
  topping literally named "Ambalaj".
- **Cause:** topping names are only unique within their group (the seed's
  upsert key is (group, name) — 001 05-data-model.md).
- **Fix:** test helpers (and any future lookup) must scope by group name.
- **Lesson:** never look up toppings globally by name; the natural key is
  (group, name).
