# Spec: Coș și plasare comandă

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.
> STATUS: DRAFT — în așteptarea aprobării proprietarului și a răspunsurilor
> din `02-clarify.md` (valorile concrete pe zone, orar, plăți).

## Goal

Clientul își compune comanda direct din meniu — alege mărimea, topping-urile și
ambalajul — vede coșul cu totalul calculat pe server, alege livrare la domiciliu
sau ridicare personală, completează datele și plasează comanda cu plata la
livrare / la restaurant. Comanda ajunge în baza de date, de unde panoul admin
(feat-007) o va prelua. Întreaga logică de comandă se construiește ca serviciu
apelabil de orice canal (site, iar ulterior chat AI, WhatsApp, Telegram) —
decizie înregistrată în `harness/docs/DECISIONS.md` (2026-07-04).

## User Story

Ca **client al restaurantului**, vreau să **îmi aleg produsele cu mărimea și
topping-urile dorite și să plasez comanda de pe telefon, cu livrare sau
ridicare personală**, ca să **nu mai fiu nevoit să sun și să dictez comanda**.

## Scope

### In scope

- **Adăugare în coș din meniu:** la alegerea unui produs se deschid secțiunile
  de opțiuni ca pe site-ul vechi — mărime (unde există), grupul obligatoriu
  „Ambalaj" (preț per categorie/mărime), grupuri opționale (sos, băutură,
  garnitură), cantitate. Prețul topping-urilor diferă per mărime (feat-002 Q5).
- **Coșul:** listă de articole cu opțiunile alese, cantități editabile,
  ștergere articol. Taxa SGR (0,50 lei/recipient) se adaugă automat pentru
  băuturi și se afișează ca linie separată (feat-002 Q7).
- **Calcul pe server:** subtotal, SGR, taxă de livrare pe zonă, total — toate
  calculate exclusiv pe server, în bani întregi (integer bani). Clientul nu
  trimite niciodată prețuri.
- **Livrare la domiciliu:** clientul alege localitatea (zona) → taxa de livrare
  și comanda minimă ale zonei se aplică; livrare gratuită peste pragul stabilit;
  sub comanda minimă a zonei plasarea e blocată cu mesaj clar.
- **Ridicare personală:** fără adresă și fără taxă de livrare; se afișează
  adresa restaurantului.
- **Programare:** „cât mai curând posibil" (cu timp estimat afișat) sau la o
  oră aleasă de client, validată pe orarul restaurantului (comenzi doar în
  intervalul de funcționare).
- **Checkout guest:** prenume, nume, telefon (+40, validat), adresă (la
  livrare), observații; acord Termeni și Condiții / protecția datelor.
- **Metode de plată v1:** plată la primire — numerar sau card la livrare;
  la ridicare — numerar sau card la restaurant (fără plată online).
- **Persistență:** comanda se salvează în PostgreSQL cu status inițial „nouă",
  cu prețurile înghețate pe liniile comenzii (snapshot la momentul plasării).
- **Confirmare:** ecran de confirmare cu numărul comenzii și recapitulare.

### Out of scope

- Plata online cu cardul (integrare procesator) — feature viitor.
- Cupoane / coduri de reducere — feature viitor (decis 2026-07-04).
- Conturi de client și login social (Google/Facebook/TikTok) — feature separat,
  după feat-006 (decis 2026-07-04).
- Panoul admin și schimbarea stării comenzii (feat-007).
- Notificări email/SMS/WhatsApp la comandă nouă — v1 doar în baza de date;
  magazinul intră live abia cu feat-007 (decis 2026-07-04).
- Tracking curier, facturare, bonuri fiscale.
- Editarea comenzii după plasare.

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Un produs cu variante nu poate fi adăugat în coș fără mărime aleasă; un
   produs cu grup obligatoriu (Ambalaj) nu poate fi adăugat fără selecția
   grupului.
2. Prețul unui articol = preț variantă + topping-uri (la prețul mărimii alese)
   + ambalaj, înmulțit cu cantitatea; SGR se adaugă per recipient de băutură și
   apare ca linie separată în coș.
3. Totalul comenzii = subtotal articole + SGR + taxa de livrare a zonei;
   taxa devine 0 peste pragul de livrare gratuită. Toate sumele sunt calculate
   pe server; orice manipulare client-side este ignorată.
4. La livrare, plasarea comenzii sub comanda minimă a zonei este refuzată cu
   mesaj explicit; la ridicare personală nu se aplică taxă de livrare.
5. O comandă programată în afara orarului restaurantului este refuzată la
   validare; „cât mai curând posibil" este disponibil doar în orar.
6. Comanda plasată se salvează atomic (comanda + liniile ei) cu status „nouă",
   date de contact validate și prețuri-snapshot; o eroare de validare nu lasă
   date parțiale.
7. Întreaga logică (coș, prețuri, validare, plasare) este expusă ca serviciu
   apelabil independent de UI — canalele viitoare (chat, WhatsApp) o refolosesc
   fără duplicare.

## Non-Functional Requirements

- Mobile-first: tot fluxul (produs → coș → checkout → confirmare) utilizabil
  pe 375px lățime.
- Toate prețurile circulă ca bani întregi — vezi `harness/docs/ARCHITECTURE.md`.
- Coșul supraviețuiește unui refresh de pagină (clientul nu-și pierde comanda
  compusă).

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and the
flows in `08-quickstart.md`.

- [ ] Pizza cu mărime + topping + ambalaj are prețul corect în coș (prețul
      topping-ului corespunde mărimii alese).
  - Verify: `npm test -- tests/orders` (teste de integrare pe serviciul de coș)
- [ ] O băutură adaugă SGR 0,50 lei/recipient, afișat ca linie separată.
  - Verify: `npm test -- tests/orders`
- [ ] Taxa de livrare și comanda minimă se aplică per zonă; comanda sub minim
      e refuzată; peste pragul stabilit livrarea devine gratuită.
  - Verify: `npm test -- tests/orders`
- [ ] Comanda happy-path (livrare și ridicare) ajunge în baza de date cu
      status „nouă", linii cu prețuri-snapshot și date de contact.
  - Verify: `npm test -- tests/orders`
- [ ] Validările refuză: telefon invalid, adresă lipsă la livrare, oră în
      afara orarului, coș gol, produs/variantă inactivă.
  - Verify: `npm test -- tests/orders`
- [ ] Fluxul complet pe telefon (375px): meniu → opțiuni produs → coș →
      checkout → confirmare cu număr de comandă.
  - Verify: flow manual în `08-quickstart.md`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, and nothing outside the in-scope list has been changed.
