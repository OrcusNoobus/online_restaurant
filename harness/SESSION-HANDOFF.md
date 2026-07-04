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
| Static (layer 1) | `npm run lint && npm run typecheck` | [pass/fail] | |
| Tests (layer 2) | `npm test` | [e.g. 42/43 passing] | [failing test name if any] |
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
