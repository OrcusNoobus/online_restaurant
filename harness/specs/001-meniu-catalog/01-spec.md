# Spec: Meniu produse (catalog)

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.

## Goal

Clientul care deschide site-ul vede întregul meniu al restaurantului — categorii,
produse, descrieri și prețuri — rapid și clar, pe telefon. Meniul vine din baza
noastră de date, populată automat (seed) cu datele reale de pe site-ul Metro dish
actual, ca să nu introducem manual ~100 de produse. Aceasta este fundația:
coșul, comenzile și panoul de admin se construiesc peste acest model de date.

## User Story

Ca **client al restaurantului**, vreau să **văd meniul complet cu prețuri și
mărimi pe telefonul meu**, ca să **pot alege ce comand fără să sun sau să caut
un PDF**.

## Scope

### In scope

- Pagina principală de meniu, mobile-first: categorii navigabile, produse cu
  nume, descriere, preț formatat românește ("29,90 lei").
- Un produs cu mai multe mărimi (pizza 30cm / 40cm / XXL) apare O SINGURĂ dată,
  cu prețul fiecărei mărimi — nu ca trei produse separate cum e pe site-ul vechi.
- Modelul de date complet pentru meniu: categorii, produse, variante (mărimi),
  topping-uri (modelate și importate, chiar dacă alegerea lor vine cu coșul).
- Script de import (seed) cu meniul real extras de pe
  royal-food-delivery.order.app.hd.digital.
- API `GET /api/menu` care returnează meniul complet.
- Produsele/categoriile inactive nu apar public.

### Out of scope

- Coșul de cumpărături și plasarea comenzii (feature separată, următoarea).
- Alegerea topping-urilor în interfață (vine odată cu coșul).
- Panoul de administrare (adăugare/editare produse).
- Fotografii finale de produs (folosim placeholder până există poze proprii).
- Căutare în meniu, filtre, alergeni, multi-limbă.
- Program de funcționare / starea deschis-închis.

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Meniul afișat public conține toate categoriile active, în ordinea stabilită,
   fiecare cu produsele ei active.
2. Fiecare produs afișează: nume, descriere (dacă există), prețul fiecărei
   variante de mărime, formatat "NN,NN lei".
3. Produsele fără variante multiple afișează un singur preț.
4. `npm run db:seed` populează baza de date cu meniul real (idempotent — rulat
   de două ori nu dublează produsele).
5. `GET /api/menu` returnează structura completă conform contractului din
   `06-contracts/api.md`.

## Non-Functional Requirements

- Mobile-first: lizibil și utilizabil pe un ecran de 375px lățime.
- Pagina de meniu se încarcă rapid (server-rendered, fără spinner de încărcare
  pentru conținutul principal).
- Toate prețurile circulă ca bani întregi (integer bani) — vezi ARCHITECTURE.md.

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and the
flows in `08-quickstart.md`.

- [ ] Cu baza de date populată, pagina principală afișează categoriile și
      produsele cu prețuri corecte.
  - Verify: `npm test -- tests/menu` (teste de integrare pe repository + API)
- [ ] Pizza cu 3 mărimi apare o dată, cu 3 prețuri.
  - Verify: `npm test -- tests/menu` + flow manual în `08-quickstart.md`
- [ ] `GET /api/menu` respectă contractul (structură + prețuri în bani).
  - Verify: `npm test -- tests/menu`
- [ ] Un produs marcat inactiv nu apare nici pe pagină, nici în API.
  - Verify: `npm test -- tests/menu`
- [ ] `npm run db:seed` rulat de două ori consecutiv nu creează duplicate.
  - Verify: `npm run db:seed && npm run db:seed && npm test -- tests/menu`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, and nothing outside the in-scope list has been changed.
