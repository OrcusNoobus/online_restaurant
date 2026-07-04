# Research: Meniu produse (catalog)

> Authored by: Agent (human approves each decision).
> Reads from: `01-spec.md`, `02-clarify.md`.
> Feeds into: `04-plan.md`; durable decisions get promoted to `harness/docs/DECISIONS.md`.
> Records feature-level technical choices and WHY they were made, so no later
> session quietly re-decides them.

## Decision 1: ORM — Drizzle

- **Options considered:**
  - A: Drizzle — TypeScript-first, SQL-transparent, no runtime engine binary, light.
  - B: Prisma — more docs/examples, but heavier runtime and codegen step.
  - C: raw `pg` — no migration story, hand-written mapping everywhere.
- **Decision:** Drizzle (drizzle-orm + drizzle-kit for migrations).
- **Reason:** Closest to SQL (easy to review), fully typed, no extra engine to
  babysit in Docker on the VPS. Candidate for promotion to DECISIONS.md once
  implemented and proven.

## Decision 2: Menu data shape — product with variants

- **Options considered:**
  - A: Copy the legacy shape — one category per pizza size, sizes are separate products.
  - B: One product, many variants (sizes), each variant owns its price.
- **Decision:** B — product + variants.
- **Reason:** The legacy shape triples every pizza and makes the future cart
  ("choose size") impossible to model cleanly. Confirmed with the owner
  (02-clarify.md Q2).

## Decision 3: Seed source — scraped snapshot committed to the repo

- **Options considered:**
  - A: Scrape the legacy site at seed-time (live dependency on a site we are leaving).
  - B: Scrape once into `data/menu-seed.json`, commit it, seed reads the file.
- **Decision:** B — one-time scrape, committed JSON snapshot.
- **Reason:** Reproducible seeds from a clean checkout; no dependency on the
  legacy platform staying up; the owner can hand-edit the JSON before import.

## Intentionally Not Decided Yet

- Image storage (local `/public` vs object storage) — deferred until real
  product photos exist (02-clarify.md Q3).
- Topping price-per-size mechanics — deferred to the cart feature
  (02-clarify.md Q5).
- Pagination/lazy-loading of the menu — the menu is ~100 products; render all
  server-side until proven slow.

## Promotion Rule

When another feature starts depending on a decision made here, promote it to
`harness/docs/DECISIONS.md` with a date and link back to this file.
