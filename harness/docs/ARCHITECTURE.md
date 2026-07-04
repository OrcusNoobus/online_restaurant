# ARCHITECTURE.md

> Authored by: Human (agents read; changes require human approval).
> Reads from: project-wide decisions in `harness/docs/DECISIONS.md`.
> Feeds into: every `04-plan.md`; enforced by boundary checks in `./init.sh`.
> Rules here use MUST / MUST NOT language so there is nothing to interpret.
> Enforce invariants; don't micromanage implementation.

## Layers

One Next.js monolith. Dependencies flow strictly forward (left to right):

```
src/lib → src/server/db → src/server/repositories → src/server/services → src/app
```

- `src/lib` — pure shared code: money helpers, zod schemas, formatting. No I/O.
- `src/server/db` — Drizzle schema, migrations, the single db client. (Created in feat-002.)
- `src/server/repositories` — every SQL query lives here, one file per aggregate.
- `src/server/services` — business rules that span repositories (order totals, delivery rules).
- `src/app` — Next.js App Router: pages (server components) and API route handlers.
- `src/components` — presentational UI only; receives plain props, renders. Sits
  beside the chain and MUST NOT import from `src/server`.

Cross-cutting concerns enter through explicit provider interfaces. Anything
else is forbidden.

## Hard Constraints

- Code outside `src/server/` MUST NOT import `@/server/db`.
  - WHY: keeps SQL in one reviewable place and guarantees the db client can
    never leak into a client-side bundle.
- `src/components/` MUST NOT import from `src/server/`.
  - WHY: components stay testable and reusable; pages fetch, components render.
- Money values MUST be safe integers in bani (1 leu = 100 bani), using
  `src/lib/money.ts` helpers. Floats MUST NOT be used for prices or totals.
  - WHY: floating-point rounding corrupts order totals; 0.1 + 0.2 !== 0.3.
- Order totals MUST be computed server-side from database prices. A price or
  total sent by the client MUST never be trusted.
  - WHY: anyone can edit a request; trusting client prices means paying wrong amounts.
- All data crossing a system boundary (API bodies, form input, URL params)
  MUST be validated with zod at that boundary.
  - WHY: internal code can then trust its inputs; no defensive re-validation everywhere.
- Business operations (menu queries, cart pricing, order placement/status)
  MUST live in `src/server/services` (or repositories for pure reads) and MUST
  NOT be implemented inside pages, components, or route handlers. Route
  handlers validate, call a service, and shape the response — nothing more.
  - WHY: the web shop is only the first channel. The planned LLM chat
    assistant and WhatsApp/Telegram channels (see DECISIONS.md 2026-07-04)
    must call the same operations; logic trapped in the UI would force a
    rewrite per channel.

## Boundary Checks (executable)

Documentation is advisory; checks are enforcement. These are wired into
`./init.sh` so a violation fails immediately instead of waiting for review.
Every check speaks the agent-oriented error format: ERROR / WHY / FIX.

Currently enforced:

1. `@/server/db` imported outside `src/server/` → fail.
2. `@/server` imported inside `src/components/` → fail.

Money-as-integer and zod-at-boundaries are enforced by tests and review until
a reliable static check exists (candidate: forbid `parseFloat`/`toFixed` near
price fields — add it after the first real incident).

## Module Map

| Module | Responsibility | May depend on |
|---|---|---|
| `src/lib` | Pure helpers: money, validation schemas | — |
| `src/server/db` | Drizzle schema, migrations, db client | `src/lib` |
| `src/server/repositories` | All SQL queries | `src/server/db`, `src/lib` |
| `src/server/services` | Business rules across repositories | `src/server/repositories`, `src/lib` |
| `src/app` | Pages + API route handlers | `src/server/*`, `src/components`, `src/lib` |
| `src/components` | Presentational UI | `src/lib` only |

## Observability

Agents debug from signals, not guesses. The minimum bar for this repo:

- Structured logs at the boundaries: every route handler and service logs
  start/success/failure with context (ids, counts, durations) — one parseable
  line each (key=value or JSON).
- Errors carry context: message + the input that caused it + stack trace. An
  error a log line cannot explain is an observability bug — fix the logging
  together with the bug.
- Dev logs go to the `npm run dev` terminal; production logs to
  `docker logs <app>` on the VPS. A fresh session must find them without asking.

## How Rules Get Added Here

A recurring review comment is a rule waiting to be written. The workflow:

1. Notice the same correction twice.
2. Write the underlying rule here in MUST / MUST NOT form.
3. Turn it into an executable check in `./init.sh` with an ERROR/WHY/FIX message.
4. Delete rules whose checks have never fired in months — stale rules are noise.
