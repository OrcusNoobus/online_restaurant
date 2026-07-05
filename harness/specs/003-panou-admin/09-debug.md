# Debug notes: Panou admin

> Authored by: Agent. Lecții reținute în timpul implementării — citește-le
> înainte de a lucra pe UI-ul admin.

## React 19 / eslint `react-hooks/set-state-in-effect`

Regula respinge setState sincron în corpul unui effect, inclusiv apelul
direct al unui `useCallback` care face setState. Modelul care trece și e
mai corect arhitectural:

- selecția (deschide/închide panoul de detaliu) se face în HANDLERE, nu în
  effects care reacționează la `selectedId`;
- reconcilierea cross-device (panoul deschis vs. lista poll-uită) trăiește
  în `refreshList` însuși, citind detaliul curent dintr-un `ref`
  (`detailRef`), nu într-un effect pe `[dayView, detail]`;
- pentru fetch-ul inițial, corpul async se împachetează
  `void (async () => { … })().catch(…)`.

## `key` pe formulare cu state local

`<SettingsForm key={settings.updatedAt}>` remonta formularul la FIECARE
salvare (updatedAt se schimbă mereu) și pierdea instantaneu notificarea
„Salvat.” — descoperit live în browser. Formularele care își țin singure
starea se montează O dată și se seedează din props la mount; nu le da key
care se schimbă la salvare.

## TypeScript: narrowing pe `AudioContext.state`

După `if (ctx.state === "suspended")`, TS îngustează proprietatea și un
`ctx.state !== "running"` ulterior în același flux devine TS2367 (tipuri
fără suprapunere) — deși `resume()` poate schimba starea. Structurează cu
early-return pe cazul „running” și re-citește starea doar în callback-uri
(acolo narrowing-ul se resetează).

## Unelte de preview vs. inputuri controlate React

`preview_fill`/`preview_click` nu declanșează mereu `onChange`-ul React pe
inputuri controlate (login-ul nu se submitea). Pentru verificare manuală
scriptată: setter-ul nativ + `dispatchEvent(new Event("input", {bubbles:
true}))`, sau `element.click()` din `preview_eval`. Cookie-ul de sesiune
poate fi setat direct cu `document.cookie` (serverul citește doar headerul).

## Curățenia după verificarea manuală

Editările din panou STAMPEAZĂ flag-urile seed-guard pe dev DB. După o
sesiune de verificare manuală: șterge entitățile de test create prin form
(seed-ul nu șterge nimic), apoi `SEED_FORCE=1 npm run db:seed` ca să
restaurezi prețurile/zonele și să resetezi flag-urile.
