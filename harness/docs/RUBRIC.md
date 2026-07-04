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
