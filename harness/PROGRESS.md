# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-04 14:30
- **Active feature:** feat-002 Meniu produse (catalog) — branch feat/002-meniu-catalog
- **Latest commit:** see git log on feat/002-meniu-catalog
- **Verification status:** ./init.sh green at feat-001 close; feat-002 T01 done (data only, no code changes yet)

## Done

- [x] Harness scaffold generated from STARTER-long.md
- [x] feat-001 Project setup: Next.js 16 + TS + Tailwind 4 skeleton, Postgres 17
      via docker-compose (localhost:5433), Vitest wired, money helpers tested,
      boundary checks in ./init.sh, first commit
- [x] Clarify Q3–Q6 answered by owner; data model updated (ToppingPrice per size)
- [x] Conversational-channel direction recorded (DECISIONS.md, ARCHITECTURE.md,
      feat-006…feat-009 in the roadmap)
- [x] feat-002 T01: legacy menu scraped into data/menu-seed.json (13 categories,
      73 products, 117 variants, 12 topping groups, 30 toppings)

## In Progress

- [ ] feat-002 Meniu produse — next task: T02 (Drizzle setup: schema, client,
      first migration, db:migrate wired into ./init.sh)

## Next Steps

1. T02 — Drizzle setup per harness/specs/001-meniu-catalog/07-tasks.md.
2. T03 — idempotent seed script (npm run db:seed) reading data/menu-seed.json.
3. T04–T06 — repository + API + menu page; verification: `npm test -- tests/menu`.

## Blockers / Risks

- None blocking. Q7 in 02-clarify.md (legacy drink-price inconsistencies) needs
  the owner's answer BEFORE the cart feature (feat-006); interim rule: higher
  price kept in the seed data.

## Decisions Made This Session

- Stack, database, hosting, payments-v1, money-as-bani — all recorded with
  reasoning in harness/docs/DECISIONS.md.

## Files Modified This Session

- Entire initial scaffold (see commit 472f666).

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh (it starts the db container).
