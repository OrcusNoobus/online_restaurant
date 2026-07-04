# Debug: Meniu produse (catalog)

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

(none yet — the feature has not started)
