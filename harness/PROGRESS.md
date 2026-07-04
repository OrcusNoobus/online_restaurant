# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-04 13:50
- **Active feature:** none (feat-001 done; feat-002 next, not started)
- **Latest commit:** 472f666 — harness scaffold + passing baseline
- **Verification status:** ./init.sh green (lint, typecheck, boundary checks, 7/7 tests, build)

## Done

- [x] Harness scaffold generated from STARTER-long.md
- [x] feat-001 Project setup: Next.js 16 + TS + Tailwind 4 skeleton, Postgres 17
      via docker-compose (localhost:5433), Vitest wired, money helpers tested,
      boundary checks in ./init.sh, first commit

## In Progress

- (nothing)

## Next Steps

1. Owner answers the open questions Q3–Q6 in harness/specs/001-meniu-catalog/02-clarify.md
   (photos, unavailable-product display, topping pricing, category order).
2. Start feat-002 (Meniu produse): begin with T01 in harness/specs/001-meniu-catalog/07-tasks.md —
   scrape the legacy Metro dish menu into data/menu-seed.json.
3. Work the task list T01→T07; verification: `npm test -- tests/menu`.

## Blockers / Risks

- None. (Q3–Q6 open in 02-clarify.md gate display/seed details, not the schema.)

## Decisions Made This Session

- Stack, database, hosting, payments-v1, money-as-bani — all recorded with
  reasoning in harness/docs/DECISIONS.md.

## Files Modified This Session

- Entire initial scaffold (see commit 472f666).

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh (it starts the db container).
