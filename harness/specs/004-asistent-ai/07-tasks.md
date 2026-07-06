# Tasks: Asistent AI pe site (chat)

> Authored by: Agent (generated from the plan; human reviews order and size).
> Reads from: `04-plan.md`, `05-data-model.md`, `06-contracts/`.
> Feeds into: the working sessions; completion rolls up to `harness/feature-list.json`.
> The feature's execution checklist. The feature list tracks WHAT is done
> project-wide; this file tracks the steps WITHIN the active feature.

## Traceability Rule

Every task exists because of something in the spec, plan, data model, or
contract. If a task has no upstream source, it is scope creep — delete it or
take it back to the spec first.

## Sizing Rule

One task ≈ one focused session step ≈ one commit. If a task says only
"implement feature", it is too large. If completing it takes seconds, merge it.

## Task List (ordered by dependency)

- [x] T01 — LLM module: add `@anthropic-ai/sdk`; `src/server/llm/provider.ts`
      (interface, message/tool/result/usage types, `LlmUnavailableError`);
      `src/server/llm/anthropic.ts` (adapter — model from `ASSISTANT_MODEL`,
      prompt caching on system+tools, typed SDK errors →
      `LlmUnavailableError`; consult the CURRENT SDK reference, not
      training memory); `.env.example` entries. Unit test: adapter is not
      constructible without a key; provider types round-trip
      (source: 03-research D1/D2, 06-contracts provider interface).
- [x] T02 — Schema migration 0005: `assistant_conversations` +
      `assistant_messages` (+ `assistant_role` enum) per 05-data-model;
      `repositories/assistant.ts` (create/load conversation, append
      message with usage, user-message counters per conversation and per
      IP/24h, retention delete > 30 days); integration tests: round-trip,
      ordering, counters, retention cascade
      (source: 05-data-model; 03-research D6).
- [x] T03 — Assistant service core + read tools: `services/assistant.ts`
      with the bounded tool loop (max 6 rounds) over `LlmProvider`, system
      prompt (RO/HU/EN, allergen wording Q7, confirmation rule Q5,
      on-topic guardrails, phone fallback), tools `get_menu`,
      `get_delivery_zones`, `get_schedule`; `tests/helpers/fake-llm.ts`;
      integration tests with the fake: menu answers use real DB data
      (bani prices, active-only), transcript persisted with roles/usage,
      round cap enforced (source: 04-plan tool loop; 06-contracts tools).
- [x] T04 — Cart bridge + `update_cart`: working-copy cart from the
      request, tool prices via `quoteCart` and returns `QuoteResult`
      verbatim; response returns final cart + `quote`; tests: add/modify
      lines lands the exact server quote (SGR, zone fee, threshold),
      invalid lines surface existing reason codes, cart round-trips
      unchanged when untouched (source: 03-research D7; 06-contracts).
- [x] T05 — `place_order` tool + confirmation flow: full `OrderRequest`
      through `placeOrder` (IP context, same 422 codes), `placedOrder`
      in the response; tests: scripted happy path places a DB order
      identical in shape to a web order (snapshot totals in bani, phone
      normalized, estimate), scripted no-confirmation scenario places
      NOTHING, failure reasons round-trip (source: spec FR3/FR4; Q5).
- [x] T06 — Limits + degradation + retention wiring: anti-abuse checks
      (message length, 40/conversation, 60/IP/day → 422 codes),
      `LlmUnavailableError` → 503 `assistant_unavailable`, opportunistic
      retention on conversation create, structured log line per turn;
      tests for each limit code, unavailability, retention run
      (source: 03-research D3/D6; 06-contracts errors).
- [x] T07 — HTTP boundary: `src/lib/assistant-schemas.ts` (zod body) +
      `POST /api/assistant` route (validate → service → shape per
      contract; unknown conversationId → new conversation); tests at the
      route layer: 400 validation, 200 happy shape, 422/503 mapping
      (source: 06-contracts `POST /api/assistant`).
- [ ] T08 — Chat UI: `ChatFab` (hidden on `/admin` and `/comanda`, not
      rendered when the assistant is unconfigured), `ChatPanel`
      (conversation, typing indicator, unavailable/limit states with
      restaurant phone, 375px-first), `useAssistant` (sessionStorage id,
      sends cart from `useCart()`, writes returned cart back), mount in
      `layout.tsx` (source: 04-plan UI; Q8/Q11; 03-research D10).
- [ ] T09 — Privacy + polish: `confidentialitate/page.tsx` paragraph
      (transcripts, 30-day retention), T&C link near the chat input
      (place_order sends `termsAccepted: true`), optional live smoke test
      gated on `ANTHROPIC_API_KEY`; full `./init.sh` green
      (source: Q9; 06-contracts place_order note).
- [ ] T10 — 08-quickstart.md written AND executed against the real API
      (owner key or dev key): flows for menu Q&A (RO/HU/EN), allergens,
      full order via chat landing in the admin panel, shared-cart check,
      outside-hours scheduling, off-topic + injection attempt, limit
      behavior; 09-debug.md; evidence in `harness/feature-list.json`
      (source: spec acceptance criteria; 03-research D9).

## Notes

- T01–T07 are pure backend and fully verifiable offline via the fake
  provider; only T10 needs a real API key.
- `npm test -- tests/assistant` is the feature verification command —
  update `harness/feature-list.json` `verification` when T02 lands the
  first test file.
