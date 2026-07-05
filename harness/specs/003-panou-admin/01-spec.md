# Spec: Panou admin — produse și comenzi

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.
> STATUS: updated 2026-07-05 with the owner's clarify answers (Q1–Q15).

## Goal

Personalul restaurantului primește instrumentul care face magazinul utilizabil
zi de zi: se autentifică într-un panou de administrare, vede comenzile noi
imediat ce sosesc, le preia și le duce prin stările de livrare/ridicare până
la finalizare, reglează per comandă timpul estimat comunicat clientului și
ține meniul la zi (prețuri, disponibilitate, produse noi, ingrediente și
alergeni). feat-007 este poarta de intrare în producție — decizia din
feat-006 (02-clarify.md Q6): magazinul NU intră live până când restaurantul
nu are unde să vadă comenzile.

## User Story

Ca **angajat al restaurantului (dispecer)**, vreau să **văd comenzile noi în
timp real și să le schimb starea pe măsură ce le pregătim și le livrăm, și să
pot corecta rapid disponibilitatea și prețurile din meniu**, ca să **pot opera
magazinul online fără să depind de programator și fără să pierd nicio
comandă**.

## Scope

### In scope

- **Autentificare cu roluri:** conturi multiple cu utilizator + parolă, două
  roluri — **admin** și **angajat** (Q1). Conturile se creează la instalare;
  fără self-signup și fără reset prin email în v1 (Q2). Un utilizator
  neautentificat este redirecționat la login; sesiunea persistă per
  dispozitiv (ordinul zilelor — Q2).
- **Permisiuni (Q14):** angajatul lucrează cu comenzile (stări, timpi) și
  poate comuta disponibilitatea produselor/topping-urilor; adminul poate în
  plus: prețuri, produse/categorii noi, nume/descrieri/ingrediente/alergeni,
  zone de livrare, orar. Verificarea rolului se face pe server.
- **Lista comenzilor în timp real:** comenzile noi apar fără refresh manual,
  evidențiate, cu **sunet repetat cât timp există comenzi nepreluate** (Q4).
  Vederea implicită e ziua curentă, cu filtre pe stare și răsfoirea zilelor
  trecute; ziua afișează **totalul comenzilor ne-anulate (număr + sumă)**,
  cu anulatele numărate separat (Q11). Lista arată esențialul: număr, oră,
  mod, localitate, total, telefon, status.
- **Detaliul comenzii:** toate liniile cu opțiuni și cantități, SGR, taxă de
  livrare, total, date client (nume, telefon, adresă, observații), programare
  (ASAP/oră), metoda de plată.
- **Schimbarea stării (Q5, Q15):** livrare: nouă → preluată → în livrare →
  finalizată; ridicare: nouă → preluată → **gata de ridicare** → finalizată
  (stare nouă în sistem). Anulare din orice stare ne-finală, cu motiv
  obligatoriu; clientul e anunțat telefonic. O stare apăsată greșit se poate
  da un pas înapoi (undo). Tranzițiile invalide sunt respinse pe server.
- **Timp estimat per comandă (Q6):** la preluare, dispecerul confirmă sau
  ajustează estimarea comenzii (livrare: ex. 70–80 min la aglomerație,
  30–40 min liber și aproape; ridicare: poate mări peste ce a cerut clientul,
  ex. 15 → 25 min). Nu există reglaj global — estimarea e a comenzii.
- **Administrare meniu:** comutare disponibilitate (produs, mărime, topping —
  angajat + admin); modificare prețuri, editare nume/descriere, **câmpuri noi
  de ingrediente și alergeni**, **adăugare produse și categorii noi** (doar
  admin — Q7). Ingredientele/alergenii completați se afișează clientului în
  sheet-ul de opțiuni al produsului. Dezactivarea e deja respectată de meniu
  și de validarea coșului (soft hide din feat-002/006).
- **Sursa adevărului (Q8):** de la acest feature încolo meniul se
  administrează exclusiv din panou; importul/seed-ul nu mai suprascrie
  modificările făcute de restaurant.
- **Administrare zone de livrare (Q9):** editarea taxei și a pragului per
  localitate, adăugare de localități noi, dezactivare (doar admin).
- **Orar editabil (Q10):** orarul și opțiunile de timp (azi fixe în
  `src/lib/restaurant-config.ts`) devin editabile din panou (doar admin) și
  se mută în baza de date; checkout-ul le respectă de acolo.
- **Arhitectură:** toate operațiile (listă comenzi, tranziții, editări) trec
  prin stratul de servicii + API, ca orice alt canal (DECISIONS.md
  2026-07-04 — channel-agnostic core); panoul e doar un consumator.

### Out of scope

- Notificări către client la schimbarea stării (email/SMS/WhatsApp) —
  comunicarea e telefonică în v1.
- Tipărire — în viitor vine integrarea POS care printează și trimite comanda
  la monitoarele din bucătărie (Q12); nimic din asta în v1.
- Reglaj global al timpului de livrare („mod aglomerat" pentru toți clienții)
  — estimarea se reglează per comandă la preluare (Q6).
- UI de gestiune a conturilor de personal (creare/dezactivare/reset) —
  conturile se creează la instalare (Q2); UI-ul vine mai târziu.
- Rapoarte și statistici peste totalul zilei (Q11); export, contabilitate.
- Administrarea cupoanelor (feat-011 — depinde de acest feature, dar nu face
  parte din el).
- Conturi de clienți (feat-010), plata online (feat-012), canale
  conversaționale (feat-008/009).
- Editarea conținutului unei comenzi deja plasate (linii, prețuri, adresă) —
  corectările se fac telefonic + anulare/re-plasare.
- Tracking curier, hărți, rute; gestiune stocuri, rețete, materie primă.
- Texte legale finale (rămân pe lista separată din PROGRESS.md).

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Nicio pagină și niciun endpoint de admin nu răspunde fără autentificare;
   acțiunile rezervate adminului sunt refuzate pe server pentru rolul
   angajat (matricea Q14). Parolele se stochează doar hash-uite.
2. O comandă plasată apare în panoul deschis în cel mult câteva secunde, fără
   acțiune manuală; cât timp există comenzi în starea „nouă", panoul emite
   semnal sonor repetat + evidențiere vizuală.
3. Starea unei comenzi se schimbă doar pe tranzițiile permise modului ei
   (livrare / ridicare, cu „gata de ridicare" la ridicare), validate pe
   server; panoul arată doar acțiunile valide pentru starea curentă. Anularea
   cere motiv, permisă doar din stări ne-finale; orice tranziție se poate da
   un pas înapoi (undo). Schimbările de stare NU modifică snapshot-urile
   comenzii (prețuri, denumiri).
4. La preluare, dispecerul poate seta/ajusta estimarea comenzii; valoarea se
   salvează pe comandă și apare în panou. Estimările implicite de la plasare
   (60 min livrare, 15/25 min ridicare) rămân neschimbate în checkout.
5. Comutarea disponibilității (produs / mărime / topping) ascunde imediat
   elementul din meniul public și blochează plasarea lui în comenzi noi;
   reactivarea îl readuce. Comenzile existente rămân neatinse (snapshot).
   Operația e permisă și rolului angajat.
6. Modificarea unui preț (variantă, topping, ambalaj) se aplică doar
   cotațiilor și comenzilor viitoare; sumele circulă exclusiv ca bani întregi,
   calculate pe server. Doar admin.
7. Adminul poate crea produse și categorii noi și poate edita nume, descriere,
   ingrediente și alergeni; produsele noi apar în meniul public cu variantele
   și grupurile lor; ingredientele/alergenii completați se afișează în
   sheet-ul de opțiuni.
8. Adminul poate edita taxa/pragul zonelor, adăuga localități noi și
   dezactiva zone; modificarea se aplică de la următoarea cotație de coș.
   O zonă dezactivată nu mai poate fi aleasă la checkout.
9. Orarul și opțiunile de timp se citesc din baza de date, editabile de admin
   din panou; regulile de plasare/programare din checkout le respectă
   imediat (înlocuiesc constantele din `src/lib/restaurant-config.ts`).
10. De la feat-007 încolo, rularea seed-ului/importului NU suprascrie
    modificările de meniu făcute din panou.
11. Vederea zilnică arată numărul și suma comenzilor ne-anulate ale zilei
    (anulatele numărate separat), cu filtre pe stare și acces la zilele
    trecute.
12. Toate operațiile de administrare sunt expuse ca servicii apelabile
    independent de UI-ul de admin, în aceeași arhitectură ca ordering-ul.

## Non-Functional Requirements

- Panoul e proiectat pentru PC (acolo se lucrează cel mai mult — Q3), dar
  rămâne utilizabil pe 375px lățime, ca restul aplicației.
- Panoul e în limba română; codul și documentația tehnică în engleză.
- Parolele nu se stochează niciodată în clar; secretele stau în `.env`
  (niciodată în repo — AGENTS.md Safety Rules).
- Sunetul de comandă nouă funcționează în browserele desktop uzuale fără
  instalări suplimentare.

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and the
flows in `08-quickstart.md`.

- [ ] Un utilizator neautentificat nu poate accesa nicio pagină sau API de
      admin; după login accesul funcționează; un cont de angajat primește
      refuz pe server la o operație de admin (ex: modificare preț).
  - Verify: `npm test -- tests/admin`
- [ ] O comandă nouă plasată prin API apare în lista panoului fără refresh
      manual, cu evidențiere și semnal sonor activ cât e nepreluată.
  - Verify: `npm test -- tests/admin` + flow manual în `08-quickstart.md`
- [ ] Tranzițiile de stare merg cap-coadă pe ambele moduri (livrare: nouă →
      preluată → în livrare → finalizată; ridicare: nouă → preluată → gata de
      ridicare → finalizată); o tranziție nepermisă e respinsă; anularea fără
      motiv e respinsă; undo readuce starea anterioară.
  - Verify: `npm test -- tests/admin`
- [ ] La preluare, estimarea ajustată de dispecer se salvează pe comandă și
      se vede în panou.
  - Verify: `npm test -- tests/admin`
- [ ] Dezactivarea unui produs/mărimi/topping (cu cont de angajat) îl scoate
      din meniul public și din validarea comenzii; reactivarea îl readuce.
  - Verify: `npm test -- tests/admin`
- [ ] O modificare de preț (variantă și topping, cont admin) se reflectă în
      următoarea cotație de coș; o comandă plasată înainte rămâne cu prețurile
      vechi.
  - Verify: `npm test -- tests/admin`
- [ ] Un produs nou creat din panou (cu categorie nouă, ingrediente,
      alergeni) apare în meniul public și poate fi comandat; ingredientele și
      alergenii se văd în sheet-ul de opțiuni.
  - Verify: `npm test -- tests/admin` + flow manual
- [ ] Modificarea taxei/pragului unei zone schimbă calculul la următoarea
      cotație; o zonă nouă devine selectabilă la checkout; una dezactivată
      dispare.
  - Verify: `npm test -- tests/admin`
- [ ] Orarul editat din panou e respectat de checkout (ex: în afara noului
      orar, plasarea e blocată).
  - Verify: `npm test -- tests/admin`
- [ ] Re-rularea seed-ului după modificări din panou nu le suprascrie.
  - Verify: `npm test -- tests/admin`
- [ ] Vederea zilei arată totalul corect (număr + sumă, fără anulate).
  - Verify: `npm test -- tests/admin`
- [ ] Fluxul complet pe PC + spot-check la 375px: login → aud/văd comanda
      nouă → o duc până la finalizată → editez un preț și o disponibilitate →
      verific în shop.
  - Verify: flow manual în `08-quickstart.md`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, and nothing outside the in-scope list has been changed.
