# AGENTS.md

> Authored by: Human (the agent proposes additions via the mistake-log pattern).
> Read this file completely at the start of every session, before writing any code.
> Keep this file between 50 and 200 lines. It is an index that routes to topic
> docs, not an encyclopedia. Critical rules live at the top AND bottom on purpose.

## Critical Rules

1. Build only what the spec asks for.
2. One feature at a time — at most one `in-progress` feature in `harness/feature-list.json`.
3. Never mark a feature `done` without running its verification command.
4. Leave a clean state: the next session must be able to run `./init.sh` immediately.

## Project Overview

Royal Food Delivery — magazin online (online ordering) for a pizzeria/restaurant
with home delivery in Sântana de Mureș, România. Replaces the rented Metro dish
(TastyIgniter) storefront with our own mobile-first shop: menu, cart, checkout
with cash/card-on-delivery (v1), and an admin panel for products and orders.
Customer-facing content is in Romanian; code and engineering docs are in English.

## Tech Stack

- TypeScript (strict) on Node.js 26 (>= 20 required)
- Next.js 16 (App Router) + React 19 + Tailwind CSS 4 — one monolith: shop + admin + API
- PostgreSQL 17 in Docker (host port 5433)
- Vitest for tests

<!-- BEGIN:nextjs-agent-rules -->
Next.js 16 has breaking changes — APIs, conventions, and file structure may all
differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing Next-specific code. Heed
deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```bash
# Install:     npm install
# DB (dev):    docker compose up -d db     # Postgres on localhost:5433
# Run:         npm run dev                 # http://localhost:3000
# Test:        npm test
# Lint/types:  npm run lint && npm run typecheck
# Full check:  ./init.sh
```

## Topic Docs — Read When Relevant

- `harness/docs/ARCHITECTURE.md` — layer boundaries and hard constraints. **Required
  reading before changing module structure or crossing a boundary.**
- `harness/docs/DECISIONS.md` — project-wide decisions and why. Read before proposing
  an alternative approach; do not re-litigate settled decisions.
- `harness/docs/QUALITY.md` — module health grades. Read when choosing cleanup work.
- `harness/docs/RUBRIC.md` — scoring rubric for reviewer sessions.
- `harness/docs/references/` — curated notes for external libraries. Read the matching
  file before using a pinned library.

## Startup Workflow (clock in)

1. Read this file completely.
2. Read `harness/feature-list.json` — the source of truth for feature state.
3. Read `harness/PROGRESS.md`, and `harness/SESSION-HANDOFF.md` if one exists.
4. Run `./init.sh` to confirm the repo is healthy.
5. If verification fails, repair that first. Never add new scope on a broken baseline.
6. Review recent history: `git log --oneline -5`.
7. Continue from the handoff's "Recommended Next Step" or harness/PROGRESS.md "Next Steps".

## Work Rules

- Work on exactly one feature at a time. Finish it before starting the next.
- `harness/feature-list.json` holds product behaviors only. Process work
  (verify, document, clean up) is the Definition of Done applied to each
  feature — never a feature entry. (Incident: 2026-07-04, see DEV_LOG.)
- Do not "also refactor" feature B while implementing feature A.
- Do not modify files outside the active feature's `04-plan.md` file targets.
- Every unresolved ambiguity is a coin flip the agent will make silently —
  record the question in the feature's `02-clarify.md` and ask.
- The human decides architecture; the agent implements it.
- Follow the document flow: spec → clarify → research → plan → data-model +
  contracts → tasks → code → quickstart → debug. Skipping a step is a decision
  the human makes, not the agent.

## Safety & State Rules

- Secrets never enter the repo or the harness files: `.env` stays git-ignored;
  `.env.example` (committed) documents the needed keys.
  Never paste secret values into `harness/PROGRESS.md`, logs, or saved output.
- One agent session per repo at a time. Parallel work needs separate git
  worktrees or branches, each with its own state files, merged deliberately.
- One task = one commit; the message says what changed and why.
- Multi-session features live on a `feat/NNN-slug` branch; single-session
  fixes may go straight to the main branch.

## When You Cannot End Clean

Sessions are transactions: hand off clean, or roll back. Never leave the main
branch red for the next session.

1. First shrink scope: finish the smallest verifiable piece, park the rest.
2. Still red? Move the work aside — `git stash`, or commit it to a
   `wip/feat-NNN` branch — and restore the main branch to its last green commit.
3. Record in `harness/PROGRESS.md`: what is red, the exact error, where the WIP lives,
   and the last green commit hash.
4. If the feature cannot proceed without the human, mark it `blocked` in
   `harness/feature-list.json` with the reason.

## Definition of Done

A feature is `done` only when ALL of the following are true, in order:

- [ ] Layer 1 — static checks pass (lint, types).
- [ ] Layer 2 — tests pass (unit + integration), including pre-existing tests.
- [ ] Layer 3 — end-to-end verification passes: the feature's `verification`
      command in `harness/feature-list.json`, plus the manual flow in `08-quickstart.md`
      when the change crosses component boundaries.
- [ ] Evidence (commit hash + verification output) recorded in `harness/feature-list.json`.

Do not proceed to a layer while the previous one fails. "Code is written" is
not done. "Verification passed" is done.

## Session Exit Checklist (clock out)

- [ ] `./init.sh` passes (build, tests, lint).
- [ ] `harness/feature-list.json` statuses updated; evidence recorded.
- [ ] `harness/PROGRESS.md` updated; `harness/SESSION-HANDOFF.md` written if work continues next session.
- [ ] `harness/DEV_LOG.md` entry added (only for notable progress, obstacles, or resolutions).
- [ ] No debug code left (console.log / print / debugger / stray TODO).
- [ ] All completed work committed with a descriptive message.

A session that skips this checklist is not complete.

## Project Map

| File | Owns |
|---|---|
| `AGENTS.md` | Rules, commands, session protocol (this file) |
| `harness/feature-list.json` | Feature state — machine-readable source of truth |
| `harness/PROGRESS.md` | Session continuity snapshot |
| `harness/SESSION-HANDOFF.md` | Formal handoff between sessions |
| `harness/DEV_LOG.md` | Append-only history: progress, obstacles, resolutions |
| `init.sh` | One command that proves the repo is healthy |
| `harness/docs/` | Architecture, decisions, quality, rubric, references |
| `harness/specs/NNN-name/` | One folder per feature: the numbered chain `01-spec.md` … `09-debug.md` |

## Escalation

- **Architecture decision needed** → check `harness/docs/ARCHITECTURE.md` and
  `harness/docs/DECISIONS.md`; if unanswered, stop and ask the human.
- **Unclear requirement** → record in the feature's `02-clarify.md`, ask the human.
- **Repeated verification failure** → log it in `harness/PROGRESS.md` blockers and the
  feature's `09-debug.md`; flag for human review instead of thrashing.

## How This File Grows

Add a rule only when the agent makes a real mistake (the mistake-log pattern).
A 20-line file built from real incidents is worth more than a 200-line file
written speculatively on day one. When a rule keeps being violated, promote it
from instruction to enforcement: a check in `./init.sh` or a test.

## Reminder — Critical Rules

1. Build only what the spec asks for.
2. One feature at a time.
3. Never mark a feature done without running its verification command.
4. Leave a clean state for the next session.
