# DECISIONS.md

> Authored by: Both (human decides; agent records and may propose).
> Reads from: feature-level `03-research.md` files (durable decisions get promoted here).
> Feeds into: `harness/docs/ARCHITECTURE.md`, every future `04-plan.md`.
> Project-wide decisions and the reasoning behind them. An agent that knows WHY
> a decision was made will not quietly undo it three sessions later.

## How To Use This File

- Record decisions that outlive a single feature: stack choices, storage,
  auth strategy, API style, hosting.
- Feature-local choices stay in that feature's `03-research.md`; promote them
  here only when other features start depending on them.
- Newest entries first. Never delete an entry — supersede it and link both ways.
- Do not re-litigate settled decisions; open a new entry that supersedes the old
  one if circumstances genuinely changed.

## Entry Format

```
## [YYYY-MM-DD]: [Decision title]
- Decision: [what was decided]
- Reason: [why — the constraint or evidence that drove it]
- Rejected alternatives: [what else was considered, and why not]
- Constraints created: [what this commits us to]
- Supersedes / superseded by: [link, if any]
```

## Decisions

## [2026-07-05]: LLM access is provider-agnostic behind our own interface; the model is configuration
- Decision: All LLM calls go through a minimal self-owned `LlmProvider` interface (`src/server/llm/`); the Anthropic SDK adapter is the first implementation and the only file importing the vendor SDK. The model id is a single env config (`ASSISTANT_MODEL`, default `claude-opus-4-8`) read in one place — swapping models is a config edit, swapping providers is a new adapter, never a rewrite of the assistant.
- Reason: Owner requirement (2026-07-05): change models freely as real usage data arrives, and keep the door open to other providers. Also enables deterministic testing — the test suite injects a scripted fake through the same interface, so `./init.sh` stays green offline without secrets.
- Rejected alternatives: direct SDK calls in services (vendor types leak, rewrite on provider change); third-party abstraction frameworks like LangChain (heavy dependency to avoid a dependency; our tool surface is 5 tools).
- Constraints created: `src/server/llm` may import only `src/lib`; services import the interface, never the SDK; the agentic tool loop is OUR code in the services layer. No LLM calls from the client, ever.
- Supersedes / superseded by: —

## [2026-07-05]: LLM cost governance lives in the provider console, not in code
- Decision: The monthly spend cap is set and adjusted by the owner in the provider's platform (Anthropic Console spend limit). The application implements NO budget accounting; it translates provider errors/unavailability into a polite "assistant unavailable" state that never affects the shop. Code keeps only anti-abuse limits (message length, messages per conversation, per-IP daily cap) and LOGS token usage per message for visibility.
- Reason: Owner decision (2026-07-05). The console limit is authoritative and cannot drift from the bill; in-code accounting would duplicate it with estimate error and maintenance cost.
- Rejected alternatives: in-code monthly budget counter with hard stop (drift, duplicate source of truth).
- Constraints created: assistant features must degrade gracefully on any provider error; the web shop must be fully functional with the assistant down or unconfigured (no API key → chat hidden/disabled).
- Supersedes / superseded by: —

## [2026-07-04]: Channel-agnostic ordering core (conversational commerce ready)
- Decision: Every business capability (menu queries, cart pricing, order placement, order status) is implemented in the services layer and exposed through the API — never inside web UI components. The web shop is just the FIRST consumer; an on-site LLM chat assistant that can answer questions and place orders on the customer's behalf, and external channels (WhatsApp, Telegram), are planned consumers of the SAME services (roadmap: feat-008, feat-009).
- Reason: The owner wants conversational ordering as a first-class channel. If ordering logic is baked into the web UI, every new channel means a rewrite; behind a service/API boundary, a new channel is just a new adapter. LLM tool-calling also needs exactly this: clean, well-described, validated service endpoints.
- Rejected alternatives: Build web-first and extract services later (extraction is always more expensive than starting clean); separate backend per channel (duplicated business rules, prices drifting apart between channels).
- Constraints created: `src/server/services` is the single entry point for business operations; API contracts (06-contracts/) are written as if a non-browser client will call them — because one will. The backend runs as a persistent server (already true: VPS + Docker, no serverless).
- Supersedes / superseded by: —

## [2026-07-04]: Money is integer bani everywhere
- Decision: All prices, totals, and discounts are safe integers in bani (1 leu = 100 bani), formatted only at the display edge via `src/lib/money.ts`.
- Reason: Floating-point arithmetic corrupts money totals; an order system cannot round wrong.
- Rejected alternatives: JS floats (rounding bugs), decimal libraries (unneeded weight for RON-only v1).
- Constraints created: DB price columns are `integer`; contracts express prices in bani; violating code fails review.
- Supersedes / superseded by: —

## [2026-07-04]: Payments v1 — cash/card at delivery only
- Decision: v1 takes orders with payment on delivery (cash or card terminal), exactly like the Metro dish shop today. Online card payment is a v2 feature.
- Reason: Zero banking integration, zero processor fees, much faster launch; current customers already pay this way.
- Rejected alternatives: Netopia/Stripe from day one — merchant onboarding and integration would delay launch by weeks.
- Constraints created: The order model carries a `payment_method` field from day one so online payment slots in without a migration of meaning.
- Supersedes / superseded by: —

## [2026-07-04]: Hosting target — own VPS with Docker
- Decision: Production runs on a small VPS (e.g. Hetzner) as Docker containers (app + Postgres).
- Reason: Fixed low cost, full control, no vendor lock-in; the owner keeps the data.
- Rejected alternatives: Vercel + cloud DB — simple deploys but variable cost and external DB dependency.
- Constraints created: The app MUST stay dockerizable and MUST NOT use platform-only features (Vercel KV, edge-only APIs, etc.).
- Supersedes / superseded by: —

## [2026-07-04]: PostgreSQL 17 in Docker
- Decision: PostgreSQL 17 (alpine image) is the only database, in dev (docker-compose, host port 5433) and production.
- Reason: Industry standard, runs anywhere Docker runs, will never need replacing at this project's scale or beyond.
- Rejected alternatives: SQLite — zero-config but limits hosting options and concurrent-write patterns.
- Constraints created: Docker is required for dev and prod; `./init.sh` starts and health-checks the db.
- Supersedes / superseded by: —

## [2026-07-04]: Stack — Next.js 16 + TypeScript monolith
- Decision: One Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + TypeScript application containing the customer shop, the admin panel, and the API.
- Reason: One language and one deployable for a small team; largest ecosystem; mobile-first rendering out of the box; Node 26 already on the dev machine.
- Rejected alternatives: SvelteKit (smaller ecosystem), Django + separate frontend (two languages, two apps to maintain), microservices (absurd overhead for one restaurant).
- Constraints created: Next-specific conventions apply — read `node_modules/next/dist/docs/` before Next-specific code (see AGENTS.md).
- Supersedes / superseded by: —
