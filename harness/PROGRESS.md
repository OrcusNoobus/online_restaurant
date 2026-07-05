# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-05 (feat-008 T01 done)
- **Active feature:** feat-008 (Asistent AI pe site) — doc chain 01–07
  complete and approved; implementation started. T01 (LLM module) DONE
  @ cf446ea on branch `claude/distracted-jang-33b090` (worktree). feat-007
  remains DONE on `feat/007-panou-admin` @ 19c6d45, still NOT merged into
  main — merge + push stays the human's call.
- **Verification status:** ./init.sh fully green on this branch (Postgres,
  migrate, lint, typecheck, boundary checks, build); full test suite
  120/120 incl. the new tests/assistant.test.ts (8 unit tests, no network);
  feature verification `npm test -- tests/assistant` passing.
- **Dev DB state:** catalog/zones force-reseeded clean; protection flags
  NULL; dev accounts `admin` (#45, admin) and `angajat` (#48, staff) exist
  (passwords not recorded — recreate via scripts/create-staff-user.ts if
  needed); test orders #275/#276 completed, #325 accepted, plus older ones —
  harmless history for the day views.

## Done

- [x] feat-001 Project setup; feat-002 Meniu produse; feat-006 Coș și
  plasare comandă (merged to main @ cf3d2a6)
- [x] feat-007 Panou admin — full chain 01–09 + T01–T15 on feat/007-panou-admin:
  - staff auth: scrypt + DB sessions, rolling 7d, proxy presence check +
    real verify in layout, login rate limit, create-staff-user CLI
  - order lifecycle: pure status graph, journal table with undo, conditional
    UPDATE → 409 stale_state, day view + totals, 5s polling UI with Web
    Audio alert (visible on/off/blocked state), detail panel, cancel dialog
    (mandatory reason), estimate-at-accept
  - catalog admin: full read (inactive incl.), availability toggles (staff),
    prices/texts/create category+product (admin), server-side slugs,
    ingredients/allergens now shown in the shop options sheet
  - zones + settings admin pages; schedule/estimates live from the DB
    settings row (checkout reads GET /api/schedule)
  - seed-ownership guard: first panel write stamps the domain flag, seed
    skips that section loudly, SEED_FORCE=1 resets

## In Progress

- feat-008 Asistent AI — T01 done (LLM module: `src/server/llm/provider.ts`
  interface + `anthropic.ts` adapter, env contract in .env.example, 8 unit
  tests). Next task: T02 (schema migration 0005 + assistant repository).

## Next Steps

1. feat-008 T02 — migration 0005: `assistant_conversations` +
   `assistant_messages` (+ enum) per 05-data-model; `repositories/assistant.ts`
   with counters + retention; integration tests.
2. Then T03–T10 in order per harness/specs/004-asistent-ai/07-tasks.md.
3. **Human decision (still open):** merge `feat/007-panou-admin` into main
   and push — after that the shop can take real orders. Also still open:
   hear the new-order tone on the restaurant device; hide the shop cart FAB
   on /admin routes (parked chip); lawyer-reviewed T&C/GDPR texts.

## Blockers / Risks

- None technical. Go-live still needs: feature merged, staff accounts
  created on the real host, owner walk-through of the panel.

## Decisions Made This Session

- Implementation-level only: SDK errors map to LlmUnavailableError
  wholesale (any `Anthropic.APIError`, incl. connection errors) — from the
  customer's side the assistant is unavailable either way; the original
  error travels as `cause` for the log. Adapter constructor takes an
  injectable env record so tests cover the no-key path without touching
  process.env.
- Worktree note: the dev Postgres container `royal-db` belongs to compose
  project `magazin_online`; in this worktree `./init.sh` needs
  `COMPOSE_PROJECT_NAME=magazin_online` in the git-ignored `.env` (added
  locally, docker compose picks it up) or `docker compose up` conflicts on
  the container name.

## Files Modified This Session

- package.json / package-lock.json (+@anthropic-ai/sdk 0.110.0)
- src/server/llm/{provider,anthropic}.ts (new — T01)
- tests/assistant.test.ts (new — 8 unit tests, no network)
- .env.example (ANTHROPIC_API_KEY, ASSISTANT_MODEL,
  ASSISTANT_MAX_REPLY_TOKENS)
- harness/specs/004-asistent-ai/07-tasks.md (T01 ticked), harness/PROGRESS.md

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh (it starts the db container).
Integration tests self-migrate and self-seed; the admin suite runs the REAL
seed via execSync and resets the protection flags in cleanup.
After manual panel testing on dev: clean up created test entities, then
`SEED_FORCE=1 npm run db:seed` (see 003 09-debug.md).
React 19 lint patterns for admin UI (set-state-in-effect, key remounts,
AudioContext narrowing) are documented in 003-panou-admin/09-debug.md.
Topping names are unique only within their group — scope lookups by
(group, name). The boundary check greps the server-import string even in
comments in src/components — do not write it literally there.
