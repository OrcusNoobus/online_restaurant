# Next.js 16 (App Router)

Version pinned: 16.2.10 · Last reviewed: 2026-07-04

Created pre-emptively: Next 16 differs from what models assume from training
data, and the framework ships its own agent warning saying exactly that.

## The one rule

**The authoritative docs are inside this repo**: `node_modules/next/dist/docs/`.
Read the relevant guide there before writing Next-specific code (routing,
caching, server actions, metadata). Heed deprecation notices.

## Gotchas already known

- Request APIs are async: `params`, `searchParams`, `cookies()`, `headers()`
  must be awaited in server components and route handlers.
- `npm run lint` runs plain `eslint` with the flat config in
  `eslint.config.mjs` — there is no `next lint` anymore.
- Dev server runs Turbopack (`next dev` is Turbopack-first in 16).

## Project conventions

- Pages are server components by default; add `"use client"` only where
  interactivity demands it (cart button, quantity steppers).
- Data flows: page (server component) → repository/service → plain props down
  to `src/components`. Components never fetch.

(Extend this file with real incidents as they happen.)
