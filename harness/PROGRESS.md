# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-04 (feat-006 session 1 — spec phase complete)
- **Active feature:** feat-006 (Coș și plasare comandă), in-progress, branch
  `feat/006-cos-comanda`. Document chain 01–07 written: spec updated with all
  owner answers, clarify Q1–Q14 resolved, Q15/Q16 open with agent proposals
  as recorded defaults; research (8 decisions), plan, data model, contracts,
  tasks T01–T10 ready. Code NOT started — awaiting owner plan approval.
- **Scope decisions (owner, 2026-07-04):** livrare + ridicare personală în v1;
  ASAP + programare la oră; guest checkout (conturi + social login →
  feat-010); cupoane → feat-011; plată online → feat-012; notificare comenzi
  doar în DB până la feat-007. Regula-cheie de livrare: „comanda minimă" pe
  zonă e prag de livrare gratuită — sub prag se adaugă taxa zonei, comanda NU
  se blochează (02-clarify.md Q8/Q9).
- **Verification status:** ./init.sh green (run at session start); feat-002
  evidence unchanged. feat/002-meniu-catalog branch is fully merged into main
  (safe to delete).

## Done

- [x] Harness scaffold + feat-001 Project setup (Next.js 16, Postgres 17, Vitest)
- [x] Clarify Q1–Q7 answered by owner; data model final (ToppingPrice per size)
- [x] feat-002 Meniu produse — complete:
  - T01 legacy menu snapshot `data/menu-seed.json` (13 cat / 73 prod / 117 var)
  - T02 Drizzle: 7 tables, price CHECKs, migrations in ./init.sh (SKIP_DB aware)
  - T03 idempotent `npm run db:seed` (zod-validated, upsert by slug)
  - T04 `getMenu()` repository + 5 integration tests
  - T05 `GET /api/menu` + contract test
  - T06 mobile-first menu page (force-dynamic, CategoryNav, ProductCard)
  - T07 quickstart flows 1–4 executed on 375px viewport; evidence recorded

## In Progress

- feat-006: document chain complete (01–07); implementation not started.
  Open coin-flips recorded with defaults: Q15 (SGR on drink add-ons — default:
  apply, seed-reversible), Q16 (ordering window — default: same-day only,
  placeable 11:00–22:30).

## Next Steps

1. Owner reads 01-spec.md (note the changed delivery-fee rule) and 04-plan.md;
   answers Q15/Q16 if the defaults are wrong.
2. Implementation starts at 07-tasks.md T01 (schema extensions + stable
   variant ids — the seed replace-variants debt from feat-002), then T02+.
3. One task = one commit; verification target: `npm test -- tests/orders`.

## Blockers / Risks

- None. Owner may want to eyeball the menu page (npm run dev) and replay
  08-quickstart.md before accepting feat-002 — flows already pass agent-side.

## Decisions Made This Session

- Menu page and /api/menu render force-dynamic (no build-time freeze of menu
  data); build output confirms ƒ Dynamic for both.
- Seed sets `active` only on insert — re-seeding never reactivates admin-hidden
  rows; variants are replaced per product (no natural key) until orders
  reference them (feat-006).
- Variant-level descriptions from the legacy site stay in the JSON snapshot
  only (see 02-clarify.md note) — data model keeps description on Product.

## Files Modified This Session

- drizzle.config.ts, src/server/db/* (schema, client, migrations)
- scripts/seed.ts, package.json (db:migrate, db:seed, deps), init.sh (migrate step)
- src/server/repositories/menu.ts, src/app/api/menu/route.ts
- src/app/page.tsx, src/app/layout.tsx, src/components/menu/*
- tests/menu.test.ts, vitest.config.ts (.env loading)
- harness state files + .claude/launch.json (preview tooling)

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh (it starts the db container).
Integration tests self-migrate and self-seed (they need the Docker db up).
