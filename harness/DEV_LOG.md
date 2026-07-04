# DEV_LOG.md

> Authored by: Agent (the human may add entries too).
> Reads from: — (parallel to the workflow chain, not part of it).
> Feeds into: institutional memory; promotion into AGENTS.md rules when patterns repeat.
> This is the append-only history. PROGRESS.md says where we are;
> this file says how we got here. Newest entries first.

## Entry Format

```
## [YYYY-MM-DD] — [Short title]
- Status: Completed | In Progress | Failed
- Action: [what was done]
- Challenge: [obstacle hit, if any]
- Solution: [how it was resolved, if it was]
```

## When To Write Here

Write an entry when a session produced notable progress, hit a real obstacle,
or resolved one. Do not log routine work — feature state already lives in
`harness/feature-list.json`, and session detail lives in `harness/PROGRESS.md`. A challenge
that repeats across entries is a candidate for an AGENTS.md rule or an
`init.sh` check (the mistake-log pattern).

## Log

## [2026-07-04] — feat-006 Coș și plasare comandă complete (spec → done, one session)
- Status: Completed
- Action: Full document chain (spec + 16 clarify Q&A with the owner, research
  with 8 recorded decisions, plan, data model, contracts, tasks) then T01–T10:
  stable variant ids, delivery zones, pure schedule module, quoteCart/placeOrder
  services + 3 new API routes, options-sheet → cart → checkout → confirmation
  UI. 47/47 tests, ./init.sh green, live orders #13/#19 verified in DB.
  Owner decisions promoted to feature-list: feat-010 accounts, feat-011
  coupons, feat-012 online payment. Key product rule captured: the per-zone
  "minimum order" is a free-delivery threshold (fee below, free at/above),
  never a hard block.
- Challenge: (1) React 19 lint forbids setState-in-effect — the classic
  localStorage-cart pattern failed lint. (2) Topping names are only unique
  per group ("Ambalaj" ×7) — a global name lookup broke tests. (3) The
  ARCHITECTURE boundary grep flagged the literal server-import string inside
  a comment in src/components.
- Solution: (1) module store + useSyncExternalStore, derived loading/payment
  state (09-debug.md). (2) lookups scoped by (group, name). (3) reworded the
  comment; noted in PROGRESS for future sessions.

## [2026-07-04] — Feature-list cleanup: template pseudo-features removed
- Status: Completed
- Action: Removed feat-003 (Verification coverage), feat-004 (Documentation update) and feat-005 (Cleanup and handoff) from feature-list.json — as a complete set, no renumbering (feat-006..009 keep their IDs; they are referenced in DECISIONS.md, PROGRESS.md and commit history). Validated after removal: schema OK, no dangling dependencies (006→002, 007→006, 008→006, 009→008), WIP≤1, done entries carry evidence.
- Challenge: The scaffold generated these as "features", and the agent dutifully executed them as features (commits 62b5fe0, 48ccd43, f43f7c8 — the work itself was real and stays). But they were process steps: exactly what AGENTS.md already mandates per feature via Definition of Done and the Session Exit Checklist. Keeping them in the list duplicated the process as data and would have re-added three pseudo-features' worth of noise after every real feature.
- Solution: The feature list now holds product behaviors only (feat-001, feat-002 done; feat-006..009 roadmap). Rule of thumb promoted from this incident: if a "feature's" behavior describes the *process* (verify/document/clean up) rather than something a user or client can do, it belongs in Definition of Done, not in feature-list.json. Proposed to the owner as an AGENTS.md rule.

## [2026-07-04] — feat-002 Meniu produse complete (T02–T07)
- Status: Completed
- Action: Drizzle schema + migrations wired into ./init.sh, idempotent zod-validated seed, getMenu() repository, GET /api/menu, mobile-first menu page; 6 integration tests; all 08-quickstart.md flows executed live (375px + curl). Evidence in harness/feature-list.json.
- Challenge: (1) Native Node can't run the TS seed with extensionless imports — added tsx. (2) drizzle-kit/Next load .env themselves but Vitest and the seed don't — vitest.config.ts and scripts/seed.ts now call process.loadEnvFile. (3) A DB-reading page would be frozen at build time by static prerendering.
- Solution: tsx as devDependency; explicit env loading at each entry point; `export const dynamic = "force-dynamic"` on the menu page (build output verified: ƒ Dynamic).

## [2026-07-04] — Project initialized (feat-001 done)
- Status: Completed
- Action: Interviewed the owner (stack, DB, hosting, payments decided — see harness/docs/DECISIONS.md), generated the full harness scaffold from STARTER-long.md (New_harness v3.0.1, 2026-07-03), scaffolded Next.js 16 + TypeScript + Tailwind 4, Postgres 17 via docker-compose, ran ./init.sh to green, committed baseline (472f666).
- Challenge: Docker daemon was not running, so the db health check failed on the first ./init.sh run.
- Solution: Started Docker Desktop (`open -a Docker`), daemon ready in ~2s, re-ran ./init.sh — all green. Note added to PROGRESS.md: Docker Desktop must be running before ./init.sh.
