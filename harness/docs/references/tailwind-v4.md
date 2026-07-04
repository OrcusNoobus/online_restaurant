# Tailwind CSS 4

Version pinned: ^4 (via `@tailwindcss/postcss`) · Last reviewed: 2026-07-04

Created pre-emptively: models frequently generate Tailwind **v3** setup, which
breaks on v4.

## Gotchas

- There is **no `tailwind.config.js`** in this project and none should be
  created. v4 is CSS-first: configuration lives in `src/app/globals.css`.
- The entry point is `@import "tailwindcss";` in `globals.css` — NOT the v3
  trio of `@tailwind base/components/utilities`.
- Theme tokens are defined in CSS via `@theme { --color-...: ...; }`, not in a
  JS config. Custom brand colors for the shop go there.
- PostCSS plugin is `@tailwindcss/postcss` (see `postcss.config.mjs`); do not
  add `autoprefixer` (built in).

## Project conventions

- Mobile-first by default (Tailwind's default breakpoint direction) — design
  for the phone screen first; most customers order from phones.

(Extend this file with real incidents as they happen.)
