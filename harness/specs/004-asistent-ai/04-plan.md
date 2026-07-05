# Plan: Asistent AI pe site (chat)

> Authored by: Agent (the human reviews and approves before implementation).
> Reads from: `01-spec.md`, `02-clarify.md`, `03-research.md`, `harness/docs/ARCHITECTURE.md`.
> Feeds into: `05-data-model.md`, `06-contracts/`, `07-tasks.md`.
> The human decides architecture; the agent implements it.

## Implementation Summary

Add a provider-agnostic LLM module (`src/server/llm/` — interface +
Anthropic adapter, model from env), an assistant service that runs OUR
tool loop over the existing services (menu, zones, schedule, quoteCart,
placeOrder) with conversation persistence in two new tables (30-day
retention) and anti-abuse limits, one public endpoint
`POST /api/assistant`, and a chat UI (floating button + panel, shop pages
only) that carries the site cart with every message and writes the updated
cart back. Tests run the real service + DB with a scripted fake provider;
real-LLM behavior is validated in the quickstart.

## File Targets

Files this feature is expected to create or modify. Touching files outside
this list is a signal to stop and re-check scope.

Dependencies & config:
- `package.json` — add `@anthropic-ai/sdk` (modify)
- `.env.example` — `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`,
  `ASSISTANT_MAX_REPLY_TOKENS` (modify)

Schema & data:
- `src/server/db/schema.ts` — `assistant_conversations`,
  `assistant_messages` (modify)
- `src/server/db/migrations/0005_feat008_assistant.sql` — generated (new)

Pure logic (`src/lib`):
- `src/lib/assistant-schemas.ts` — zod for the `/api/assistant` boundary:
  message (trimmed, max length), optional conversationId, cart items via
  the EXISTING `cartItemSchema` (new)

LLM module (03-research D1/D2 — may import `src/lib` only):
- `src/server/llm/provider.ts` — `LlmProvider` interface, `LlmMessage`,
  `LlmToolDefinition`, `LlmTurnResult`, `LlmUsage`,
  `LlmUnavailableError` (new)
- `src/server/llm/anthropic.ts` — adapter over `@anthropic-ai/sdk`; the
  ONLY file importing the SDK; reads `ASSISTANT_MODEL` once; prompt
  caching on the stable system+tools prefix; typed SDK errors →
  `LlmUnavailableError` (new)

Server (repositories → services):
- `src/server/repositories/assistant.ts` — conversation/message SQL:
  create/load conversation with messages, append message (with token
  usage), per-conversation and per-IP-day counters, retention delete
  (> 30 days) (new)
- `src/server/services/assistant.ts` — orchestration: system prompt
  (RO/HU/EN rules, allergen wording Q7, mandatory confirmation Q5,
  on-topic guardrails), tool definitions + execution against existing
  services, the bounded tool loop, cart working copy, anti-abuse checks,
  error translation, structured logging (new)

HTTP boundary:
- `src/app/api/assistant/route.ts` — POST: zod-validate → service →
  JSON `{conversationId, reply, cart, quote?}`; 422 limit reasons;
  503 `assistant_unavailable` (new)

UI (client, calls the public API only — same pattern as `components/cart`):
- `src/components/chat/ChatFab.tsx` — floating button, hidden on `/admin`
  and on `/comanda` (checkout already started — Q8) (new)
- `src/components/chat/ChatPanel.tsx` — conversation view, typing
  indicator, error/unavailable state, 375px-first (new)
- `src/components/chat/useAssistant.ts` — client hook: sessionStorage
  conversationId, POST message with current cart from `useCart()`, write
  returned cart back to the store (new)
- `src/app/layout.tsx` — mount `ChatFab` (modify)
- `src/app/confidentialitate/page.tsx` — chat transcripts + 30-day
  retention paragraph (modify)

Tests:
- `tests/assistant.test.ts` — integration with the fake provider through
  real services + DB (new)
- `tests/helpers/fake-llm.ts` — scripted `LlmProvider` used by the suite
  (new)

## Technical Design

- **Provider interface (D1):** one method —
  `complete({system, messages, tools, maxTokens}) → LlmTurnResult` where
  the result is `{kind:'reply', text, usage}` or
  `{kind:'tool_calls', calls:[{id,name,input}], usage}`. `messages`
  includes prior tool calls/results as typed entries; the adapter maps
  them to the vendor wire format. Nothing Anthropic-shaped crosses the
  interface.
- **Tool loop (D4/D5):** the service loops: provider → if tool_calls,
  execute each against services, append results, repeat — hard cap of
  **6 provider rounds per user message** (bounds cost and runaway; the
  6th response without a reply becomes the polite-error reply). Tools:
  `get_menu`, `get_delivery_zones`, `get_schedule`, `update_cart`
  (validates items with `cartItemSchema`, prices via `quoteCart`, returns
  quote + reasons), `place_order` (full `orderRequestSchema` payload
  through `placeOrder`; the tool description mandates calling it only
  after the customer explicitly confirmed the summary — Q5). Server-side
  validations are identical to the web (the assistant has no extra power).
- **Conversation state (D6):** conversation id (UUID) issued on first
  message, returned to the client, kept in `sessionStorage`. Every user /
  assistant / tool message persisted as jsonb with input/output token
  counts. History reloaded from the DB per request (single indexed query);
  history sent to the provider is capped to the last N messages (plan
  constant, ~30) to bound context size.
- **Anti-abuse (D3):** constants in the service — message ≤ 500 chars
  (also enforced in zod), ≤ 40 user messages per conversation, ≤ 60 user
  messages per IP per day (counted via the messages table; IP stored on
  the conversation, same normalization as orders). Over limit → 422 with
  reason code; the panel shows the polite message + restaurant phone.
- **Degradation (D3):** `LlmUnavailableError` (auth/429/5xx/billing) →
  503 `assistant_unavailable`; missing `ANTHROPIC_API_KEY` → the layout
  simply does not render the ChatFab (server component checks env).
- **Retention (D6):** `deleteConversationsOlderThan(30d)` runs
  opportunistically when a new conversation is created; behavior covered
  by a test.
- **Cart bridge (D7):** request carries the client cart (already-validated
  `CartItem[]`); tools mutate the working copy; the response returns the
  final cart + last quote; `useAssistant` writes it into the existing
  cart store so the site cart and the FAB badge update instantly.
- **Trilingual (D8):** system prompt only; product names verbatim from the
  menu payload (Romanian).
- **Testing (D9):** the fake provider is scripted per scenario (sequence
  of tool_calls/replies). The suite asserts: tool wiring against the real
  DB (prices in bani from quoteCart, active-only menu), confirmation
  gating (no place_order call scripted before the confirm message —
  asserted via the persisted transcript), order lands identically to a
  web order (DB snapshot), limits (message length, conversation cap,
  IP/day cap), unavailability translation, storage + retention, cart
  round-trip. Optional live smoke (`ANTHROPIC_API_KEY` present, otherwise
  skipped): one real menu question asserting a non-empty reply.
- **Observability:** one structured log line per turn — conversationId,
  rounds, tools called, tokens in/out, duration, outcome — per
  ARCHITECTURE.md.

## Design Constraints

Out of scope (verbatim from 01-spec.md): WhatsApp/Telegram (feat-009),
conturi clienți (feat-010), cupoane (feat-011), plată online (feat-012),
live-chat cu personal, voce, modificarea/anularea comenzilor plasate,
status comandă prin chat, UI de administrare a asistentului, upsell
nesolicitat.

ARCHITECTURE.md constraints touched: business ops only in services; route
handlers validate → call service → shape; zod at the boundary; integer
bani (prices only ever come from `quoteCart`); `src/components` never
imports `@/server`; `src/server/llm` imports only `src/lib`; API key only
in `.env`.

NOT touched here: the cart FAB `/admin` hiding (separate parked task) —
the chat FAB implements its own route check without refactoring CartFab.

## Risks

- **LLM nondeterminism:** guardrail behaviors (off-topic refusal,
  languages, allergen wording) are not provable in CI — covered by
  quickstart flows against the real API + optional smoke test. Residual
  risk accepted (D9).
- **Prompt injection:** a customer can try to talk the model into
  anything; the blast radius is capped by the tool surface — every write
  goes through the same validated services as the web, prices are always
  server-computed. Quickstart includes an injection attempt flow.
- **Cost runaway:** bounded by 6 rounds/message, capped reply tokens,
  history cap, anti-abuse limits; the console spend limit is the final
  authority (D3).
- **Latency:** multi-round tool loops can take seconds — typing indicator
  in the panel; if quickstart shows it hurts, streaming is the recorded
  upgrade path (09-debug), not a v1 requirement.
- **SDK/API drift:** all vendor specifics live in `anthropic.ts`; consult
  the current SDK reference at implementation time (T01) rather than
  training-data memory.
- **Menu size in context:** `get_menu` returns a compact shape (~73
  products) — fine for current menu; if the menu grows, add a category
  filter param (noted, not built).
- **Existing tests stay green:** the feature only ADDS files except
  `layout.tsx`, `confidentialitate/page.tsx`, `schema.ts`, `package.json`,
  `.env.example` — no existing behavior changes.

## Validation Checklist

Confirm before generating `07-tasks.md`:

- [x] Every acceptance criterion in `01-spec.md` has a verification command.
- [x] Every file target is named above.
- [x] Every entity this feature touches is defined in `05-data-model.md`.
- [x] Every endpoint/interface this feature exposes is defined in `06-contracts/`.
- [x] Nothing contradicts `AGENTS.md`, `harness/docs/ARCHITECTURE.md`, or the spec's out-of-scope list.
- [x] Every 02-clarify.md question is answered — no open coin flips.
