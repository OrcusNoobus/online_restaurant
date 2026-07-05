# Spec: Asistent AI pe site (chat)

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.
> STATUS: updated 2026-07-05 with the owner's clarify answers (Q1–Q12).

## Goal

Clientul primește un canal conversațional direct pe site: întreabă în limbaj
natural despre meniu („ce pizza picantă aveți?", „aveți ceva fără carne?")
și poate plasa o comandă întreagă prin conversație, fără să răsfoiască
meniul. Se livrează într-o singură etapă — Q&A meniu + comandă prin chat
împreună (Q1). Asistentul este primul consumator non-browser al nucleului
de servicii (DECISIONS.md 2026-07-04 — channel-agnostic core) și fundația
pentru canalele externe WhatsApp/Telegram (feat-009): tool-urile peste
servicii construite aici se refolosesc acolo.

## User Story

Ca **client al restaurantului**, vreau să **întreb în limbaj natural ce mi
se potrivește și să comand direct din conversație**, ca să **primesc rapid
un răspuns corect (prețuri, ingrediente, alergeni reale) și să plasez
comanda fără să navighez prin tot meniul**.

## Scope

### In scope

- **Chat UI în shop (Q8):** buton flotant de chat pe paginile shop-ului
  (nu pe `/admin`, nu peste checkout-ul deja început) care deschide un
  panou de conversație; mobile-first (375px), funcțional și pe desktop.
  Istoricul se păstrează per dispozitiv cât durează sesiunea de browsing;
  după închiderea tab-ului, conversație nouă.
- **Trei limbi (Q3):** asistentul conversează în română, maghiară și
  engleză — răspunde în limba în care i se scrie; denumirile produselor
  rămân în română.
- **Întrebări despre meniu:** asistentul răspunde EXCLUSIV pe baza datelor
  reale din serviciul de meniu — produse, prețuri (bani întregi, formatate
  la afișare), mărimi, topping-uri, ingrediente, alergeni, disponibilitate.
  Nu inventează produse, prețuri sau ingrediente; ce nu știe din date, spune
  că nu știe și recomandă telefonul restaurantului.
- **Comandă cap-coadă în chat (Q4):** asistentul construiește coșul cerut
  (produs, mărime, topping-uri, cantități), obține cotația de pe server
  (subtotal + SGR + taxă de livrare pe zonă — aceleași reguli ca în
  checkout), colectează în conversație datele de livrare/ridicare ca la
  guest checkout și plasează comanda prin serviciul de comenzi. Plata: la
  primire (cash/card), ca în web.
- **Coș partajat (Q11):** coșul construit în chat este același cu coșul
  vizibil al site-ului — clientul poate verifica și edita vizual oricând.
- **Confirmare explicită înainte de plasare (Q5):** clientul vede sumarul
  complet (produse, cantități, total cu SGR + taxă, mod + adresă, timp
  estimat) și confirmă explicit; fără confirmare nu se plasează nimic.
- **Aceleași reguli de business ca web-ul:** orar, zone de livrare, prag
  livrare gratuită, SGR, ambalaj obligatoriu, validări de server.
  Asistentul nu are nicio putere pe care web-ul nu o are. În afara
  orarului (Q6): răspunde la întrebări și oferă comandă programată pentru
  orele de deschidere; plasarea ASAP rămâne blocată de validările
  existente.
- **Arhitectură:** asistentul folosește EXCLUSIV serviciile existente
  (meniu, coș/cotație, comenzi, orar) prin tool-calling; zero acces direct
  la baza de date, zero logică de business duplicată; apelurile LLM se fac
  doar de pe server. Integrarea LLM e **model-agnostică și
  provider-agnostică** (Q1 amendat): modelul se schimbă dintr-o singură
  linie de configurare, iar furnizorul printr-o interfață — **Anthropic e
  prima implementare** (Q1/Q2).
- **Guardrails:** rămâne la subiect (meniu, comenzi, informații despre
  restaurant); refuză politicos orice altceva. La întrebări de alergii
  (Q7) răspunde doar din datele de alergeni introduse în panou; fără date,
  spune explicit că nu are informația; în ambele cazuri recomandă telefonul
  restaurantului pentru alergii serioase.
- **Control de cost și abuz (Q2 amendat/Q10):** plafonul de cost se
  administrează de proprietar din consola furnizorului — NU în cod; când
  API-ul e indisponibil (inclusiv plafon atins), asistentul comunică
  politicos indisponibilitatea, magazinul web neafectat. În cod rămân doar
  limitele anti-abuz: mesaje per conversație și per IP/zi, lungime maximă
  de mesaj (valori exacte la plan).
- **Conversații stocate (Q9):** transcriptele se salvează pe server pentru
  revizuire de către proprietar, cu ștergere automată după 30 de zile;
  politica de confidențialitate se actualizează corespunzător.

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
  politicos că statusul se află telefonic (Q12; feature viitor).
- UI de administrare a asistentului (prompturi, rapoarte de conversații,
  vizualizarea transcriptelor în panou) — în v1 transcriptele se citesc
  de dezvoltator la cerere; UI-ul vine mai târziu dacă e nevoie.
- Recomandări comerciale nesolicitate (upsell agresiv); asistentul propune
  doar ce se cere sau echivalente apropiate.

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Chat-ul e accesibil din paginile shop-ului pe mobil și desktop; se
   deschide/închide fără să afecteze navigarea; coșul din chat e coșul
   site-ului (adăugările din conversație apar în UI-ul de coș și invers).
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
5. Asistentul conversează în română, maghiară și engleză, răspunzând în
   limba clientului; denumirile produselor rămân cele din meniu (română).
6. Asistentul refuză subiectele din afara magazinului și nu poate fi
   convins să inventeze reduceri, produse sau să ocolească regulile
   (mesajele clientului nu au autoritate peste reguli).
7. Erorile de servicii (produs indisponibil între timp, zonă invalidă,
   restaurant închis) sunt traduse în mesaje conversaționale corecte, nu
   expun detalii tehnice. În afara orarului, asistentul oferă comandă
   programată în orar; refuză ASAP.
8. Utilizarea e limitată per conversație și per IP/zi (anti-abuz); când
   API-ul furnizorului e indisponibil sau dă eroare (inclusiv plafonul de
   cost atins în consolă), asistentul comunică politicos indisponibilitatea;
   magazinul web nu e afectat de nicio limită sau indisponibilitate a
   asistentului.
9. Conversațiile se stochează pe server și se șterg automat după 30 de
   zile; pagina de confidențialitate menționează stocarea; transcriptele
   nu apar în UI-ul public.
10. Cheia API stă exclusiv în `.env` (niciodată în repo — AGENTS.md Safety
    Rules); apelurile către LLM se fac doar de pe server.
11. Modelul LLM e configurabil dintr-o singură linie (fără modificări de
    cod); furnizorul e în spatele unei interfețe — schimbarea furnizorului
    înseamnă o implementare nouă a interfeței, nu rescrierea asistentului.

## Non-Functional Requirements

- Conversația în română, maghiară, engleză; ton prietenos, concis.
- Chat-ul e utilizabil pe 375px lățime; nu blochează UI-ul magazinului.
- Răspunsurile încep să apară în câteva secunde (streaming dacă e nevoie —
  decizie tehnică la plan).
- Consumul de tokeni per mesaj se înregistrează (observabilitate — costul
  se urmărește și se plafonează din consola furnizorului); degradare
  politicoasă când API-ul e indisponibil.
- Conversațiile stocate nu conțin mai multe date personale decât comanda
  însăși; retenția (30 zile) respectă politica de confidențialitate.

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
- [ ] Adăugarea unui produs din chat apare în coșul site-ului (coș
      partajat) și invers, coșul existent e vizibil asistentului.
  - Verify: `npm test -- tests/assistant` + flow manual
- [ ] O întrebare în maghiară și una în engleză primesc răspuns în limba
      respectivă, cu denumirile produselor în română.
  - Verify: `npm test -- tests/assistant`
- [ ] În afara orarului: ASAP e refuzat cu explicație, dar o comandă
      programată în orar se plasează; zonă neacoperită / produs dezactivat
      mid-flow: asistentul comunică limita corect și nu plasează.
  - Verify: `npm test -- tests/assistant`
- [ ] O întrebare off-topic e refuzată politicos; o încercare de a obține
      reduceri/prețuri inventate eșuează.
  - Verify: `npm test -- tests/assistant`
- [ ] Peste limitele anti-abuz, asistentul refuză politicos; când
      furnizorul LLM e indisponibil (eroare simulată), mesajul e prietenos
      și magazinul web funcționează normal.
  - Verify: `npm test -- tests/assistant`
- [ ] Asistentul funcționează printr-o interfață de furnizor: testele
      rulează cu un furnizor simulat prin ACEEAȘI interfață ca cel real;
      modelul se schimbă din configurare fără modificări de cod.
  - Verify: `npm test -- tests/assistant`
- [ ] Conversațiile apar stocate cu timestamp; una mai veche de 30 de
      zile e ștearsă de mecanismul de retenție.
  - Verify: `npm test -- tests/assistant`
- [ ] Flux manual pe 375px: deschid chat-ul, întreb de meniu, comand
      cap-coadă, văd comanda în panoul admin și liniile în coșul site-ului.
  - Verify: flow manual în `08-quickstart.md`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, and nothing outside the in-scope list has been changed.
