# Spec: Panou admin — produse și comenzi

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.
> STATUS: DRAFT 2026-07-04 — în așteptarea răspunsurilor proprietarului la
> `02-clarify.md` (Q1–Q13). Secțiunile marcate „(de confirmat QN)" se
> actualizează după interviu.

## Goal

Personalul restaurantului primește instrumentul care face magazinul utilizabil
zi de zi: se autentifică într-un panou de administrare, vede comenzile noi
imediat ce sosesc, le preia și le duce prin stările de livrare până la
finalizare, reglează timpul de livrare afișat clienților și ține meniul la zi
(prețuri, disponibilitate). feat-007 este poarta de intrare în producție —
decizia din feat-006 (02-clarify.md Q6): magazinul NU intră live până când
restaurantul nu are unde să vadă comenzile.

## User Story

Ca **angajat al restaurantului (dispecer)**, vreau să **văd comenzile noi în
timp real și să le schimb starea pe măsură ce le pregătim și le livrăm, și să
pot corecta rapid prețuri și disponibilitate în meniu**, ca să **pot opera
magazinul online fără să depind de programator și fără să pierd nicio
comandă**.

## Scope

### In scope

- **Autentificare personal:** panoul e accesibil doar cu login; un utilizator
  neautentificat este redirecționat la pagina de login. Modelul de conturi
  (comun vs. per angajat, roluri) — de confirmat Q1/Q2.
- **Lista comenzilor în timp real:** comenzile noi apar în panou fără refresh
  manual, cu semnal clar (vizual + sonor — de confirmat Q4); lista arată
  esențialul dintr-o privire: număr, oră, mod (livrare/ridicare), localitate,
  total, telefon, status.
- **Detaliul comenzii:** toate liniile cu opțiuni și cantități, SGR, taxă de
  livrare, total, date client (nume, telefon, adresă, observații), programare
  (ASAP/oră), metoda de plată.
- **Schimbarea stării:** fluxul folosește enum-ul deja definit în DB
  (`new → accepted → in_delivery → completed / canceled`); tranzițiile permise
  pe mod (livrare vs. ridicare) și regulile de anulare — de confirmat Q5.
  Tranzițiile invalide sunt respinse pe server.
- **Reglarea timpului de livrare:** dispecerul ajustează estimarea afișată
  clienților (nota din 002 02-clarify.md Q10: aglomerat 70–80 min, liber
  30–40 min); global vs. per comandă — de confirmat Q6.
- **Administrare meniu:** activare/dezactivare și modificare de preț pentru
  produse, variante (mărimi) și topping-uri; dezactivarea e deja respectată de
  meniu și de validarea coșului (soft hide din feat-002/006). Întinderea
  exactă (adăugare produse noi, editare nume/descrieri) — de confirmat Q7/Q8.
- **Administrare zone de livrare:** editarea taxei și a pragului de livrare
  gratuită per localitate — de confirmat Q9 (și adăugare/dezactivare zone?).
- **Arhitectură:** toate operațiile (listă comenzi, tranziții, editări) trec
  prin stratul de servicii + API, ca orice alt canal (DECISIONS.md
  2026-07-04 — channel-agnostic core); panoul e doar un consumator.

### Out of scope

- Notificări către client la schimbarea stării (email/SMS/WhatsApp) — anularea
  se comunică telefonic de către personal.
- Rapoarte, statistici, contabilitate, export — v1 arată comenzile, nu le
  analizează (limita exactă a istoricului — Q11).
- Administrarea cupoanelor (feat-011 — depinde de acest feature, dar nu face
  parte din el).
- Conturi de clienți (feat-010), plata online (feat-012), canale conversaționale
  (feat-008/009).
- Editarea conținutului unei comenzi deja plasate (linii, prețuri, adresă) —
  corectările se fac telefonic + anulare/re-plasare.
- Tracking curier, hărți, rute.
- Gestiune stocuri, rețete, materie primă.
- Texte legale finale (rămân pe lista separată din PROGRESS.md).

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Nicio pagină și niciun endpoint de admin nu răspunde fără autentificare;
   sesiunea expiră și cere re-login (parametrii — Q2).
2. O comandă plasată apare în panoul deschis în cel mult câteva secunde, fără
   acțiune manuală, cu semnal distinctiv pentru status „nouă" (forma exactă —
   Q4).
3. Starea unei comenzi se schimbă doar pe tranzițiile permise, validate pe
   server; panoul arată doar acțiunile valide pentru starea curentă.
   Schimbările de stare NU modifică snapshot-urile comenzii (prețuri, denumiri).
4. Dezactivarea unui produs / variantă / topping îl ascunde imediat din meniul
   public și blochează plasarea lui în comenzi noi; reactivarea îl readuce.
   Comenzile existente rămân neatinse (snapshot).
5. Modificarea unui preț se aplică doar cotațiilor și comenzilor viitoare;
   sumele circulă exclusiv ca bani întregi, calculate pe server.
6. Modificarea taxei/pragului unei zone se aplică de la următoarea cotație de
   coș.
7. Estimarea de livrare reglată de dispecer devine valoarea afișată clienților
   în checkout și folosită la validarea programării (înlocuiește constanta din
   `src/lib/restaurant-config.ts` — detalii la plan, după Q6/Q10).
8. Toate operațiile de administrare sunt expuse ca servicii apelabile
   independent de UI-ul de admin, în aceeași arhitectură ca ordering-ul.

## Non-Functional Requirements

- Utilizabil pe dispozitivul real al personalului (de confirmat Q3) — lista de
  comenzi trebuie să fie lizibilă și operabilă cel puțin pe 375px lățime,
  ca restul aplicației.
- Panoul e în limba română; codul și documentația tehnică în engleză.
- Parolele nu se stochează niciodată în clar; secretele stau în `.env`
  (niciodată în repo — AGENTS.md Safety Rules).

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and the
flows in `08-quickstart.md`. (Draft — se finalizează după clarify.)

- [ ] Un utilizator neautentificat nu poate accesa nicio pagină sau API de
      admin; după login accesul funcționează.
  - Verify: `npm test -- tests/admin`
- [ ] O comandă nouă plasată prin API apare în lista panoului fără refresh
      manual, cu semnalul de „comandă nouă".
  - Verify: `npm test -- tests/admin` + flow manual în `08-quickstart.md`
- [ ] Tranzițiile de stare permise funcționează cap-coadă (nouă → preluată →
      în livrare → finalizată; anulare conform Q5); o tranziție nepermisă e
      respinsă de server.
  - Verify: `npm test -- tests/admin`
- [ ] Dezactivarea unui produs îl scoate din meniul public și din validarea
      comenzii; reactivarea îl readuce.
  - Verify: `npm test -- tests/admin`
- [ ] O modificare de preț (variantă și topping) se reflectă în următoarea
      cotație de coș; o comandă plasată înainte rămâne cu prețurile vechi.
  - Verify: `npm test -- tests/admin`
- [ ] Modificarea taxei/pragului unei zone schimbă calculul taxei la
      următoarea cotație.
  - Verify: `npm test -- tests/admin`
- [ ] Estimarea reglată de dispecer apare în checkout-ul clientului.
  - Verify: `npm test -- tests/admin` + flow manual
- [ ] Fluxul complet pe dispozitivul-țintă: login → văd comanda nouă → o duc
      până la finalizată → editez un preț și o disponibilitate → verific în
      shop.
  - Verify: flow manual în `08-quickstart.md`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, and nothing outside the in-scope list has been changed.
