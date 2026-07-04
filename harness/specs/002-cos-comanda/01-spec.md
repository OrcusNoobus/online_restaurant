# Spec: Coș și plasare comandă

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.
> STATUS: updated 2026-07-04 with the owner's clarify answers (Q8–Q14).
> ATENȚIE proprietar: față de draftul inițial s-a schimbat regula taxei de
> livrare — comanda sub „minim" NU se mai blochează; sub prag se adaugă taxa
> zonei, la/peste prag livrarea e gratuită (02-clarify.md Q8/Q9).

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
  de opțiuni ca pe site-ul vechi — mărime (unde există), grupurile obligatorii
  („Ambalaj", „Garanție SGR" la băuturi), grupuri opționale (sos, băutură,
  garnitură), cantitate. Prețul topping-urilor diferă per mărime (feat-002 Q5).
- **Coșul:** listă de articole cu opțiunile alese, cantități editabile,
  ștergere articol. Garanția SGR (0,50 lei/recipient) apare ca linie separată,
  nu topită în prețul băuturii (02-clarify.md Q7). Coșul supraviețuiește unui
  refresh de pagină.
- **Calcul pe server:** subtotal, SGR, taxă de livrare, total — toate calculate
  exclusiv pe server, în bani întregi. Clientul nu trimite niciodată prețuri.
- **Livrare la domiciliu:** clientul alege localitatea din zonele definite
  (02-clarify.md Q8); dacă totalul comenzii (cu SGR, fără taxă) atinge pragul
  zonei, livrarea e gratuită; sub prag se adaugă taxa zonei la total, cu
  explicație vizibilă („mai adaugă X lei pentru livrare gratuită").
- **Ridicare personală:** fără adresă, fără taxă și fără prag; se afișează
  adresa restaurantului.
- **Programare:** „cât mai curând posibil" (estimare afișată: 60 min livrare;
  15/25 min la ridicare) sau la o oră aleasă de client, doar în ziua curentă.
  Orar zilnic 11:00–22:30; nicio livrare/ridicare înainte de 11:30. În afara
  orarului, checkout-ul e blocat cu mesaj clar (02-clarify.md Q10, Q16).
- **Checkout guest:** prenume, nume, telefon obligatoriu (validat, +40), email
  opțional, adresă (la livrare), observații; bifă de acord Termeni și Condiții
  / protecția datelor cu pagini placeholder (02-clarify.md Q12, Q14).
- **Metode de plată v1:** la livrare → numerar sau card la livrare; la
  ridicare → numerar sau card la restaurant (02-clarify.md Q11).
- **Persistență:** comanda se salvează în PostgreSQL cu status inițial „nouă",
  cu prețurile și denumirile înghețate pe liniile comenzii (snapshot la
  momentul plasării) și cu adresa IP a clientului (02-clarify.md Q14).
- **Confirmare:** ecran de confirmare cu numărul comenzii și recapitulare.

### Out of scope

- Plata online cu cardul (feat-012, decis 2026-07-04 — v. și DECISIONS.md).
- Cupoane / coduri de reducere (feat-011, decis 2026-07-04).
- Conturi de client și login social (feat-010, decis 2026-07-04).
- Panoul admin, schimbarea stării comenzii, reglarea timpului de livrare de
  către dispecer (feat-007; nota din 02-clarify.md Q10).
- Notificări email/SMS/WhatsApp la comandă nouă — v1 doar în baza de date;
  magazinul intră live abia cu feat-007 (decis 2026-07-04).
- Comenzi programate pentru altă zi decât cea curentă.
- Texte legale finale (paginile T&C/GDPR rămân placeholder până le dă
  proprietarul).
- Tracking curier, facturare, bonuri fiscale.
- Editarea comenzii după plasare.

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Un produs cu variante nu poate fi adăugat în coș fără mărime aleasă; un
   produs cu grupuri obligatorii (Ambalaj, Garanție SGR) nu poate fi adăugat
   fără selecția fiecărui grup obligatoriu.
2. Prețul unui articol = preț variantă + opțiuni (la prețul mărimii alese),
   înmulțit cu cantitatea. Garanția SGR apare ca linie separată în coș și în
   comanda salvată, iar totalul SGR al comenzii este identificabil distinct.
3. Totalul comenzii = subtotal articole (inclusiv ambalaj) + SGR + taxa de
   livrare. La livrare: dacă (subtotal + SGR) ≥ pragul zonei → taxa = 0;
   altfel taxa = taxa zonei. La ridicare nu există taxă. Toate sumele se
   calculează pe server; valori venite de la client se ignoră.
4. Comanda se poate plasa doar în orarul 11:00–22:30. Ora programată trebuie
   să fie în ziua curentă, ≥ max(acum + estimarea modului, 11:30) și ≤ 22:30;
   „cât mai curând posibil" folosește estimarea modului (60 min livrare,
   15/25 min ridicare la alegere).
5. Validări la plasare: telefon valid obligatoriu, localitate din zonele
   active + adresă la livrare, metodă de plată permisă pentru mod, acord T&C
   bifat, coș ne-gol, produse/variante/opțiuni existente și active.
6. Comanda plasată se salvează atomic (comanda + liniile + opțiunile ei) cu
   status „nouă", prețuri-snapshot, denumiri-snapshot și IP-ul clientului;
   o eroare de validare nu lasă date parțiale.
7. Întreaga logică (validare coș, calcul prețuri, plasare) este expusă ca
   serviciu apelabil independent de UI — canalele viitoare (chat, WhatsApp)
   o refolosesc fără duplicare (DECISIONS.md 2026-07-04).

## Non-Functional Requirements

- Mobile-first: tot fluxul (produs → coș → checkout → confirmare) utilizabil
  pe 375px lățime.
- Toate prețurile circulă ca bani întregi — vezi `harness/docs/ARCHITECTURE.md`.
- Orar și estimări de timp configurabile într-un singur loc (nu împrăștiate
  prin cod) — pregătire pentru reglarea de către dispecer în feat-007.

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and the
flows in `08-quickstart.md`.

- [ ] Pizza cu mărime + topping + ambalaj are prețul corect în coș (prețul
      topping-ului corespunde mărimii alese).
  - Verify: `npm test -- tests/orders`
- [ ] O băutură primește Garanția SGR 0,50 lei/recipient, vizibilă ca linie
      separată și însumată distinct în totalul comenzii.
  - Verify: `npm test -- tests/orders`
- [ ] Taxa de livrare: sub pragul zonei se adaugă taxa zonei; la/peste prag
      livrarea e 0; la ridicare personală nu există taxă. Cazuri pe cel puțin
      două zone cu valori diferite.
  - Verify: `npm test -- tests/orders`
- [ ] Comanda happy-path (livrare și ridicare) ajunge în baza de date cu
      status „nouă", linii + opțiuni cu prețuri-snapshot, date de contact și IP.
  - Verify: `npm test -- tests/orders`
- [ ] Validările refuză: telefon invalid, adresă/zonă lipsă la livrare, oră în
      afara orarului sau sub 11:30, metodă de plată nepermisă pentru mod, coș
      gol, produs/variantă/opțiune inactivă, grup obligatoriu neselectat.
  - Verify: `npm test -- tests/orders`
- [ ] Fluxul complet pe telefon (375px): meniu → opțiuni produs → coș →
      checkout → confirmare cu număr de comandă.
  - Verify: flow manual în `08-quickstart.md`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, and nothing outside the in-scope list has been changed.
