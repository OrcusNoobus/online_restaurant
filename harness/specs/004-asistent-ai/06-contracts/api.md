# Contract: Asistent AI — API, tools, provider interface

> Authored by: Agent (human approves; this file is the authoritative shape).
> Reads from: `01-spec.md`, `05-data-model.md`.
> Feeds into: `07-tasks.md`, the code, `08-quickstart.md`.
> Exact request/response shapes. The code conforms to this file — not the
> other way around. Error responses are part of the contract, not an afterthought.

## Common Rules

- Public endpoint (guest chat — no auth), same conventions as the shop API:
  JSON in/out, all prices **integer bani**, timestamps ISO-8601 with offset,
  zod at the boundary. Malformed shape → `400
  {"error":"validation","issues":[...]}`. Semantic refusals → `422
  {"error":"<code>"}`. Provider down/unconfigured → `503
  {"error":"assistant_unavailable"}`. Unexpected → `500 {"error":"internal"}`.
- The cart in the request is the SITE cart (`CartItem[]`, existing
  `cartItemSchema`); the cart in the response is authoritative for the
  client store (Q11 — shared cart). Prices never travel from the client.
- This endpoint backs the web chat today; feat-009 channels call the same
  assistant SERVICE directly — nothing here assumes a browser.

## `POST /api/assistant`

Request:

```json
{
  "conversationId": "b3e1…-uuid (optional — omit on the first message)",
  "message": "ce pizza picantă aveți?",
  "cart": [
    { "productId": 12, "variantId": 31, "quantity": 1, "toppingIds": [4] }
  ]
}
```

- `message`: trimmed, 1–500 chars (zod).
- `cart`: `cartItemSchema[]`, max 100 lines — same shape the quote/order
  endpoints already accept.
- Unknown/expired `conversationId` → treated as a new conversation (fresh
  id in the response), NOT an error — retention must not strand clients.

Response `200`:

```json
{
  "conversationId": "b3e1…",
  "reply": "Avem Pizza Diavola la 30cm (32,00 lei) …",
  "cart": [ { "productId": 12, "variantId": 31, "quantity": 1, "toppingIds": [4] } ],
  "quote": { "…": "QuoteView | null — present when the turn produced a fresh server quote" },
  "placedOrder": { "…": "PlacedOrderView | null — present only on successful placement" }
}
```

- `cart` is always returned (possibly unchanged) and is written verbatim
  into the client store.
- `quote` reuses the existing `QuoteView` shape from `src/lib/quote-types.ts`;
  `placedOrder` reuses `PlacedOrderView` (order number + estimate) so the
  panel can render the confirmation like the checkout does.

Errors:
- `422 {"error":"message_too_long"}` — defense in depth over the zod cap.
- `422 {"error":"conversation_limit"}` — > 40 user messages in this
  conversation; reply advises phone.
- `422 {"error":"daily_limit"}` — > 60 user messages/IP/24h.
- `503 {"error":"assistant_unavailable"}` — provider error (auth, 429,
  5xx, billing/spend limit) or missing API key. The shop is unaffected;
  the panel shows the friendly message + restaurant phone.

## Tool contracts (service-internal, authoritative)

Executed by the assistant service; results are what the model sees. All
data comes from existing services/repositories — these tools contain no
business rules of their own.

### `get_menu` — input `{}`
Returns active categories → products (name, description, ingredients,
allergens) → variants (size label, price bani) → topping groups/toppings
(price bani per variant). Compact projection of the `/api/menu` payload.
When to call: any question about products, prices, ingredients, allergens.

### `get_delivery_zones` — input `{}`
Active zones: `{slug, name, feeBani, freeOverBani}[]`.

### `get_schedule` — input `{}`
Live schedule config: opening intervals per weekday, scheduling rules,
default estimates — the same values checkout reads (feat-007 settings).

### `update_cart` — input `{ items: CartItemInput[], mode: "delivery"|"pickup", zoneSlug?: string }`
Replaces the working cart, then prices it via `quoteCart`. Returns
`QuoteResult` verbatim: `{ok:true, quote}` or `{ok:false, reasons}` (same
422 reason codes as the web — invalid line, inactive product, unknown
zone…). The model must present server prices only.

### `place_order` — input: full `OrderRequest` (existing `orderRequestSchema`)
Calls `placeOrder` with the same context shape as the web route (client
IP; `termsAccepted: true` — the chat UI displays the same T&C link next to
the input). Returns `PlaceOrderResult` verbatim (`{ok:true, order}` or
`{ok:false, reasons}` with existing 422 codes). Tool description mandates:
call ONLY after the customer explicitly confirmed the full summary
(products, quantities, total, mode+address, estimate) — Q5.

## `LlmProvider` interface (src/server/llm/provider.ts)

```ts
interface LlmProvider {
  complete(input: {
    system: string;
    messages: LlmMessage[];      // user | assistant | assistant tool-calls | tool results
    tools: LlmToolDefinition[];  // name, description, JSON-schema input
    maxTokens: number;
  }): Promise<LlmTurnResult>;
}

type LlmTurnResult =
  | { kind: "reply";      text: string;                                usage: LlmUsage }
  | { kind: "tool_calls"; calls: {id: string; name: string; input: unknown}[]; usage: LlmUsage };

interface LlmUsage { inputTokens: number; outputTokens: number }
// Provider failures (auth/429/5xx/billing) throw LlmUnavailableError.
```

- Anthropic adapter: only file importing `@anthropic-ai/sdk`; model from
  `ASSISTANT_MODEL` (one place); prompt caching on system+tools.
- Test fake: same interface, scripted `LlmTurnResult` sequence per
  scenario (03-research D9).
- Contract rule: NOTHING vendor-shaped (block types, stop reasons, SDK
  errors) crosses this interface.

## Env contract (.env.example)

```
ANTHROPIC_API_KEY=            # server-only; absent → ChatFab not rendered, /api/assistant → 503
ASSISTANT_MODEL=claude-opus-4-8   # one-line model swap (owner decision 2026-07-05)
ASSISTANT_MAX_REPLY_TOKENS=1000   # optional; default in code
```
