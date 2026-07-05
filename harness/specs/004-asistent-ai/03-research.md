# Research: Asistent AI pe site (chat)

> Authored by: Agent (human approves each decision).
> Reads from: `01-spec.md`, `02-clarify.md`.
> Feeds into: `04-plan.md`; durable decisions get promoted to `harness/docs/DECISIONS.md`.
> Records feature-level technical choices and WHY they were made, so no later
> session quietly re-decides them.
> D1–D3 come directly from the owner (clarify Q1/Q2 amendments, 2026-07-05);
> D4–D10 follow from those choices and the existing architecture.

## Decision 1: LLM access through a provider interface (provider-agnostic)

- **Options considered:**
  - A: Call the Anthropic SDK directly from the assistant service.
  - B: Define a minimal `LlmProvider` interface shaped by OUR needs
    (chat turn in → assistant text or tool-call requests out, with token
    usage); the Anthropic SDK adapter is the first implementation; the
    agentic tool loop is OURS, in the service, written against the
    interface.
  - C: A third-party abstraction layer (LangChain, Vercel AI SDK).
- **Decision:** B (owner-decided 2026-07-05: "în perspectivă avem nevoie
  să fie și provider agnostic").
- **Reason:** ARCHITECTURE.md already mandates "cross-cutting concerns
  enter through explicit provider interfaces". A thin, self-owned
  interface costs ~1 file and buys: provider swap without touching the
  assistant, a trivial scripted fake for deterministic tests (D9), and no
  third-party framework lock-in (C adds a heavy dependency to avoid a
  dependency — rejected). Direct SDK calls (A) would leak Anthropic types
  into the service and force a rewrite at feat-009 if the provider ever
  changes.
- **Consequences:** new module `src/server/llm/` — `provider.ts` (types:
  `LlmMessage`, `LlmToolDefinition`, `LlmTurnResult`, interface
  `LlmProvider`) and `anthropic.ts` (adapter over `@anthropic-ai/sdk`,
  the only file that imports it). The tool-execution loop lives in the
  assistant service, not in the SDK helper (the SDK's `toolRunner` is NOT
  used — it would tie the loop to Anthropic). Layer rule: `src/server/llm`
  sits beside repositories (may import `src/lib` only); services may
  import it.

## Decision 2: Model selection is configuration, not code

- **Options considered:** A: model id hardcoded per call site; B: one env
  var (`ASSISTANT_MODEL`) with a sensible default, read in one place.
- **Decision:** B (owner-decided 2026-07-05: "să îl putem schimba când
  vrem, chiar dacă doar comentăm linia").
- **Reason:** the owner wants to trade cost/quality freely as real usage
  data arrives; a model swap must never require a code change or a review.
- **Consequences:** `.env.example` documents `ASSISTANT_MODEL` (default:
  `claude-opus-4-8` — Anthropic's recommended default tier; the owner can
  set e.g. `claude-sonnet-5` or `claude-haiku-4-5` any time) and
  `ANTHROPIC_API_KEY`. The adapter reads the model once at construction;
  no model string appears anywhere else. Max output tokens per reply also
  config-defaulted (chat replies are short).

## Decision 3: Cost cap lives in the provider console; code keeps only anti-abuse limits

- **Options considered:** A: in-code monthly budget accounting (sum token
  costs, hard-stop over threshold); B: owner sets the spend limit in the
  Anthropic Console; code handles API errors/unavailability gracefully and
  keeps lightweight anti-abuse limits.
- **Decision:** B (owner-decided 2026-07-05: "plafonul o să-l reglez eu
  din platforma furnizorului, în cod nu ne batem capul cu limitele").
- **Reason:** the console limit is authoritative, needs zero code, and
  can't drift from the bill. In-code accounting would duplicate it with
  estimate errors. Anti-abuse limits are a different concern (one visitor
  spamming the endpoint) and stay server-side.
- **Consequences:** no budget tables/counters. The route translates
  provider errors (429/5xx/billing) into one polite "asistentul nu e
  disponibil momentan" message; the shop is unaffected. Anti-abuse in
  code: max message length, max messages per conversation, per-IP daily
  message cap (exact values at plan). Token usage per message is still
  LOGGED (observability + the owner can see consumption), never enforced.

## Decision 4: Assistant is a service; the web chat is just its first client

- **Decision:** orchestration in `src/server/services/assistant.ts`:
  receives (conversation id, user message, current cart, client locale
  hints), runs the tool loop against `LlmProvider`, executes tools by
  calling EXISTING services/repositories, returns (assistant reply,
  updated cart, conversation id). Route handler `POST /api/assistant`
  validates with zod (boundary rule), calls the service, shapes JSON.
- **Reason:** DECISIONS.md 2026-07-04 (channel-agnostic core) — feat-009
  will call the same service from WhatsApp/Telegram adapters. Precedent:
  services already compose services (`orders.ts` imports pricing +
  settings).
- **Consequences:** nothing in `src/app` or `src/components` contains
  assistant logic; the UI posts messages and renders replies.

## Decision 5: Tool surface = existing services, read-mostly + two writes

- **Decision:** initial tools (names final at contracts):
  - `get_menu` — categories/products/variants/toppings with prices,
    ingredients, allergens; active only (menu repository, same source as
    `/api/menu`).
  - `get_delivery_zones` — active zones with fee/threshold.
  - `get_schedule` — opening hours + scheduling rules (settings service).
  - `update_cart` — replace/adjust cart lines (validated `CartItem[]`),
    then price via `quoteCart` and return the full quote (server prices,
    SGR, fee) + reasons on invalid lines.
  - `place_order` — full guest order payload through `placeOrder` (same
    zod `orderRequestSchema`, same validations as web checkout).
- **Reason:** spec FR2/FR3 — every fact and every order goes through the
  same services as the web; the assistant adds zero business rules.
- **Consequences:** no new SQL, no new pricing logic. Tool definitions
  carry prescriptive "when to call" descriptions. Mandatory confirmation
  (Q5) is enforced by system prompt + scripted tests; the server-side
  validations are unchanged (the assistant has no power the web lacks).

## Decision 6: Conversations stored in Postgres, 30-day retention

- **Decision:** new tables `assistant_conversations` (id, created_at,
  last_activity_at, client ip, locale) and `assistant_messages`
  (conversation FK, role, content jsonb — includes tool calls/results,
  input/output token counts, created_at). Conversation id issued by the
  server, kept client-side in `sessionStorage` (Q8: history per browsing
  session). Retention: delete conversations older than 30 days (Q9);
  mechanism at plan (opportunistic cleanup on write + covered by a test).
- **Reason:** Q9 (owner reviews transcripts; 30-day retention; privacy
  page mention). Storage also gives the anti-abuse counters (messages per
  conversation / per IP-day) for free via indexed queries.
- **Consequences:** migration 0005; privacy page (`/confidentialitate`)
  gets a paragraph about chat transcripts and retention.

## Decision 7: Cart bridge — client cart travels with each message

- **Decision:** the shop cart stays where it is (localStorage,
  `cart-store.ts`). Each chat request carries the CURRENT `CartItem[]`;
  the service gives tools a working copy; the response returns the final
  cart; the chat client writes it back through the existing store API.
- **Reason:** Q11 (same cart, visible/editable in the site UI) without
  migrating cart state to the server for everyone. The server never
  trusts cart prices anyway — `quoteCart` re-prices from the DB
  (ARCHITECTURE hard constraint).
- **Consequences:** the assistant "sees" manual cart edits automatically
  (next message carries the fresh cart). On feat-009 channels the same
  service runs with a server-held cart — the interface already takes the
  cart as data.

## Decision 8: Trilingual via system prompt, product names in Romanian

- **Decision:** one system prompt (English-written, per repo convention)
  instructing: answer in the customer's language (RO/HU/EN), keep product
  names as stored (Romanian), stay on topic, allergen wording per Q7,
  mandatory order summary + explicit confirmation per Q5.
- **Reason:** Q3; model-level multilinguality needs no per-language code.
- **Consequences:** the system prompt is a stable constant (prompt-caching
  friendly: static prefix, volatile data only in messages/tools).

## Decision 9: Deterministic tests with a scripted fake provider; live behavior in quickstart

- **Decision:** `npm test -- tests/assistant` runs the REAL service +
  REAL services/DB with a scripted `FakeLlmProvider` (implements
  `LlmProvider`; emits predefined tool calls/replies per scenario). It
  proves: tool wiring, cart bridge, quote/order placement end-to-end,
  confirmation gating, error translation, limits, storage + retention.
  LLM-judgment behaviors (off-topic refusal, language switching, allergen
  wording) are validated manually in `08-quickstart.md` against the real
  API; optionally a tiny live smoke test runs ONLY when `ANTHROPIC_API_KEY`
  is present (skipped otherwise).
- **Reason:** `./init.sh` must stay green offline and without secrets
  (AGENTS.md critical rule 4); real-LLM tests are non-deterministic and
  cost money on every run.
- **Consequences:** the verification command proves the machine layer;
  the quickstart proves the conversational layer. Both are listed per
  acceptance criterion in the spec.

## Decision 10: Chat UI — floating panel, non-streaming JSON in v1

- **Decision:** `src/components/chat/` (FAB + panel, mobile-first 375px),
  mounted on shop pages only (not `/admin` — reuses the route-based
  hiding needed for the cart FAB chip). Requests are plain JSON
  request/response per message in v1 (no SSE): replies are short, the
  tool loop happens server-side within the request. `sessionStorage`
  holds the conversation id (Q8). Revisit streaming at 09-debug only if
  measured latency hurts.
- **Reason:** streaming across a multi-step tool loop adds protocol +
  UI complexity with little gain at chat-reply lengths; simplest thing
  that meets the NFR ("răspunsurile încep să apară în câteva secunde").
- **Consequences:** the panel shows a typing indicator while waiting;
  timeouts surface the polite-unavailable message from D3.

## Notes

- Anthropic adapter details (kept inside `src/server/llm/anthropic.ts`):
  official `@anthropic-ai/sdk`; system prompt + tool definitions form the
  stable cached prefix (`cache_control`); short `max_tokens`; typed error
  classes mapped to the D3 unavailability result. API drift points
  (thinking/effort params) are adapter-internal and read from the current
  SDK docs at implementation time.
- Promotion candidates for `harness/docs/DECISIONS.md` once approved:
  D1 (LLM provider interface, Anthropic first) and D3 (cost governance in
  the provider console) — both outlive this feature (feat-009 depends on
  them).
- `.env.example` gains: `ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`
  (+ optional `ASSISTANT_MAX_REPLY_TOKENS`). Secrets never enter the repo.
