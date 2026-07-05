# Spec: Asistent AI pe site (chat)

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.
> STATUS: DRAFT — așteaptă răspunsurile din `02-clarify.md` (Q1–Q12).

## Goal

Clientul primește un canal conversațional direct pe site: întreabă în limbaj
natural despre meniu („ce pizza picantă aveți?", „aveți ceva fără carne?")
și poate plasa o comandă întreagă prin conversație, fără să răsfoiască
meniul. Asistentul este primul consumator non-browser al nucleului de
servicii (DECISIONS.md 2026-07-04 — channel-agnostic core) și fundația
pentru canalele externe WhatsApp/Telegram (feat-009): tot ce învață și
folosește aici (tool-uri peste servicii) se refolosește acolo.

## User Story

Ca **client al restaurantului**, vreau să **întreb în limbaj natural ce mi
se potrivește și să comand direct din conversație**, ca să **primesc rapid
un răspuns corect (prețuri, ingrediente, alergeni reale) și să plasez
comanda fără să navighez prin tot meniul**.

## Scope

### In scope

- **Chat UI în shop:** buton de chat vizibil în magazin care deschide un
  panou de conversație; mobile-first (375px), funcțional și pe desktop.
  Plasarea exactă și persistența istoricului: Q8.
- **Întrebări despre meniu:** asistentul răspunde EXCLUSIV pe baza datelor
  reale din serviciul de meniu — produse, prețuri (bani întregi, formatate
  la afișare), mărimi, topping-uri, ingrediente, alergeni, disponibilitate.
  Nu inventează produse, prețuri sau ingrediente; ce nu știe din date, spune
  că nu știe și recomandă telefonul restaurantului.
- **Comandă prin conversație:** asistentul construiește coșul cerut
  (produs, mărime, topping-uri, cantități), obține cotația de pe server
  (subtotal + SGR + taxă de livrare pe zonă — aceleași reguli ca în
  checkout), colectează datele de livrare/ridicare ca la guest checkout și
  plasează comanda prin serviciul de comenzi. Plata: la primire (cash/card),
  ca în web. Modul de finalizare (în chat vs. predare către checkout): Q4.
- **Confirmare explicită înainte de plasare:** clientul vede sumarul complet
  (produse, cantități, total, adresă/mod, timp estimat) și confirmă explicit;
  fără confirmare nu se plasează nimic (Q5).
- **Aceleași reguli de business ca web-ul:** orar (în afara programului nu
  se plasează — comportamentul exact: Q6), zone de livrare, prag livrare
  gratuită, SGR, ambalaj obligatoriu, validări de server. Asistentul nu are
  nicio putere pe care web-ul nu o are.
- **Arhitectură:** asistentul folosește EXCLUSIV serviciile existente
  (meniu, coș/cotație, comenzi, orar) prin tool-calling; zero acces direct
  la baza de date, zero logică de business duplicată.
- **Guardrails:** rămâne la subiect (meniu, comenzi, informații despre
  restaurant); refuză politicos orice altceva. La întrebări de alergii
  răspunde doar din datele de alergeni introduse în panou, cu recomandarea
  de a suna restaurantul pentru cazuri serioase (formulare: Q7).
- **Control de cost și abuz:** limitare de utilizare per client/sesiune
  (mecanismul exact la plan); mesajele au lungime maximă.

### Out of scope

- Canale externe WhatsApp/Telegram (feat-009 — construite pe acest nucleu).
- Conturi de clienți și precompletare din cont (feat-010); cupoane
  (feat-011); plată online (feat-012).
- Preluare a conversației de către un om (live-chat cu personalul);
  fallback-ul este numărul de telefon al restaurantului.
- Voce (speech-to-text / text-to-speech).
- Modificarea sau anularea prin chat a unei comenzi deja plasate —
  corectările rămân telefonice (ca în feat-007).
- Urmărirea stării comenzii prin chat („unde e comanda mea?") — v1 spune
  politicos că statusul se află telefonic. (De înregistrat ca feature viitor
  dacă proprietarul îl vrea.)
- UI de administrare a asistentului (prompturi, rapoarte de conversații) —
  nimic în panoul de admin în v1.
- Recomandări comerciale nesolicitate (upsell agresiv); asistentul propune
  doar ce se cere sau echivalente apropiate.

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Chat-ul e accesibil din shop pe mobil și desktop; se deschide/închide
   fără să afecteze navigarea sau coșul existent al clientului.
2. Orice afirmație despre produse, prețuri, mărimi, ingrediente, alergeni
   sau disponibilitate provine din serviciile existente la momentul
   întrebării; produsele dezactivate nu sunt oferite; prețurile citate
   corespund exact cotației serverului.
3. O comandă prin chat trece prin ACEEAȘI validare de server ca una din
   web (orar, zonă, produse active, ambalaj, SGR, telefon normalizat);
   comanda plasată apare în panoul admin identic cu una din web, cu
   totalurile calculate pe server.
4. Înainte de plasare, asistentul prezintă sumarul complet și cere
   confirmare explicită; „nu" sau lipsa confirmării nu plasează comanda;
   după plasare, clientul primește numărul comenzii și estimarea.
5. Asistentul refuză subiectele din afara magazinului și nu poate fi
   convins să inventeze reduceri, produse sau să ocolească regulile
   (prompturile clientului nu au autoritate peste reguli).
6. Erorile de servicii (produs indisponibil între timp, zonă invalidă,
   restaurant închis) sunt traduse în mesaje conversaționale corecte, nu
   expun detalii tehnice.
7. Utilizarea e limitată per client/sesiune împotriva abuzului de cost;
   peste limită, asistentul o spune politicos.
8. Cheia API a furnizorului LLM stă exclusiv în `.env` (niciodată în repo
   — AGENTS.md Safety Rules); apelurile către LLM se fac doar de pe server.

## Non-Functional Requirements

- Conversația în limba română (alte limbi: Q3); ton prietenos, concis.
- Chat-ul e utilizabil pe 375px lățime; nu blochează UI-ul magazinului.
- Răspunsurile încep să apară în câteva secunde (streaming dacă e nevoie —
  decizie tehnică la plan).
- Costul per conversație e cunoscut și limitat (buget: Q2); degradare
  politicoasă când limita e atinsă, magazinul web rămâne neafectat.
- Conversațiile stocate (dacă se stochează — Q9) nu conțin mai multe date
  personale decât comanda însăși; retenția respectă politica de
  confidențialitate.

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and the
flows in `08-quickstart.md`. (Comanda de verificare exactă se fixează la plan;
draft: `npm test -- tests/assistant`.)

- [ ] La o întrebare despre meniu (ex. „ce pizza picantă aveți?"),
      răspunsul conține doar produse reale, active, cu prețurile corecte
      din serviciul de meniu.
  - Verify: `npm test -- tests/assistant` (conversații scriptate cu
    tool-calls asertate)
- [ ] O întrebare despre alergeni primește răspuns doar din datele de
      alergeni; pentru un produs fără date, asistentul spune că nu are
      informația și recomandă telefonul.
  - Verify: `npm test -- tests/assistant`
- [ ] Un flux complet de comandă prin chat (produse + mărime + topping-uri,
      livrare cu adresă în zonă, confirmare) plasează o comandă reală care
      apare în panoul admin cu totalurile serverului.
  - Verify: `npm test -- tests/assistant` + flow manual în `08-quickstart.md`
- [ ] Fără confirmare explicită, comanda NU se plasează; refuzul anulează
      politicos.
  - Verify: `npm test -- tests/assistant`
- [ ] În afara orarului / zonă neacoperită / produs dezactivat mid-flow:
      asistentul comunică limita corect și nu plasează comanda.
  - Verify: `npm test -- tests/assistant`
- [ ] O întrebare off-topic e refuzată politicos; o încercare de a obține
      reduceri/preturi inventate eșuează.
  - Verify: `npm test -- tests/assistant`
- [ ] Peste limita de utilizare, asistentul refuză politicos; magazinul
      web funcționează normal.
  - Verify: `npm test -- tests/assistant`
- [ ] Flux manual pe 375px: deschid chat-ul, întreb de meniu, comand
      cap-coadă, văd comanda în panou.
  - Verify: flow manual în `08-quickstart.md`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, and nothing outside the in-scope list has been changed.
