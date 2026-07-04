# Tasks: Meniu produse (catalog)

> Authored by: Agent (generated from the plan; human reviews order and size).
> Reads from: `04-plan.md`, `05-data-model.md`, `06-contracts/`.
> Feeds into: the working sessions; completion rolls up to `harness/feature-list.json`.
> The feature's execution checklist. The feature list tracks WHAT is done
> project-wide; this file tracks the steps WITHIN the active feature.

## Traceability Rule

Every task exists because of something in the spec, plan, data model, or
contract. If a task has no upstream source, it is scope creep — delete it or
take it back to the spec first.

## Sizing Rule

One task ≈ one focused session step ≈ one commit. If a task says only
"implement feature", it is too large. If completing it takes seconds, merge it.

## Task List (ordered by dependency)

- [x] T01 — Scrape the legacy Metro dish menu into `data/menu-seed.json`
      (categories, products, descriptions, sizes, prices in bani, toppings);
      owner eyeballs the JSON for correctness (source: 01-spec.md, 03-research.md D3)
      — done 2026-07-04: 13 categories, 73 products (22 pizzas × 3 size variants),
      117 variants, 12 topping groups, 30 toppings. Legacy quirks recorded in the
      JSON: 9 drink-price conflicts (see 02-clarify.md Q7), SGR label fixed
      ("1.00" → "Garanție SGR"), pizza names normalized across size categories.
- [x] T02 — Drizzle setup: deps, `drizzle.config.ts`, `src/server/db/schema.ts`
      + `client.ts`, first migration; wire `db:migrate` into `./init.sh`
      (source: 05-data-model.md)
      — done 2026-07-04: 7 tables incl. topping_prices + product_topping_groups;
      CHECK constraints on prices; unique (topping_id, size_name) NULLS NOT
      DISTINCT; migrations apply idempotently in ./init.sh (skipped by SKIP_DB=1).
- [x] T03 — Idempotent seed script `npm run db:seed` reading
      `data/menu-seed.json`, upserting by slug (source: 01-spec.md FR4)
      — done 2026-07-04: zod-validated input, upsert by slug / (group,name) /
      (topping,size); `active` set only on insert; ran twice → identical counts
      (13/73/117/12/30/88 prices/239 links). Variant descriptions stay in JSON
      (see 02-clarify.md note).
- [x] T04 — Repository `src/server/repositories/menu.ts` `getMenu()` +
      integration tests: shape, sorting, active-filtering, >=1 variant rule
      (source: 05-data-model.md, 06-contracts/api.md)
      — done 2026-07-04: 5 integration tests (idempotency by row counts,
      seed-order sorting, multi-size pizza once, active filtering incl.
      empty-active-category rule); tests self-migrate + self-seed.
- [x] T05 — `GET /api/menu` route handler + contract test
      (source: 06-contracts/api.md)
      — done 2026-07-04: handler wraps getMenu() in { categories }, 500 →
      {"error":"internal"}; contract test asserts status, content-type and
      body parity with the repository.
- [x] T06 — Menu page (`src/app/page.tsx`) + `src/components/menu/*`,
      mobile-first, prices via `formatBani` (source: 01-spec.md FR1–FR3)
      — done 2026-07-04: server component + force-dynamic (menu never frozen
      at build), sticky CategoryNav anchors, ProductCard with letter
      placeholder (Q3), light/dark, layout lang="ro" + Romanian metadata;
      eyeballed at 375px via dev server. Empty active categories hidden by
      the page (contract leaves it to the UI).
- [ ] T07 — Run `08-quickstart.md` flows end-to-end on a phone-sized viewport;
      record evidence in `harness/feature-list.json` (source: 08-quickstart.md)

## Review Heuristics

Before checking any box, answer three questions:

1. Did the verification for this task actually run — and did I see it pass?
2. Did I touch only files in the plan's file targets?
3. Would a fresh session understand this commit from its message alone?
