# QUALITY.md

> Authored by: Agent (updated during periodic cleanup; human sets the cadence).
> Reads from: verification runs, `09-debug.md` incidents, review findings.
> Feeds into: cleanup priorities; the next session reads this to pick maintenance work.
> A living health report per module. Entropy growth is the default —
> this file makes it visible before it becomes expensive.

## How To Use This File

- Grade every significant module A–D across the five dimensions below.
- Update during **periodic cleanup** (weekly or after every N features), not
  every session — session-level state lives in `harness/PROGRESS.md`.
- When picking cleanup work, start with the lowest grade.
- A module that stays at C or D for two consecutive reviews becomes a
  `harness/feature-list.json` entry ("raise [module] to grade B") so the work is
  scheduled instead of wished for.

## Grading Dimensions

| Dimension | Question it answers |
|---|---|
| Verification passing | Do this module's checks actually pass? (Yes / Partial / No) |
| Agent understandable | Can a fresh session work here without spelunking? (Yes / Difficult / Impossible) |
| Test stability | Stable / Flaky / Broken |
| Architecture boundaries | Compliant / Violations present |
| Code conventions | Followed / Partially / Not followed |

## Modules

## src/lib (Quality: A)
- Verification passing: Yes — money helpers fully tested.
- Agent understandable: Yes — two small pure functions.
- Test stability: Stable.
- Architecture boundaries: Compliant (no imports outside the layer).
- Code conventions: Followed.
- Notes: grows with zod schemas from feat-002 on; keep it pure (no I/O).

(Other modules get graded as they come into existence — src/server/db,
src/server/repositories, src/server/services, src/app, src/components.)

## Periodic Cleanup Checklist

- [ ] Re-grade every module above.
- [ ] Scan for debug code, dead files, stray TODOs across the repo.
- [ ] Run the full verification suite including slow end-to-end checks.
- [ ] Retire AGENTS.md rules and boundary checks that no longer fire (stale rules are noise).
- [ ] Promote recurring 09-debug.md incidents into rules or checks.
