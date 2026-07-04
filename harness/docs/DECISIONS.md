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
