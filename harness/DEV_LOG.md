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

## [2026-07-04] — Project initialized (feat-001 done)
- Status: Completed
- Action: Interviewed the owner (stack, DB, hosting, payments decided — see harness/docs/DECISIONS.md), generated the full harness scaffold from STARTER-long.md, scaffolded Next.js 16 + TypeScript + Tailwind 4, Postgres 17 via docker-compose, ran ./init.sh to green, committed baseline (472f666).
- Challenge: Docker daemon was not running, so the db health check failed on the first ./init.sh run.
- Solution: Started Docker Desktop (`open -a Docker`), daemon ready in ~2s, re-ran ./init.sh — all green. Note added to PROGRESS.md: Docker Desktop must be running before ./init.sh.
