# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-06 (feat-008 T07 done)
- **Active feature:** feat-008 (Asistent AI pe site) — doc chain 01–07
  complete and approved; implementation in progress. T01 (LLM module) DONE
  @ cf446ea; T02 (migration 0005 + assistant repository) DONE @ e829b10;
  T03 (service core + read tools + fake provider) DONE @ 259678a; T04
  (cart bridge + update_cart) DONE @ 4e5b5cb; T05 (place_order) DONE
  @ f63d14a; T06 (limits + degradation + retention) DONE @ b42c82b; T07
  (HTTP boundary: assistant-schemas + POST /api/assistant + route tests)
  DONE — T01–T05 on worktree branch `claude/distracted-jang-33b090`,
  T06–T07 on worktree branch `claude/strange-hopper-b16056` (contains all
  prior commits). feat-007 remains DONE on `feat/007-panou-admin`
  @ 19c6d45, still NOT merged into main — merge + push stays the human's
  call.
- **Verification status:** ./init.sh fully green on this branch (Postgres,
  migrate incl. 0005, lint, typecheck, boundary checks, build with the
  new ƒ /api/assistant route); full test suite 153/153 incl.
  tests/assistant.test.ts (8 T01 + 7 T02 + 6 T03 + 5 T04 + 3 T05 + 6 T06)
  and tests/assistant-route.test.ts (6 T07); feature verification
  `npm test -- tests/assistant` 41/41 (matches both files). Live smoke on
  dev server (no API key): valid body → 503 assistant_unavailable,
  invalid body → 400 validation, service+route log lines present; the
  test conversation row was deleted afterwards.
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

- feat-008 Asistent AI — T01 done (LLM module); T02 done (migration 0005 +
  `repositories/assistant.ts`); T03 done (`services/assistant.ts`: bounded
  tool loop, system prompt, read tools, fake provider); T04 done (cart
  bridge: request carries the site cart, `update_cart` tool zod-validates
  with `quoteRequestSchema` and prices via `quoteCart`, QuoteResult goes
  to the model VERBATIM, working copy commits only on a priced cart,
  response returns final cart + `QuoteView` (zone stripped, same as the
  quote route); 5 integration tests). T05 done (`place_order` tool: full
  `OrderRequest` zod-validated then through the SAME `placeOrder` as the
  web with `{clientIp, now}` context, PlaceOrderResult verbatim to the
  model, `placedOrder` (PlacedOrderView) in the response, cart emptied on
  success mirroring the web checkout `clear()`; system prompt gains
  required-data + payment-on-receipt rules; injectable `now` in
  AssistantTurnOptions for deterministic tests; 3 integration tests).
  T06 done (`runAssistantTurn` returns `AssistantTurnResult` union —
  `{ok:false, error}` with the contract's 422 codes; limits checked
  BEFORE any persistence or provider call; retention via
  `deleteConversationsOlderThan(30)` on conversation create;
  `LlmUnavailableError` escapes for the route's 503 mapping; one
  structured key=value log line per turn; 6 integration tests).
  T07 done (`src/lib/assistant-schemas.ts`: zod body — message trimmed
  1–500, `z.uuid()` conversationId optional, cart via `cartItemSchema`
  max 100; `POST /api/assistant`: validate → `runAssistantTurn` →
  contract shape, `ok:false` → 422 `{error}`, `LlmUnavailableError` →
  503 `assistant_unavailable`, provider constructed LAZILY so limits
  answer 422 even when unconfigured; x-forwarded-for first hop, fallback
  `"unknown"` bucket; `ASSISTANT_MAX_REPLY_TOKENS` wired from env; 6
  route tests in tests/assistant-route.test.ts with the Anthropic class
  module-mocked to the scripted fake).
  Next task: T08 (chat UI: ChatFab + ChatPanel + useAssistant + layout).

## Next Steps

1. feat-008 T08 — Chat UI: `ChatFab` (hidden on `/admin` and `/comanda`,
   not rendered when the assistant is unconfigured — layout checks
   `ANTHROPIC_API_KEY` server-side), `ChatPanel` (conversation, typing
   indicator, unavailable/limit states with the restaurant phone,
   375px-first), `useAssistant` (sessionStorage conversationId, sends the
   cart from `useCart()`, writes the returned cart back), mount in
   `layout.tsx` (source: 04-plan UI; Q8/Q11; 03-research D10).
2. Then T09–T10 in order per harness/specs/004-asistent-ai/07-tasks.md.
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
- .env.example (ANTHROPIC_API_KEY, ASSISTANT_MODEL,
  ASSISTANT_MAX_REPLY_TOKENS)
- harness/specs/004-asistent-ai/07-tasks.md (T01–T05 ticked), harness/PROGRESS.md

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
