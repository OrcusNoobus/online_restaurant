# Spec: Cupoane de reducere

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.
> STATUS: draft + owner interview (Q1–Q4) recorded 2026-07-06; ready for research.

## Goal

Clientul poate introduce un cod de cupon în coș, iar reducerea — calculată
EXCLUSIV pe server — se aplică la valoarea produselor și se vede ca linie
separată în coș, la checkout și pe comandă. Proprietarul definește cupoanele
din panoul de admin: tip (procent / sumă fixă / livrare gratuită), valoare și
perioadă de valabilitate. Feature scos explicit din feat-006 la interviul din
2026-07-04 și detaliat la interviul acestui feature (2026-07-06).

## User Story

Ca **client care a primit un cod promoțional** (flyer, social media, la
telefon), vreau să **introduc codul în coș și să văd imediat reducerea
aplicată**, ca să **plătesc mai puțin la comanda respectivă** — fără pași
suplimentari și fără cont obligatoriu.

## Scope

### In scope

- **Câmp de cupon în coș:** clientul introduce un cod; serverul îl validează
  și returnează reducerea; coșul și checkout-ul afișează reducerea ca linie
  separată și totalul recalculat. Cuponul rămâne aplicat până la plasarea
  comenzii sau până îl scoate clientul.
- **Trei tipuri de reducere (Q1):** procent din valoarea produselor (ex.
  -10%), sumă fixă (ex. -20 lei) și livrare gratuită (anulează taxa de
  livrare a zonei).
- **Baza reducerii (Q2):** procentul și suma fixă se aplică DOAR la
  subtotalul produselor. Garanția SGR nu se reduce niciodată (e garanție
  returnabilă, nu venit); taxa de livrare nu se reduce decât prin tipul
  dedicat «livrare gratuită».
- **Valabilitate (Q3):** fiecare cupon are o perioadă de valabilitate
  (de la – până la) și un comutator activ/inactiv; în afara ferestrei sau
  dezactivat, cuponul e refuzat cu mesaj clar în română, iar comanda se
  poate plasa în continuare fără cupon.
- **Administrare doar admin (Q4):** cupoanele se creează, editează și
  dezactivează exclusiv de rolul admin, în panoul de personal; angajatul nu
  vede secțiunea de cupoane (consecvent cu matricea de roluri feat-007:
  banii sunt admin-only).
- **Comanda înregistrează cuponul:** codul folosit și valoarea reducerii se
  stochează pe comandă și se văd în panoul de personal la detaliile
  comenzii (angajatul vede reducerea pe comandă, nu definiția cuponului).
- **Server-side, atomic:** validarea și calculul se fac pe server la cotarea
  coșului ȘI se re-verifică la plasarea comenzii (același model ca
  validările existente de zonă/produse/orar din feat-006).
- **Un singur cupon per comandă** (D-a); guest și client logat beneficiază
  identic — contul nu e necesar și nu schimbă nimic.

### Out of scope

- **Limite de utilizare** — număr total de utilizări și o-folosire-per-client
  — și **valoare minimă de comandă**: amânate explicit de proprietar la
  interviu (Q3). Consecința, înregistrată și acceptată: în v1 un cupon valid
  în fereastra lui poate fi folosit de oricâte ori, inclusiv de același
  client la comenzi repetate; controlul se face prin fereastra de
  valabilitate și dezactivarea manuală. Limitele = feature ulterior.
- **Cupoane în chat-ul asistent (feat-008) și pe canalele externe
  (feat-009)** — v1 acoperă doar coșul/checkout-ul web; extensia la asistent
  e un feature ulterior (D-e).
- **Combinarea mai multor cupoane (stacking)** — exact un cupon per comandă.
- **Cupoane automate fără cod, reduceri pe produs/categorie specifice,
  program de loialitate/puncte** — nu fac parte din feature.
- **Generare în masă de coduri unice de unică folosință** — depinde de
  limitele de utilizare, amânată odată cu ele.
- **Distribuție/marketing** (email, SMS, notificări) — proprietarul distribuie
  codurile prin canalele lui; site-ul doar le acceptă.

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Clientul poate introduce un cod de cupon în coș, de pe mobil și desktop;
   serverul validează codul și returnează reducerea ca linie separată;
   totalul se recalculează pe server, în bani întregi (fără virgulă mobilă).
2. Cupon procent: reducere = procentul aplicat subtotalului produselor.
   Cupon sumă fixă: reducerea nu poate depăși subtotalul produselor (totalul
   nu devine niciodată negativ). Cupon livrare gratuită: taxa de livrare a
   zonei devine 0; la ridicare personală sau când livrarea e deja gratuită
   (peste pragul zonei), cuponul e acceptat dar fără efect (reducere 0,
   afișat onest).
3. SGR nu e redus de niciun tip de cupon; taxa de livrare e redusă doar de
   tipul «livrare gratuită».
4. Un cod inexistent, inactiv, expirat sau încă neînceput e refuzat cu mesaj
   clar în română; coșul rămâne complet utilizabil fără cupon.
5. Plasarea comenzii re-validează cuponul în aceeași tranzacție cu comanda;
   comanda stochează codul și valoarea reducerii; ambele apar în panoul de
   personal la detaliile comenzii.
6. Adminul (doar rolul admin) poate crea, edita, activa/dezactiva cupoane:
   cod, tip, valoare, fereastră de valabilitate; angajatul nu are acces la
   secțiune (nici citire), dar vede reducerea pe comenzile care au folosit-o.
7. Codurile sunt unice și case-insensitive (clientul poate tasta
   «vara10», «VARA10» sau «Vara10» — același cupon).
8. Exact un cupon per comandă; aplicarea altui cod îl înlocuiește pe cel
   curent.
9. Cupoanele funcționează identic pentru guest și pentru clientul logat
   (feat-010); niciun tip de cont nu e necesar.

## Non-Functional Requirements

- Mobile-first (375px), funcțional pe desktop; câmpul de cupon nu
  aglomerează coșul (discret când e gol).
- Toți banii în bani întregi (integer), ca în feat-006; nicio aritmetică în
  virgulă mobilă pe prețuri.
- Validarea și calculul trăiesc în serviciul de cotare/comenzi (apelabile de
  orice canal, DECISIONS.md 2026-07-04), nu în UI; UI-ul doar afișează.
- Fără regresii: coșul, cotarea și plasarea comenzii fără cupon rămân
  identice (testele feat-006 trec neschimbate).

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and
the flows in `08-quickstart.md`. (Comanda de verificare: `npm test --
tests/coupons`.)

- [ ] Un cupon procent valid aplică reducerea corectă la subtotalul
      produselor; SGR și taxa de livrare rămân neschimbate; totalul e
      recalculat pe server.
  - Verify: `npm test -- tests/coupons`
- [ ] Un cupon sumă fixă mai mare decât subtotalul reduce exact subtotalul
      (totalul nu devine negativ, SGR + taxa rămân de plată).
  - Verify: `npm test -- tests/coupons`
- [ ] Un cupon livrare gratuită anulează taxa zonei la livrare sub prag; la
      ridicare personală sau peste prag reducerea e 0.
  - Verify: `npm test -- tests/coupons`
- [ ] Un cod expirat / inactiv / inexistent / încă neînceput e refuzat cu
      motivul corect; comanda se plasează normal fără cupon.
  - Verify: `npm test -- tests/coupons`
- [ ] Comanda plasată cu cupon stochează codul + valoarea reducerii, iar
      cuponul e re-validat la plasare (un cupon dezactivat între cotare și
      plasare e refuzat).
  - Verify: `npm test -- tests/coupons`
- [ ] Adminul creează/editează/dezactivează un cupon; angajatul nu poate
      (nici prin API); reducerea apare la detaliile comenzii în panou.
  - Verify: `npm test -- tests/coupons` (matrice de roluri, ambele direcții)
- [ ] Fără cupon, cotarea și comanda sunt neschimbate (neregresie feat-006).
  - Verify: `npm test -- tests/orders`
- [ ] Flux manual pe 375px: aplic un cupon în coș, văd reducerea, plasez
      comanda, văd reducerea în admin; încerc un cod expirat și înțeleg
      mesajul.
  - Verify: flow manual în `08-quickstart.md`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, cart/checkout without a coupon is provably unchanged, and
nothing outside the in-scope list has been changed.
