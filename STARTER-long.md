# STARTER — Long Workflow (Complex Projects)

## What This File Does

You (the LLM reading this) will bootstrap a complete agent harness for a new,
complex project in one sitting: interview the human, generate the full
scaffold (root state files, topic docs, and the first feature's spec chain),
run the initialization phase, verify it, and hand off. Everything you need is
embedded below — no other files required.

Use this starter when the work has real design decisions, spans weeks and many
sessions, or involves more than one person or agent role. For small, obvious
work, `STARTER-short.md` is the better fit — say so if the interview reveals a
small project, and let the human decide.

## Rules For The LLM

1. Ask interview questions **one at a time**. Wait for each answer.
2. Do not invent answers. If the human is unsure, offer a sensible default and
   say it is a default.
3. Substitute every `[PLACEHOLDER]` in the embedded templates with real
   answers. Placeholders may survive only inside per-feature files, as honest
   gaps for the human — and you must list those gaps at handoff.
4. Generate files exactly as specified — same names, same locations.
5. After generating, run the verification in the final steps honestly. Report
   failures; do not paper over them.
6. Detect before you ask: if you have shell access, run Step 0 first and turn
   every question it already answers into a confirmation. If you have no shell
   access, say so — ask the human either to enable tools or to run the Step 0
   snippet and paste its output. Never assume a machine fact you could detect
   or ask for.

---

## Step 0 — Detect The Machine (before any questions)

If you have shell access, interrogate the machine first — detection beats
asking, and asking beats assuming:

```bash
uname -s                                   # operating system
command -v bash >/dev/null && bash --version | head -1
command -v git  >/dev/null && git --version
for t in python3 node go cargo java dotnet; do
  command -v "$t" >/dev/null && echo "$t: $("$t" --version 2>&1 | head -1)"
done
for m in uv poetry npm pnpm yarn bun; do
  command -v "$m" >/dev/null && echo "manager: $m"
done
```

Present a short **Machine Summary** — OS, runtimes + versions, managers
found — then run the interview, turning every question the summary already
answers into a confirmation ("I found Python 3.12 and uv — use those?").

If you have NO shell access: say so explicitly, and ask the human either to
enable a shell tool or to run the snippet above and paste its output. Never
fill machine facts from assumption.

## Step 1 — Interview The Human

Ask these questions in order, one at a time:

**Q1.** What is the project's name, and in one or two sentences, what does it
do and for whom?

**Q2.** What is the tech stack? (language + version, framework, database /
storage, anything pinned)

**Q3.** What are the real commands for: install, run, test, lint/type-check,
build? (If the project is brand new, agree on what they WILL be — the
initialization phase must make them work.) Then ask the second half: how does
a clean machine get a working environment — is an isolated environment or
version manager involved (Python venv / uv / poetry, Node version +
npm / pnpm / yarn)? The answer becomes step 0 of `init.sh`.

**Q4.** How is the system organized — what layers or modules exist (or should
exist), and are there one to three hard constraints you already know?
(e.g. "the renderer must never touch the filesystem directly", "all queries go
through the repository layer"). These seed `harness/docs/ARCHITECTURE.md`; MUST/MUST
NOT wording is applied for you.

**Q5.** What is the first feature? One sentence of observable behavior — what
a user or client can do when it works — plus the command that would prove it.

**Q6.** Are there external libraries the agent has repeatedly gotten wrong, or
that are pinned to unusual versions? (If yes, you will create
`harness/docs/references/[lib].md` stubs at the end, per the conventions summarized in
`harness/docs/references/README.md`.)

---

## Step 2 — Create Root-Level Files

Create the files below at exactly the paths shown — `AGENTS.md` and `init.sh`
in the project root, everything else under `harness/` — substituting the
interview answers. Make `init.sh` executable (`chmod +x init.sh`). Where a
file needs more than substitution, its rules sit directly above its embedded
template below.
`harness/SESSION-HANDOFF.md` is created as an empty template now and filled at the
first real handoff. Also create `CLAUDE.md` containing exactly one line —
`Read AGENTS.md — the single source of truth for this project.` — so tools
that auto-load `CLAUDE.md` find the rules.

### File 1: `AGENTS.md`

````markdown
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

[PROJECT_NAME] — [One or two sentences: what this project is and who it is for.]

## Tech Stack

- [Language + version]
- [Framework + version]
- [Database / storage]

## Commands

```bash
# Install:     [INSTALL_COMMAND]
# Run:         [RUN_COMMAND]
# Test:        [TEST_COMMAND]
# Lint/types:  [LINT_COMMAND]
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
  `.env.example` (committed) documents the needed keys with blank values.
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

---
*Harness: New_harness v3.0.1 (2026-07-03). When the harness repo's templates
improve, diff this project's harness files against them and adopt what helps.*
````

### File 2: `harness/feature-list.schema.json`

````json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Feature List",
  "description": "Machine-readable source of truth for feature state. Each feature is a (behavior, verification, status) triple: what it does, how to prove it, and where it stands. Agents read and update this file; the human approves the list itself. At most ONE feature may be 'in-progress' at a time (WIP=1).",
  "type": "object",
  "properties": {
    "project": {
      "type": "string",
      "description": "Project name"
    },
    "features": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "Unique feature identifier",
            "pattern": "^feat-\\d{3}$"
          },
          "name": {
            "type": "string",
            "description": "Short feature name"
          },
          "behavior": {
            "type": "string",
            "description": "The observable behavior in product terms — what a user or client can do when this feature works. Scope each feature so it is completable in one session."
          },
          "verification": {
            "type": "string",
            "description": "Executable command (or precise manual check) that proves the behavior. A feature without a verification command cannot be marked done."
          },
          "dependencies": {
            "type": "array",
            "items": { "type": "string", "pattern": "^feat-\\d{3}$" },
            "description": "Feature IDs that must be done before this one starts"
          },
          "status": {
            "type": "string",
            "enum": ["not-started", "in-progress", "blocked", "done"],
            "description": "Current state. 'done' means the verification command passed — nothing less. The transition to 'done' happens only after running the verification."
          },
          "evidence": {
            "type": "string",
            "description": "Proof recorded when status becomes 'done': commit hash, test output summary, or verification transcript. Empty until then."
          },
          "spec": {
            "type": "string",
            "description": "Optional path to this feature's spec folder, e.g. 'harness/specs/001-personal-tasks/'"
          }
        },
        "required": ["id", "name", "behavior", "verification", "status"]
      }
    }
  },
  "required": ["features"]
}
````

### File 3: `harness/feature-list.json`

Build from the interview. Rules:

- `feat-001` (project setup) and `feat-002` (the Q5 feature, with its real
  behavior and verification) are **required**.
- `feat-003`, `feat-004`, and `feat-005` are **optional scaffold features** —
  ask the human which to keep before generating the file.
- If you trim any feature, **re-wire the dependencies** of the ones that
  remain to the nearest kept predecessor (e.g. removing `feat-004` means
  `feat-005` depends on `feat-003`). No `dependencies` entry may point to an
  id that is not in the file.

````json
{
  "$schema": "./feature-list.schema.json",
  "project": "[PROJECT_NAME]",
  "features": [
    {
      "id": "feat-001",
      "name": "Project setup",
      "behavior": "The project installs, verifies, and starts from a clean checkout; harness/docs/ARCHITECTURE.md and this feature list exist and are committed",
      "verification": "./init.sh",
      "dependencies": [],
      "status": "not-started",
      "evidence": "",
      "spec": ""
    },
    {
      "id": "feat-002",
      "name": "[FIRST_FEATURE_NAME]",
      "behavior": "[Observable behavior in product terms, e.g. 'POST /api/tasks with a title returns 201 and the created task']",
      "verification": "[Command that proves the behavior, e.g. 'pytest tests/test_tasks.py -x']",
      "dependencies": ["feat-001"],
      "status": "not-started",
      "evidence": "",
      "spec": "harness/specs/001-[FEATURE_SLUG]/"
    },
    {
      "id": "feat-003",
      "name": "Verification coverage",
      "behavior": "The active feature has unit, integration, and end-to-end verification wired into ./init.sh and 08-quickstart.md",
      "verification": "./init.sh",
      "dependencies": ["feat-002"],
      "status": "not-started",
      "evidence": "",
      "spec": ""
    },
    {
      "id": "feat-004",
      "name": "Documentation update",
      "behavior": "README, harness/docs/ARCHITECTURE.md, harness/docs/DECISIONS.md, and contracts affected by the implemented feature are current",
      "verification": "Manual review against the promotion rules in specs/*/09-debug.md",
      "dependencies": ["feat-003"],
      "status": "not-started",
      "evidence": "",
      "spec": ""
    },
    {
      "id": "feat-005",
      "name": "Cleanup and handoff",
      "behavior": "Evidence recorded, PROGRESS.md and SESSION-HANDOFF.md current, repo restartable via ./init.sh",
      "verification": "./init.sh",
      "dependencies": ["feat-004"],
      "status": "not-started",
      "evidence": "",
      "spec": ""
    }
  ]
}
````

### File 4: `harness/PROGRESS.md`

````markdown
# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** [TODAY'S DATE + TIME]
- **Active feature:** none
- **Latest commit:** none yet
- **Verification status:** not yet run

## Done

- [x] Harness scaffold generated from STARTER-long.md

## In Progress

- [ ] Initialization phase: make ./init.sh pass from a clean checkout

## Next Steps

1. Complete the initialization phase (feat-001): environment installs, at least one test passes, boundary checks wired, ./init.sh green.
2. Commit the clean checkpoint.
3. Fill in harness/specs/001-[FEATURE_SLUG]/01-spec.md and 02-clarify.md with the human, then start feat-002.

## Blockers / Risks

- None.

## Decisions Made This Session

- (none yet — durable ones go to harness/docs/DECISIONS.md)

## Files Modified This Session

- (scaffold files created)

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
````

### File 5: `harness/SESSION-HANDOFF.md`

Created as a template now; filled at the first real handoff.

````markdown
# SESSION-HANDOFF.md

> Authored by: Agent (written at the end of a session whose work continues).
> Reads from: `harness/PROGRESS.md`, `harness/feature-list.json`.
> Feeds into: the next session's startup workflow.
> PROGRESS.md is the running snapshot; this file is the formal baton pass —
> everything a fresh session needs, in one place, with evidence.

## Current Objective

- **Goal:** [what the active feature is trying to achieve]
- **Active feature:** [feat-NNN — name]
- **Status:** [where the work stands, one or two sentences]
- **Branch / commit:** [branch @ hash]

## Completed This Session

- [x] [Item, with the task it maps to in the feature's 07-tasks.md]

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Static (layer 1) | `[lint/typecheck command]` | [pass/fail] | |
| Tests (layer 2) | `[test command]` | [e.g. 42/43 passing] | [failing test name if any] |
| End-to-end (layer 3) | `[feature verification command]` | [pass/fail/not run] | |

## Files Changed

- `path/to/file` — [one-line description]

## Decisions Made

- **[Decision]**: [why; alternatives rejected. Promote durable ones to harness/docs/DECISIONS.md]

## Blockers / Risks

- [Blocker: description, impact, what would unblock it — or "none"]

## Next Session Startup

1. Read `AGENTS.md`.
2. Read `harness/feature-list.json` and `harness/PROGRESS.md`.
3. Review this handoff.
4. Run `./init.sh` before editing anything.

## Recommended Next Step

[The single concrete action the next session should take first.]
````

### File 6: `harness/DEV_LOG.md`

````markdown
# DEV_LOG.md

> Authored by: Agent (the human may add entries too).
> Reads from: — (parallel to the workflow chain, not part of it).
> Feeds into: institutional memory; promotion into AGENTS.md rules when patterns repeat.
> This is the append-only history. PROGRESS.md says where we are;
> this file says how we got here. Newest entries first.

## Entry Format

```
## [YYYY-MM-DD] — [Short title]
- Status: Completed | In Progress | Failed
- Action: [what was done]
- Challenge: [obstacle hit, if any]
- Solution: [how it was resolved, if it was]
```

## When To Write Here

Write an entry when a session produced notable progress, hit a real obstacle,
or resolved one. Do not log routine work — feature state already lives in
`harness/feature-list.json`, and session detail lives in `harness/PROGRESS.md`. A challenge
that repeats across entries is a candidate for an AGENTS.md rule or an
`init.sh` check (the mistake-log pattern).

## Log

## [YYYY-MM-DD] — [First entry: project initialized]
- Status: Completed
- Action: [e.g. Ran initialization phase: scaffold created, ./init.sh passing, first commit]
- Challenge: —
- Solution: —
````

### File 7: `init.sh`

Replace the placeholder comments with the real commands from Q3, delete unused lines, and `chmod +x init.sh`. If Q3 revealed an isolated environment, step 0 creates it idempotently and every later command calls that environment's binaries by path — scripts never rely on `activate`.

````bash
#!/usr/bin/env bash
# init.sh — the standard startup and verification path.
# One command that proves the repo is healthy. Run it at the start of every
# session (clock in) and before ending one (clock out).
# Keep it fast, keep it honest: if it passes, the repo is genuinely workable.
#
# Replace the placeholder commands below with your project's real commands,
# then delete the comments you don't need.
set -e

echo "=== [PROJECT_NAME] verification ==="

# 0. Environment (idempotent — delete if the stack needs none)
#    Create the isolated environment if missing; every later command calls
#    that environment's binaries by path. Scripts never rely on 'activate'.
# [ENV_SETUP_COMMAND]        e.g.  [ -d .venv ] || python3 -m venv .venv

# 1. Install dependencies (must be idempotent)
# [INSTALL_COMMAND]          e.g.  npm install            |  ./.venv/bin/pip install -e ".[dev]"

# 2. Static checks — layer 1: syntax, types, lint
# [LINT_COMMAND]             e.g.  npm run lint           |  ./.venv/bin/ruff check src/
# [TYPECHECK_COMMAND]        e.g.  npm run typecheck      |  ./.venv/bin/mypy src/ --strict

# 3. Tests — layer 2: runtime behavior
# [TEST_COMMAND]             e.g.  npm test               |  ./.venv/bin/pytest tests/ -x

# 4. Build / startup check — layer 3 entry: the app still builds and starts
# [BUILD_COMMAND]            e.g.  npm run build          |  docker compose config -q

echo "=== Verification complete ==="
echo ""
echo "Next steps:"
echo "1. Read harness/feature-list.json — pick the ONE active (or next unblocked) feature"
echo "2. Read harness/PROGRESS.md — continue from 'Next Steps'"
echo "3. Implement only that feature"
echo "4. Re-run ./init.sh and the feature's verification before claiming done"
````

---

## Step 3 — Create Topic Docs (`harness/docs/`)

Seed `ARCHITECTURE.md` with the Q4 layers and hard constraints in
MUST / MUST NOT wording. The other docs start as templates and grow
with the project.

### File 8: `harness/docs/ARCHITECTURE.md`

````markdown
# ARCHITECTURE.md

> Authored by: Human (agents read; changes require human approval).
> Reads from: project-wide decisions in `harness/docs/DECISIONS.md`.
> Feeds into: every `04-plan.md`; enforced by boundary checks in `./init.sh`.
> Rules here use MUST / MUST NOT language so there is nothing to interpret.
> Enforce invariants; don't micromanage implementation.

## Layers

[Describe your layers and the direction dependencies are allowed to flow, e.g.:]

```
types → config → repositories → services → runtime → UI
```

- Dependencies flow strictly forward (left to right).
- Cross-cutting concerns enter through explicit provider interfaces.
- Anything else is forbidden.

## Hard Constraints

- [Layer/module] MUST NOT import from [layer/module].
  - WHY: [the failure this prevents]
- All data crossing a system boundary MUST be validated at that boundary.
  - WHY: internal code can then trust its inputs; no defensive re-validation everywhere.
- [Add constraints earned from real incidents — see the promotion rule in 09-debug.md]

## Boundary Checks (executable)

Documentation is advisory; checks are enforcement. Wire these into `./init.sh`
so a violation fails immediately instead of waiting for review. Every check
speaks the agent-oriented error format: ERROR / WHY / FIX.

```bash
# Example: forbid direct filesystem access outside the storage layer
if grep -rn "require('fs')" src/ --include='*.ts' | grep -v "src/storage/"; then
  echo "ERROR: direct 'fs' import outside src/storage/"
  echo "WHY:   only the storage layer may touch the filesystem (see harness/docs/ARCHITECTURE.md)"
  echo "FIX:   move the file operation into src/storage/ and call it through its interface"
  exit 1
fi
```

## Module Map

| Module | Responsibility | May depend on |
|---|---|---|
| `[src/module]` | [one line] | [modules] |

## Observability

Agents debug from signals, not guesses. The minimum bar for this repo:

- Structured logs at the boundaries: every module entry point logs
  start/success/failure with context (ids, counts, durations) — one parseable
  line each (key=value or JSON).
- Errors carry context: message + the input that caused it + stack trace. An
  error a log line cannot explain is an observability bug — fix the logging
  together with the bug.
- The standard startup path documents where logs go. A fresh session must
  find them without asking.

## How Rules Get Added Here

A recurring review comment is a rule waiting to be written. The workflow:

1. Notice the same correction twice.
2. Write the underlying rule here in MUST / MUST NOT form.
3. Turn it into an executable check in `./init.sh` with an ERROR/WHY/FIX message.
4. Delete rules whose checks have never fired in months — stale rules are noise.
````

### File 9: `harness/docs/DECISIONS.md`

````markdown
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

## [YYYY-MM-DD]: [Example — replace me]
- Decision: [e.g. Use Redis for user-preference caching]
- Reason: [e.g. read on every API call, tiny payload, tolerates 5-minute staleness]
- Rejected alternatives: [e.g. PostgreSQL materialized view — refresh cost too high at our write rate]
- Constraints created: [e.g. cache TTL 5 minutes; writes must actively invalidate]
- Supersedes / superseded by: —
````

### File 10: `harness/docs/QUALITY.md`

````markdown
# QUALITY.md

> Authored by: Agent (updated during periodic cleanup; human sets the cadence).
> Reads from: verification runs, `09-debug.md` incidents, review findings.
> Feeds into: cleanup priorities; the next session reads this to pick maintenance work.
> A living health report per module. Entropy growth is the default —
> this file makes it visible before it becomes expensive.

## How To Use This File

- Grade every significant module A–D across the five dimensions below.
- Update during **periodic cleanup** (weekly or after every N features), not
  every session — session-level state lives in `harness/PROGRESS.md`.
- When picking cleanup work, start with the lowest grade.
- A module that stays at C or D for two consecutive reviews becomes a
  `harness/feature-list.json` entry ("raise [module] to grade B") so the work is
  scheduled instead of wished for.

## Grading Dimensions

| Dimension | Question it answers |
|---|---|
| Verification passing | Do this module's checks actually pass? (Yes / Partial / No) |
| Agent understandable | Can a fresh session work here without spelunking? (Yes / Difficult / Impossible) |
| Test stability | Stable / Flaky / Broken |
| Architecture boundaries | Compliant / Violations present |
| Code conventions | Followed / Partially / Not followed |

## Modules

## [Module name] (Quality: [A–D])
- Verification passing: [Yes / Partial / No — detail]
- Agent understandable: [Yes / Difficult / Impossible — detail]
- Test stability: [Stable / Flaky / Broken — name flaky tests]
- Architecture boundaries: [Compliant / Violations — cite them]
- Code conventions: [Followed / Partially / Not followed]
- Notes: [what would move this up one grade]

## Periodic Cleanup Checklist

- [ ] Re-grade every module above.
- [ ] Scan for debug code, dead files, stray TODOs across the repo.
- [ ] Run the full verification suite including slow end-to-end checks.
- [ ] Retire AGENTS.md rules and boundary checks that no longer fire (stale rules are noise).
- [ ] Promote recurring 09-debug.md incidents into rules or checks.
````

### File 11: `harness/docs/RUBRIC.md`

````markdown
# RUBRIC.md

> Authored by: Human (agents apply it; only the human changes the bar).
> Reads from: `01-spec.md` acceptance criteria, `harness/docs/ARCHITECTURE.md`.
> Feeds into: reviewer-session verdicts; sprint pass/fail.
> The writer/reviewer pattern needs an explicit bar. This rubric turns
> "does it feel done?" into evidence-based scoring: two different reviewers
> should reach the same grade.

## How To Use This File

1. Implement in one session (the writer).
2. Review in a **fresh** session (the reviewer) — a fresh context has no
   attachment to the code and no tunnel vision.
3. The reviewer scores every dimension below and cites evidence (commands run,
   output seen) — never impressions.
4. Any dimension at D fails the review. The writer session gets the scored
   rubric plus ERROR/WHY/FIX notes as its fix list.

## Scoring Rubric

| Dimension | A | B | C | D |
|---|---|---|---|---|
| Correctness | All acceptance criteria verified passing | Main flows pass; minor gaps listed | Partial; known failures | Build or tests fail |
| Architecture compliance | Fully compliant with ARCHITECTURE.md | Minor deviations, noted | Obvious deviations | Boundary violations |
| Test coverage | Main flows + edge cases | Main flows only | Skeleton tests | No meaningful tests |
| Scope discipline | Only spec'd behavior; file targets respected | Trivial drift, justified | Unrequested changes present | Unrelated refactors mixed in |
| Handoff quality | State files current; evidence recorded | Minor gaps | Stale state files | No usable handoff |

## Review Report Format

```
## Review: [feat-NNN] — [date]
Verdict: PASS | FAIL
| Dimension | Grade | Evidence |
|---|---|---|
| Correctness | A | ran `./init.sh` + `[verification]`: all passing |
| ...

Required fixes (if FAIL):
- ERROR: [what is wrong]
  WHY:   [why it matters]
  FIX:   [specific repair step]
```
````

### File 12: `harness/docs/references/README.md`

````markdown
# harness/docs/references/

Curated notes for external libraries, one file per library
(e.g. `django-rest-framework.md`, `stripe.md`).

Create a file here only when it earns its place:

- The agent was corrected **twice** on the same library, or
- The library is version-pinned and its current docs differ from what models
  assume, or
- The project uses it in a deliberately non-standard way.

Each file: pin the version, date it (`Last reviewed: YYYY-MM-DD`), show the
project's own conventions and 2–3 real code patterns, list gotchas that
actually happened, keep it under 300 lines. A stale reference file is worse
than no reference file — delete or re-review on every major upgrade.

Full conventions: see `core/docs/external-docs.md` in the harness repo.
````

---

## Step 4 — Create The First Feature Folder

Create `harness/specs/001-[FEATURE_SLUG]/` (plus its `06-contracts/` subfolder)
with the nine files below. Pre-fill everything the interview answered —
the Q5 behavior and verification go into `01-spec.md`'s acceptance
criteria and `harness/feature-list.json`. Leave honest `[...]` markers where
only the human can decide, and list every gap at handoff. Skip
conditions (apply with the human's consent): `03-research.md` if there are
no options to weigh, `05-data-model.md` if no entities, `06-contracts/` if no
interface. Deleting an empty file is honest; filling it with filler is not.

### File 13: `harness/specs/001-[FEATURE_SLUG]/01-spec.md`

````markdown
# Spec: [FEATURE_NAME]

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.

## Goal

[One paragraph: what this feature achieves and why it matters.]

## User Story

As a [kind of user], I want to [action], so that [benefit].

## Scope

### In scope

- [Capability 1]
- [Capability 2]

### Out of scope

- [Explicitly excluded thing 1]
- [Explicitly excluded thing 2]

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. [Requirement — testable, in product terms]
2. [Requirement]

## Non-Functional Requirements

- [e.g. p95 latency, auth requirements, data retention — or "none for v1"]

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and the
flows in `08-quickstart.md`.

- [ ] [Behavior, e.g. "POST /api/tasks with a valid title returns 201 and the task"]
  - Verify: `[command]`
- [ ] [Behavior — include at least one failure path, e.g. "unauthenticated request returns 401"]
  - Verify: `[command]`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, and nothing outside the in-scope list has been changed.
````

### File 14: `harness/specs/001-[FEATURE_SLUG]/02-clarify.md`

````markdown
# Clarify: [FEATURE_NAME]

> Authored by: Both (agent asks; human answers; agent records).
> Reads from: `01-spec.md`.
> Feeds into: `04-plan.md`, `05-data-model.md`, `06-contracts/`.
> Every unresolved ambiguity is a coin flip the agent will make silently.
> This file replaces silent assumptions with recorded answers.

## How To Use This File

- Before planning, the agent lists every ambiguity it finds in the spec as a
  numbered question. The human answers. Both happen here, in writing.
- Answers are definitive. If an answer changes the contract or data model,
  update those files in the same session — this file records intent, they
  record truth.
- New questions found mid-implementation get added here first, then answered,
  then work resumes. No guessing.

## Resolved Questions

### Q1: [Question, e.g. "Is the description field required when creating a task?"]

**Answer:** [Definitive answer, e.g. "No. Optional; defaults to empty string."]

### Q2: [Question]

**Answer:** [Answer]

## Open Questions

- [Question waiting on the human — the feature is `blocked` in
  `harness/feature-list.json` while anything sits here]

## Notes For Future Changes

[Answers that are v1-only decisions, likely to be revisited — say so here.]
````

### File 15: `harness/specs/001-[FEATURE_SLUG]/03-research.md`

````markdown
# Research: [FEATURE_NAME]

> Authored by: Agent (human approves each decision).
> Reads from: `01-spec.md`, `02-clarify.md`.
> Feeds into: `04-plan.md`; durable decisions get promoted to `harness/docs/DECISIONS.md`.
> Records feature-level technical choices and WHY they were made, so no later
> session quietly re-decides them.

## Decision 1: [Title, e.g. "Use focused views instead of a broad ViewSet"]

- **Options considered:**
  - A: [option — one-line tradeoff]
  - B: [option — one-line tradeoff]
- **Decision:** [chosen option]
- **Reason:** [the constraint or evidence that drove it]

## Decision 2: [Title]

- **Options considered:**
  - A: [option]
  - B: [option]
- **Decision:** [chosen option]
- **Reason:** [why]

## Intentionally Not Decided Yet

- [e.g. pagination strategy — deferred until list sizes are real; revisit when
  a feature needs it]

## Promotion Rule

When another feature starts depending on a decision made here, promote it to
`harness/docs/DECISIONS.md` with a date and link back to this file.
````

### File 16: `harness/specs/001-[FEATURE_SLUG]/04-plan.md`

````markdown
# Plan: [FEATURE_NAME]

> Authored by: Agent (the human reviews and approves before implementation).
> Reads from: `01-spec.md`, `02-clarify.md`, `03-research.md`, `harness/docs/ARCHITECTURE.md`.
> Feeds into: `05-data-model.md`, `06-contracts/`, `07-tasks.md`.
> The human decides architecture; the agent implements it.

## Implementation Summary

[Two or three sentences: the approach in plain language.]

## File Targets

Files this feature is expected to create or modify. Touching files outside
this list is a signal to stop and re-check scope.

- `[path/to/file]` — [what changes]
- `[path/to/file]` — [what changes]

## Technical Design

- **Data layer:** [models / migrations — detail lives in `05-data-model.md`]
- **API / interface layer:** [endpoints or UI surface — shapes live in `06-contracts/`]
- **Access control:** [who may do what; how failures respond]
- **Testing:** [what gets tested at each layer: unit → integration → end-to-end]

## Design Constraints

[Copy the spec's out-of-scope list here. It applies to this plan verbatim.
Add any ARCHITECTURE.md constraints this feature brushes against.]

## Risks

- [Risk and how the plan mitigates it]

## Validation Checklist

Confirm before generating `07-tasks.md`:

- [ ] Every acceptance criterion in `01-spec.md` has a verification command.
- [ ] Every file target is named above.
- [ ] Every entity this feature touches is defined in `05-data-model.md`.
- [ ] Every endpoint/interface this feature exposes is defined in `06-contracts/`.
- [ ] Nothing contradicts `AGENTS.md`, `harness/docs/ARCHITECTURE.md`, or the spec's out-of-scope list.
- [ ] Every 02-clarify.md question is answered — no open coin flips.
````

### File 17: `harness/specs/001-[FEATURE_SLUG]/05-data-model.md`

````markdown
# Data Model: [FEATURE_NAME]

> Authored by: Agent (human approves; contracts and code must match this file).
> Reads from: `01-spec.md`, `02-clarify.md`, `04-plan.md`.
> Feeds into: `06-contracts/`, `07-tasks.md`, the code.
> Single source of truth for entities, fields, rules, and lifecycle.
> If the code and this file disagree, one of them is a bug.

## Entity: [EntityName]

[One sentence: what this entity represents.]

### Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | [type] | yes | auto | |
| `[field]` | [type] | [yes/no] | [default] | [constraints, e.g. max length] |

### Ownership Rules

- [e.g. Every task belongs to exactly one user; set from the authenticated request, never from the payload.]

### Validation Rules

- [e.g. `title` is required, 1–200 characters after trimming.]

### Lifecycle

- **Initial state:** [e.g. `incomplete`]
- **Allowed transitions:**

```
[state] ──[action]──▶ [state]
```

- **Not supported in v1:** [e.g. reverting a completed task — listed so the
  boundary is a decision, not an accident]

## Entity: [SecondEntity — or delete this section]

[...]
````

### File 18: `harness/specs/001-[FEATURE_SLUG]/06-contracts/api.md`

````markdown
# Contract: [FEATURE_NAME] API

> Authored by: Agent (human approves; this file is the authoritative shape).
> Reads from: `01-spec.md`, `05-data-model.md`.
> Feeds into: `07-tasks.md`, the code, `08-quickstart.md`.
> Exact request/response shapes. The code conforms to this file — not the
> other way around. Error responses are part of the contract, not an afterthought.

## Common Rules

- [e.g. All endpoints require authentication; unauthenticated → `401`.]
- [e.g. All bodies are JSON; `Content-Type: application/json`.]
- [e.g. Clients can never set `id`, `owner`, or timestamps.]

## Endpoint: [Name, e.g. "Create Task"]

`[METHOD] [path, e.g. POST /api/tasks/]`

**Request:**

```json
{
  "[field]": "[example value]"
}
```

**Response `[201 Created]`:**

```json
{
  "id": 1,
  "[field]": "[example value]"
}
```

**Errors:**

| Status | When | Body |
|---|---|---|
| `400` | [validation failure] | `{"[field]": ["error message"]}` |
| `401` | not authenticated | `{"detail": "..."}` |
| `404` | [resource not visible to this user — use 404 over 403 when hiding existence] | `{"detail": "..."}` |

## Endpoint: [Next endpoint — one section per endpoint]

[...]
````

### File 19: `harness/specs/001-[FEATURE_SLUG]/07-tasks.md`

````markdown
# Tasks: [FEATURE_NAME]

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

- [ ] T01 — [e.g. Create [Entity] model + migration] (source: 05-data-model.md)
- [ ] T02 — [e.g. Write model validation tests — layer 2] (source: 05-data-model.md)
- [ ] T03 — [e.g. Implement [endpoint]] (source: 06-contracts/api.md)
- [ ] T04 — [e.g. Endpoint tests incl. error responses] (source: 06-contracts/api.md)
- [ ] T05 — [e.g. Wire verification command into ./init.sh] (source: 01-spec.md acceptance criteria)
- [ ] T06 — [e.g. Run 08-quickstart.md manual flow — layer 3] (source: 08-quickstart.md)

## Review Heuristics

Before checking any box, answer three questions:

1. Did the verification for this task actually run — and did I see it pass?
2. Did I touch only files in the plan's file targets?
3. Would a fresh session understand this commit from its message alone?
````

### File 20: `harness/specs/001-[FEATURE_SLUG]/08-quickstart.md`

````markdown
# Quickstart: [FEATURE_NAME]

> Authored by: Agent (human executes it at least once before accepting the feature).
> Reads from: `06-contracts/`, `01-spec.md` acceptance criteria.
> Feeds into: the Definition of Done (layer 3 — end-to-end verification).
> Manual verification from the user's perspective. Automated tests prove the
> parts work; this file proves the whole works. It catches the "almost right"
> code that unit tests miss at component boundaries.

## Setup

```bash
# Start the app from a clean state:
[RUN_COMMAND, e.g. docker compose up -d && npm run dev]
```

**Test data:** [e.g. create two users, alice and bob — needed for access-control flows]

## Flow 1: [Happy path, e.g. "Create and list a task"]

1. [Step, e.g. `curl -X POST .../api/tasks/ -d '{"title": "Buy milk"}' -H "Authorization: ..."`]
   - **Expected:** [e.g. `201` with the created task JSON]
2. [Step]
   - **Expected:** [result]

## Flow 2: [Boundary/failure path, e.g. "User B cannot touch user A's data"]

1. [Step as user B against user A's resource]
   - **Expected:** [e.g. `404`, and A's data unchanged]

## Flow 3: [One flow per acceptance criterion — cover every criterion in 01-spec.md]

[...]

## Maintenance Note

When `06-contracts/` changes, update these flows in the same session. A stale
quickstart silently verifies the wrong behavior.
````

### File 21: `harness/specs/001-[FEATURE_SLUG]/09-debug.md`

````markdown
# Debug: [FEATURE_NAME]

> Authored by: Agent (records incidents as they happen).
> Reads from: verification failures, review findings.
> Feeds into: tests, contracts, `02-clarify.md`, `AGENTS.md`, `harness/docs/ARCHITECTURE.md` — via the promotion rule.
> Incident history and institutional memory. A bug fixed without a recorded
> lesson will be reintroduced by a future session.

## Incident Format

```
## [Title]
- Date: YYYY-MM-DD
- Symptom: [what was observed]
- Reproduction: [exact steps or command]
- Root cause: [what was actually wrong]
- Fix: [what changed, with commit hash]
- Prevention: [what now stops it from recurring — see promotion rule]
```

## Promotion Rule

Every incident's lesson gets promoted to the place that enforces it. Recording
the bug is not the point; preventing the next one is.

| Lesson type | Promote to |
|---|---|
| Behavior regression | A test that fails if it returns |
| Wrong request/response shape | `06-contracts/` correction |
| Ambiguity the spec never answered | `02-clarify.md` question + answer |
| Rule the agent keeps breaking | `AGENTS.md` rule — or better, an `init.sh` check with ERROR/WHY/FIX |
| Boundary violation | `harness/docs/ARCHITECTURE.md` constraint + executable boundary check |
| Data invariant broken | `05-data-model.md` validation rule + test |

## Incidents

## [Example — replace me: Unauthenticated request created a task]
- Date: [YYYY-MM-DD]
- Symptom: POST without a token returned 201.
- Reproduction: `curl -X POST .../api/tasks/ -d '{"title":"x"}'` (no auth header)
- Root cause: permission class missing on the create view.
- Fix: added [permission] to the view — commit [hash].
- Prevention: contract test asserting 401 for all endpoints without auth; added to Flow 2 of 08-quickstart.md.
````

---

## Step 5 — Run The Initialization Phase

This is its own phase with its own goal: infrastructure, not features. Do it
now, in this session, unless the human says otherwise:

1. Make the install / lint / test / build commands actually work (create the
   minimal project skeleton and one passing placeholder test if the project is
   empty).
2. Wire any Q4 hard constraints into `init.sh` as executable boundary checks
   with ERROR/WHY/FIX messages (see the example in `harness/docs/ARCHITECTURE.md`).
3. Run `./init.sh` until it exits 0.
4. Commit everything: `git init` if needed, then a descriptive first commit
   (e.g. "chore: harness scaffold + passing baseline").
5. Set feat-001 to `done` in `harness/feature-list.json` with evidence (commit hash +
   "./init.sh passing"), update `harness/PROGRESS.md` and `harness/DEV_LOG.md`.

Do NOT start the first real feature in this session. Initialization optimizes
for setup reliability; mixing in feature work sacrifices it. The acceptance
bar: a brand-new agent session could answer "how do I run this" and "how do I
verify this" from the repo alone, and `./init.sh` passes from a clean checkout.

Environment facts are recorded as they are PROVEN: what lands in `AGENTS.md`
(stack, commands) and `init.sh` is what actually ran in this phase — detected
in Step 0, confirmed in the interview, proven here. If reality diverges from
an interview answer, reality wins and the files get corrected now.

## Step 6 — Verify The Scaffold

Confirm every box honestly; report any failure to the human:

**Instructions**
- [ ] `AGENTS.md` exists, 50–200 lines, critical rules at top and bottom,
      routes to the topic docs and state files.
- [ ] `CLAUDE.md` exists as a one-line pointer to `AGENTS.md`.

**State**
- [ ] `harness/feature-list.json` is valid JSON, validates against the schema, every
      feature has id/name/behavior/verification/status, at most one `in-progress`.
- [ ] `harness/PROGRESS.md` has Current State / Next Steps filled; `harness/SESSION-HANDOFF.md`
      and `harness/DEV_LOG.md` exist.

**Verification**
- [ ] `init.sh` is executable, starts with `set -e`, and passes.
- [ ] At least one test exists and passes; static checks wired in.

**Scope**
- [ ] The one-feature-at-a-time rule and Definition of Done are in `AGENTS.md`.
- [ ] The first feature's spec has an explicit out-of-scope list (or a named
      gap for the human).

**Lifecycle**
- [ ] Session Exit Checklist present in `AGENTS.md`; everything committed.

(The full 25-check audit lives in the harness repo at
`core/docs/validation-checklist.md` — recommend it to the human for periodic use.)

## Step 7 — Hand Off To The Human

Tell the human, in your own words:

1. **What was created** — the file map and what each file owns (root state
   files, topic docs, first feature folder).
2. **What they must fill in** — every remaining gap, file by file: the spec's
   goal/scope/out-of-scope, open clarify questions, ARCHITECTURE.md details
   beyond the Q4 constraints, and that plans need their approval before
   implementation.
3. **How to work from here** — each session: clock in per `AGENTS.md`, work
   ONE feature through the chain (spec → clarify → research → plan →
   data-model + contracts → tasks → code → quickstart), verify layer by layer,
   clock out with the exit checklist, write a handoff if the feature continues.
4. **The review discipline** — substantial features get a fresh-session review
   scored against `harness/docs/RUBRIC.md` before acceptance; never skip it for
   security-sensitive changes.
5. **The maintenance loop** — weekly or every few features: update
   `harness/docs/QUALITY.md`, retire rules and checks that never fire, promote
   recurring `09-debug.md` incidents into tests or boundary checks.
6. **If external libraries were flagged in Q6** — create
   `harness/docs/references/[lib].md` per the conventions in
   `harness/docs/references/README.md`, version-pinned and dated.
7. **Ongoing audits** — copy `validate.sh` from the harness repo's
   `templates/long/harness/` into the project’s `harness/` folder (`chmod +x`) and run `./harness/validate.sh`
   periodically: it is the executable version of the 25-check harness audit
   and exits non-zero below 70%.

## Reference — Enforcement Levels

| Level | Compliance | Use for |
|---|---|---|
| Instruction in `AGENTS.md` | ~70–80% | Judgment calls, working style |
| Executable check in `init.sh` | ~99% | Boundaries, invariants (ERROR/WHY/FIX) |
| Test | ~99% | Behavior that must never regress |

When a rule keeps being broken, promote it one level up.

## Reference — The Three Most Common Failures This Harness Prevents

| Failure | Prevention here |
|---|---|
| Scope creep ("while I'm here…") | Out-of-scope list, plan file targets, WIP=1 |
| Premature "done" | Three-layer verification + evidence field |
| Lost continuity between sessions | PROGRESS.md + SESSION-HANDOFF.md + clock-in/clock-out |
