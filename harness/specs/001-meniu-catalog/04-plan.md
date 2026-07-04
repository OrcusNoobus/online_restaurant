# Plan: Meniu produse (catalog)

> Authored by: Agent (the human reviews and approves before implementation).
> Reads from: `01-spec.md`, `02-clarify.md`, `03-research.md`, `harness/docs/ARCHITECTURE.md`.
> Feeds into: `05-data-model.md`, `06-contracts/`, `07-tasks.md`.
> The human decides architecture; the agent implements it.

## Implementation Summary

Add Drizzle + the menu schema (categories, products, variants, toppings) to
Postgres; scrape the legacy Metro dish menu once into a committed JSON
snapshot; write an idempotent seed script; expose the menu through a
repository, a `GET /api/menu` route handler, and a mobile-first server-rendered
menu page.

## File Targets

Files this feature is expected to create or modify. Touching files outside
this list is a signal to stop and re-check scope.

- `drizzle.config.ts` — Drizzle Kit config (new)
- `src/server/db/schema.ts` — tables: categories, products, product_variants, topping_groups, toppings (new)
- `src/server/db/client.ts` — the single db client (new)
- `src/server/db/migrations/*` — generated migrations (new)
- `src/server/repositories/menu.ts` — `getMenu()` query (new)
- `src/app/api/menu/route.ts` — GET handler (new)
- `src/app/page.tsx` — menu page, replaces the create-next-app placeholder (modify)
- `src/app/layout.tsx` — metadata, Romanian lang attribute (modify)
- `src/components/menu/*.tsx` — CategoryNav, ProductCard (new)
- `data/menu-seed.json` — scraped legacy menu snapshot (new)
- `scripts/seed.ts` + `db:seed` npm script — idempotent import (new)
- `tests/menu.test.ts` — integration tests (repository + API shape) (new)
- `package.json` — deps (drizzle-orm, drizzle-kit, pg/postgres, zod) + scripts (modify)
- `init.sh` — add migration step so the schema is always current (modify)

## Technical Design

- **Data layer:** Drizzle schema per `05-data-model.md`; migrations generated
  with drizzle-kit and applied in `./init.sh` (idempotent).
- **API / interface layer:** `GET /api/menu` per `06-contracts/api.md`; the
  menu page is a server component calling the repository directly (no
  self-fetch), both returning only active items.
- **Access control:** public read-only endpoint; no auth in this feature.
- **Testing:** unit (money formatting already covered); integration — seed a
  test schema, assert repository output shape, active-item filtering, seed
  idempotency; API contract asserted on the route handler response.

## Design Constraints

Out of scope (verbatim from 01-spec.md): coș/comenzi, alegerea topping-urilor
în UI, admin, fotografii finale, căutare/filtre/alergeni/multi-limbă, program
de funcționare.

ARCHITECTURE.md constraints touched: db client only inside `src/server/`;
prices as integer bani end-to-end; `src/components` stays presentational.

## Risks

- Scraping the legacy site may miss toppings/options hidden behind
  interactions — mitigate by validating the snapshot against category counts
  seen on the site and having the owner eyeball `data/menu-seed.json`.
- Legacy product photos may be platform-copyrighted — do NOT scrape images
  until the owner clarifies (02-clarify.md Q3); placeholders in v1.

## Validation Checklist

Confirm before generating `07-tasks.md`:

- [x] Every acceptance criterion in `01-spec.md` has a verification command.
- [x] Every file target is named above.
- [x] Every entity this feature touches is defined in `05-data-model.md`.
- [x] Every endpoint/interface this feature exposes is defined in `06-contracts/`.
- [x] Nothing contradicts `AGENTS.md`, `harness/docs/ARCHITECTURE.md`, or the spec's out-of-scope list.
- [ ] Every 02-clarify.md question is answered — no open coin flips.
      (Q3–Q6 open; they gate display details and the seed's image fields, not
      the schema — resolve before implementation starts.)
