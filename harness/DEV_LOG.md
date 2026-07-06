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

## [2026-07-06] — feat-010 Conturi clienți COMPLETE (T01–T10, done with evidence)
- Status: Completed
- Action: Closed feat-010 with T10 — scripts/set-customer-password.ts (Q4
  phone recovery), .env.example Google vars, 08-quickstart.md written and
  EXECUTED at 375px (flows 1–5 all PASS: signup→prefilled checkout→order
  #1156 stamped at insert + D-h absorb→«În livrare» via 15s polling without
  refresh→logout/re-login; guest #1157 claimed by phone at register with
  404 isolation; guest regression customer_id NULL; no-Google degradation;
  password CLI old-401/new-200), 09-debug.md, evidence in feature-list.json,
  D3+D4 promoted to DECISIONS.md. `npm test -- tests/accounts` 43/43;
  ./init.sh green (198 tests). Flow 6 (real Google round-trip) pending the
  owner's OAuth client — deterministic Google paths test-covered via the
  injected exchange.
- Challenge: (1) Session start: the owner-revoked ANTHROPIC_API_KEY made
  the live smoke fail 401 — baseline repaired by commenting the dead key
  out of the git-ignored .env (smoke skips by design). (2) Quickstart
  signup rejected "0740 000 111" — phoneSchema (feat-006 contract) refuses
  inner spaces; identical in checkout, so recorded as an observation, not
  changed. (3) DB cleanup: a psql -c batch is ONE transaction — the first
  cleanup silently rolled back everything when a late statement hit the
  RESTRICT FK from order_status_events to the temp staff user.
- Solution: (3) Re-ran the cleanup ordered so the orders delete cascades
  the events before the staff delete, with verification SELECTs in the
  same batch. Lesson recorded in PROGRESS: verify deletes in-batch;
  RESTRICT FKs make status-event actors undeletable while their events
  exist — by design (feat-007 journal).

## [2026-07-06] — feat-008 Asistent AI COMPLETE (T01–T10, done with evidence)
- Status: Completed
- Action: T10 executed with the owner's real API key (claude-opus-4-8):
  quickstart flows 1–8 in the browser at 375px — menu Q&A in RO/HU/EN
  with 24 prices spot-checked exact against the DB, allergen rule held
  (no invention for products without data), shared cart both directions,
  full chat order #821 placed only after explicit confirmation and
  visible in the admin day view identical to a web order, out-of-hours
  refusal with the real schedule, off-topic + manager-discount injection
  refused, 501-char message → 400. Suite 156/156 incl. the live smoke.
  Evidence in feature-list.json; feature marked done. Test entities
  cleaned up; key stays only in the git-ignored .env (owner revokes it).
- Challenge: Flow 4 caught a real design gap — the model received only
  system prompt + persisted transcript, so a cart edited in the site UI
  between messages was invisible: it answered from stale conversation
  memory, and place_order (items composed by the model) could have
  placed an order different from the on-screen cart (spec FR1 "coșul
  existent e vizibil asistentului").
- Solution: fix @ 1d8a87b — wire-only `[Context de sistem]` user message
  with the request cart injected EVERY turn (even empty), never
  persisted; stable system-prompt line declares it the truth about the
  cart. 2 new integration tests + 3 wire assertions updated. Re-ran the
  failing flow live: the assistant noticed the site-side edit unprompted.
  Lesson recorded in 09-debug.md for feat-009: per-turn channel state
  belongs in regenerated wire-only context, never in conversation memory.
  This is exactly what the quickstart layer exists to catch — the fake
  provider tests all passed while the real conversation exposed the gap.

## [2026-07-06] — feat-008 T08+T09: chat UI + privacy — backend↔UI loop closed
- Status: Completed (feature still in-progress: T10 quickstart remains)
- Action: Chat UI shipped (ChatFab bottom-left behind server-side
  ANTHROPIC_API_KEY check, ChatPanel 375px-first with typing indicator +
  placedOrder card, useAssistant with sessionStorage transcript and the
  shared-cart write-back per Q11); privacy page gained the chat/30-day
  retention section and the panel shows the checkout's T&C links; live
  smoke test added, gated on the key. Verified in the live browser with a
  dummy key: FAB routing rules, 375px + desktop layouts, the full
  send → typing → 503 → polite-bubble degradation path, transcript
  surviving navigation; ./init.sh green (153 passed + 1 gated skip).
- Challenge: (1) The 04-plan requires the response cart written into the
  store "verbatim", but cart-store only exposed add/clear — a clear+add
  loop would re-merge duplicate lines and re-cap quantities. (2) The
  contract has no key in dev, so the happy path is not exercisable
  offline at the UI layer.
- Solution: (1) One documented file-target deviation: cart-store.ts
  gained a one-line pure `replace(items)` action (recorded in PROGRESS
  decisions + commit message). (2) Verified the degradation path live
  instead (dummy key → 503 bubble with the restaurant phone) and left
  the happy-path UI proof to T10's real-API quickstart; the API-layer
  happy path is already covered by the T07 route tests. T10 now needs
  the human to provide ANTHROPIC_API_KEY.

## [2026-07-05] — feat-007 Panou admin complete (T01–T15, done with evidence)
- Status: Completed
- Action: Finished the admin panel across two sessions on feat/007-panou-admin
  (16 commits, d0732be..19c6d45): T11 seed-ownership guard (first panel write
  stamps catalog/zones flags; seed skips protected sections loudly;
  SEED_FORCE=1 resets — integration-tested by running the REAL seed via
  execSync in both directions), T12 orders day-view UI (5s poll, client-side
  status filters so the alert can't go blind, Web Audio two-tone with visible
  on/off/blocked state, detail panel driven by the pure status graph, cancel
  dialog with mandatory reason, undo, 409 refetch), T13 catalog UI + shop
  ingredients/allergens block, T14 zones/settings pages, T15 quickstart flows
  1–9 executed live in the browser (both order lifecycles to completed, race
  order one-winner, panel edits live in the public shop within one request).
  46/46 admin tests, 112/112 suite, ./init.sh green. NOT merged to main yet.
- Challenge: (1) React 19 `set-state-in-effect` lint rejected the natural
  effect-based selection/reconcile wiring. (2) `key={updatedAt}` on the
  settings form remounted it on every save and silently swallowed the
  success notice — only found by driving the real browser. (3) Preview
  tooling couldn't operate React controlled inputs (login form), which
  looked like an app bug but wasn't.
- Solution: (1) selection moved into handlers; cross-device reconcile lives
  inside refreshList reading a detailRef; async IIFE pattern for initial
  fetches. (2) removed the key; forms seed from props once on mount. (3)
  native value setters + dispatched input events; session cookie set
  directly for scripted verification. All three captured in
  003-panou-admin/09-debug.md for future UI work.

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
