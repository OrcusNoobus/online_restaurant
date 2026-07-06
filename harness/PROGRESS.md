# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-06 (feat-010 research APPROVED by owner;
  04-plan + 05-data-model + 06-contracts written — next: owner approves
  plan → 07-tasks → code)
- **Active feature:** feat-010 (Conturi clienți și login social),
  in-progress on branch `feat/010-conturi-clienti`. Chain: 01-spec ✓,
  02-clarify ✓ (Q1–Q5 + defaults D-a…D-h, all definitive), 03-research ✓
  (owner-approved 2026-07-06 incl. the two flagged defaults), 04-plan +
  05-data-model + 06-contracts/api.md written 2026-07-06 awaiting owner
  approval. feat-008 remains DONE with evidence; its merge to main
  (fast-forward from `claude/strange-hopper-b16056` @ 1d8a87b) stays the
  human's call.
- **Verification status:** ./init.sh fully green with the REAL key in
  .env: 156/156 tests (incl. the live T09 smoke and 2 new T10
  cart-context tests), lint, typecheck, boundary checks, build with
  ƒ /api/assistant. 08-quickstart.md flows 1–8 executed 2026-07-06
  against the real API at 375px — all PASS (24 prices spot-checked
  exact vs DB; chat order #821 landed in the admin panel identical to a
  web order; guardrails + injection attempt held; details and the one
  finding in 08-quickstart.md "Rezultate" and 09-debug.md). Evidence
  recorded in harness/feature-list.json.
- **API key:** lives ONLY in the git-ignored `.env` (never committed,
  never in harness files). The owner said they will revoke/delete this
  key themselves; with the key present, ./init.sh runs the live smoke
  (~2 real turns per run).
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
- [x] feat-008 Asistent AI pe site — full chain 01–09 + T01–T10 on the
  worktree branches (claude/distracted-jang-33b090 → claude/strange-hopper-b16056):
  - provider-agnostic LLM module: `LlmProvider` interface + Anthropic
    adapter (only SDK importer, model from ASSISTANT_MODEL, prompt
    caching, SDK errors → LlmUnavailableError)
  - assistant service: bounded tool loop (6 rounds), trilingual system
    prompt with Q5/Q6/Q7/Q12 rules, tools get_menu / get_delivery_zones /
    get_schedule / update_cart (quoteCart verbatim) / place_order (same
    placeOrder as the web), wire-only current-cart context every turn
  - storage: migration 0005, conversations + messages with token usage,
    30-day retention on conversation create, anti-abuse limits
    (500 chars, 40/conversation, 60/IP/day) checked before persistence
  - HTTP boundary: zod schema + POST /api/assistant (400/422/503 per
    contract, lazy provider so limits answer while unconfigured)
  - chat UI: ChatFab (bottom-left, key-gated in layout, hidden on
    /admin + /comanda), ChatPanel (375px sheet / desktop card, typing
    indicator, placedOrder card, T&C links), useAssistant
    (sessionStorage transcript, shared cart write-back via `replace`)
  - privacy: chat/30-day retention section in confidentialitate
  - verification: 156/156 incl. live smoke; quickstart flows 1–8 on the
    REAL API — evidence in feature-list.json, finding + fix in 09-debug.md

## In Progress

- feat-010 Conturi clienți și login social (owner's pick 2026-07-06):
  spec + clarify (8a0f1c8), 03-research (ef7a30e, owner-approved),
  04-plan + 05-data-model + 06-contracts/api.md written 2026-07-06.
  Design fixed: Google OIDC hand-rolled zero-deps; one `customers`
  table, Google links by verified email; `customer_sessions` mirror
  feat-007 (30d rolling, `rf_client_session`) with shared primitives
  extracted to `src/server/auth/`; guest-order linking = stamped
  `customer_id` backfill (first-claim); isolation via requireCustomer +
  repository filter; `/cont` + `/api/account/*` surface, silent checkout
  prefill; deterministic tests with injectable token exchange; Google
  runtime-optional like the assistant key. Next artifact: 07-tasks after
  the owner approves the plan trio.

## Next Steps

1. **Owner:** review/approve feat-010 04-plan + 05-data-model +
   06-contracts/api.md (file targets incl. the staff-auth primitives
   extraction; customers/customer_sessions/orders.customer_id model;
   /api/account/* + Google redirect contract). Then the agent writes
   07-tasks and starts implementing.
2. **Owner, before quickstart (not blocking implementation):** create the
   Google Cloud OAuth client (web application; authorized redirect URIs
   for localhost:3000 and the production host, path
   /api/account/google/callback) — values go ONLY in `.env`.
3. **Human decision (standing):** fast-forward main to the feat-008
   worktree branch `claude/strange-hopper-b16056` and push. Verified
   2026-07-06: main (@ cdd18cb) ALREADY contains feat-007 (rebased
   commits, new SHAs) + feat-008 T01–T05; this branch is main + 10
   commits (T06–T10), main is its ancestor — a plain fast-forward. The
   old `feat/007-panou-admin` branch (@ 19c6d45) is an obsolete
   duplicate of the rebased 007 content and can be deleted, NOT merged.
4. Still open (human): revoke the shared API key (owner said he will) and
   issue a production key at deploy time; hear the new-order tone on the
   restaurant device; hide the shop cart FAB on /admin routes (parked
   chip); lawyer-reviewed T&C/GDPR texts (incl. the new chat paragraph).

## Blockers / Risks

- None technical. Go-live still needs: branches merged + pushed, staff
  accounts created on the real host, a production ANTHROPIC_API_KEY in
  the host's .env (absent key = shop works, chat hidden), owner
  walk-through of the panel.

## Decisions Made This Session

- Implementation-level only: SDK errors map to LlmUnavailableError
  wholesale (any `Anthropic.APIError`, incl. connection errors) — from the
  customer's side the assistant is unavailable either way; the original
  error travels as `cause` for the log. Adapter constructor takes an
  injectable env record so tests cover the no-key path without touching
  process.env.
- T02 implementation-level: `AssistantMessageContent` union lives in
  `db/schema.ts` (jsonb `.$type<>`), re-exported by the repository — typed
  end-to-end without a cast; time math (24h window, retention cutoff,
  activity bump) runs DB-side (`now()`, `make_interval`) so app and DB
  clocks cannot disagree; thresholds (40/60/30d) stay OUT of the
  repository — they are service policy (T06).
- T03 implementation-level: when the 6-round cap is hit, the service still
  executes + persists the 6th round's tool results (every stored toolCalls
  row has its results, so the transcript always replays cleanly next turn),
  then persists the polite fallback reply (with the restaurant phone) as
  the assistant message — no 7th provider call. History replay caps at the
  last 30 rows, then trims to a user-message boundary so a sliced tool
  round can never reach the wire. Zones tool exposes `freeOverBani`
  (008 contract name) mapped from the repo's `freeFromBani`.
- T04 implementation-level: a failed quote (`ok:false` reasons) is a
  NORMAL tool result the model reads and corrects — `isError` is reserved
  for malformed tool input (zod issues) and unknown tool names. The
  working cart commits ONLY on a successful quote: the response cart is
  written verbatim into the site store, which must never hold an
  unpriceable cart. `update_cart` input is validated with the existing
  `quoteRequestSchema` — the tool's JSON Schema mirrors it for the model.
- T05 implementation-level: on successful place_order the working cart
  empties and the quote resets — mirrors the web checkout's `clear()`
  (comanda/page.tsx), so the shared site cart never keeps already-ordered
  items. Payment methods and required customer data live in the system
  prompt (no tool exposes them). `AssistantTurnOptions.now` forwards to
  `placeOrder` context — same injectable-clock pattern as the orders
  service; production passes nothing.
- T06 implementation-level: limit refusals are a RESULT
  (`{ok:false, error}`, placeOrder style), not an exception — every
  channel must handle them explicitly; `LlmUnavailableError` stays an
  exception (infra failure, not a semantic refusal). Refused turns
  persist NOTHING (no conversation row, no message, no provider call) so
  a capped visitor cannot grow counters or pollute transcripts. On an
  outage the already-persisted user message stays — audit trail;
  consecutive user turns replay fine at the wire. The reaper runs only on
  conversation CREATE (never on turns of existing conversations), so it
  can never race a live chat. Limit constants exported by the service —
  tests derive fixtures from them; T07's zod cap mirrors the 500 literal
  (lib cannot import server).
- T07 implementation-level: the route constructs the Anthropic provider
  LAZILY (first `complete()` call) so the service's limit checks run
  before the key is looked at — a capped visitor gets the accurate 422
  even while the assistant is unconfigured/down; the missing-key throw
  then flows through the service's `outcome=unavailable` turn log. A
  malformed conversationId is 400 (protects the uuid column cast); only
  VALID-but-unknown ids reach the service's fresh-conversation path.
  clientIp falls back to the shared `"unknown"` bucket (column is NOT
  NULL; fail-closed for the daily limit). Route tests live in a separate
  file (tests/assistant-route.test.ts) because `vi.mock` of the adapter
  module is file-global and would break the T01 real-adapter tests;
  Next 16 forbids extra exports from route.ts, so a test seam inside the
  route was not an option. Verification command still matches: vitest
  filters by substring, `tests/assistant` covers both files.
- T08 implementation-level: ONE deviation from the 04-plan file-target
  list, documented here — `src/components/cart/cart-store.ts` gained a
  `replace(items)` action. The plan itself requires the response cart to
  be written back "verbatim" into the store (Q11), but the store only
  had `add`/`clear`: a clear+add loop would re-merge duplicate lines and
  re-cap quantities, i.e. NOT verbatim. `replace` is one pure line over
  the existing `write()`. Other T08 choices: chat FAB sits bottom-LEFT
  because the cart FAB owns bottom-right and both show on menu pages;
  the FAB stays visible on /cos (only /admin and /comanda are excluded,
  per Q8's "checkout already started"); the panel is a modal with
  backdrop on all sizes (OptionsSheet idiom) — browsing while chatting
  was not required in v1; `useAssistant` lives in ChatFab (always
  mounted on shop pages) so the transcript survives open/close; the
  error bubbles are client-side texts keyed on the contract's 422 codes,
  anything else (400/500/503/network/AbortSignal.timeout at 90s) shows
  the generic unavailable text with the phone. The welcome bubble is a
  static placeholder shown only while the transcript is empty — not a
  persisted message.
- T10 implementation-level (quickstart finding, fix @ 1d8a87b): the model
  now receives a wire-only `[Context de sistem]` user message with the
  CURRENT request cart on EVERY turn — never persisted, sent even when
  empty. Without it, a cart edited in the site UI between chat messages
  was invisible to the model (it answered from stale conversation memory
  and place_order could have diverged from the on-screen cart — spec FR1).
  Full write-up in 004-asistent-ai/09-debug.md, incl. the lesson for
  feat-009 channels: per-turn channel state goes in regenerated wire-only
  context, never in the persisted transcript.
- Worktree note: the dev Postgres container `royal-db` belongs to compose
  project `magazin_online`; in this worktree `./init.sh` needs
  `COMPOSE_PROJECT_NAME=magazin_online` in the git-ignored `.env` (added
  locally, docker compose picks it up) or `docker compose up` conflicts on
  the container name.

## Files Modified This Session

- package.json / package-lock.json (+@anthropic-ai/sdk 0.110.0)
- src/server/llm/{provider,anthropic}.ts (new — T01)
- src/server/db/schema.ts (+assistant tables/enum) +
  migrations/0005_feat008_assistant.sql + meta (T02)
- src/server/repositories/assistant.ts (new — T02)
- src/server/services/assistant.ts (new T03; T04 cart bridge + update_cart;
  T05 place_order + confirmation rules; T06 limits + retention + log line)
- tests/helpers/fake-llm.ts (new — T03)
- tests/assistant.test.ts (8 T01 unit + 7 T02 + 6 T03 + 5 T04 + 3 T05 +
  6 T06)
- src/lib/assistant-schemas.ts (new — T07)
- src/app/api/assistant/route.ts (new — T07)
- tests/assistant-route.test.ts (new — T07, 6 route tests)
- src/components/chat/{useAssistant.ts,ChatPanel.tsx,ChatFab.tsx} (new — T08;
  T09 adds the T&C/privacy links in the panel footer)
- src/components/cart/cart-store.ts (+replace action — T08, documented
  file-target deviation)
- src/app/layout.tsx (mount ChatFab behind ANTHROPIC_API_KEY — T08)
- src/app/confidentialitate/page.tsx (chat transcripts section — T09)
- .env.example (ANTHROPIC_API_KEY, ASSISTANT_MODEL,
  ASSISTANT_MAX_REPLY_TOKENS)
- src/server/services/assistant.ts + tests/assistant.test.ts (T10 fix:
  wire-only current-cart context + 2 tests, 3 wire assertions updated)
- harness/specs/004-asistent-ai/08-quickstart.md (new — T10, executed) +
  09-debug.md (new — T10 findings)
- harness/feature-list.json (feat-008 → done with evidence)
- harness/specs/004-asistent-ai/07-tasks.md (T01–T10 ticked), harness/PROGRESS.md

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
