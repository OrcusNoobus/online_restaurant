# Spec: Conturi clienți și login social

> Authored by: Human (the agent may draft; the human approves every line).
> Reads from: — (this is the root of the chain).
> Feeds into: `02-clarify.md`, `04-plan.md`, `harness/feature-list.json`.
> Single source of truth for desired behavior, in product terms. No technical
> design here — that belongs to `04-plan.md`.
> STATUS: draft + owner interview (Q1–Q5) recorded 2026-07-06; ready for research.

## Goal

Clientul își poate crea un cont OPȚIONAL pe site și rămâne autentificat pe
dispozitivul lui. Un client logat își regăsește datele de livrare
precompletate la checkout și își vede comenzile trecute cu statusul lor
curent, fără să sune. Guest checkout rămâne neschimbat și complet funcțional
— contul nu este niciodată obligatoriu pentru a comanda. Feature cerut de
proprietar la interviul feat-006 (2026-07-04) și detaliat la interviul
acestui feature (2026-07-06).

## User Story

Ca **client care comandă des**, vreau să **îmi fac un cont și să rămân logat**,
ca să **nu recompletez de fiecare dată numele, telefonul și adresa, și să văd
singur ce am comandat și în ce stadiu e comanda** — fără să sun la restaurant.

## Scope

### In scope

- **Cont opțional (Q1):** clientul își poate crea cont cu **email + parolă**
  SAU prin **login Google** (OAuth). Guest checkout rămâne identic și
  disponibil; contul nu blochează și nu schimbă fluxul de comandă pentru cine
  nu vrea cont.
- **Rămâne autentificat (Q1):** sesiune de lungă durată per dispozitiv
  (valoarea exactă e decizie tehnică la plan; propunere înregistrată în
  02-clarify), în cookie httpOnly — același model de sesiune ca panoul de
  personal (feat-007), dar cu tabel și cookie SEPARATE (clienții nu sunt
  personal, nu au acces la `/admin`).
- **Profil de livrare precompletat (Q2):** contul reține datele de contact și
  livrare ale clientului (nume, prenume, telefon, email opțional, o adresă de
  livrare cu localitatea/zona) și le precompletează la checkout; clientul
  poate edita orice câmp per comandă și își poate actualiza profilul.
- **Istoric și status comenzi (Q2):** clientul logat își vede lista comenzilor
  proprii, fiecare cu statusul curent (nouă / preluată / în livrare / gata de
  ridicare / finalizată / anulată) — citite din aceleași date ca panoul de
  personal, DOAR pentru comenzile care îi aparțin. Aceasta redeschide, EXCLUSIV
  pentru proprietarul autentificat al comenzii, ceea ce feat-008 a lăsat
  telefonic (statusul prin chat rămâne out of scope — Q12 feat-008).
- **Legarea comenzilor guest (Q3/Q5):** la crearea contului, comenzile plasate
  anterior ca guest cu ACELAȘI telefon (identificatorul principal, normalizat)
  sau email devin vizibile în istoricul contului. **Risc acceptat de proprietar
  (Q5):** fără verificare email/SMS în v1, legarea automată poate expune
  istoricul unui client dacă telefonul/emailul e reutilizat sau introdus
  rău-intenționat; mitigarea (verificare) este amânată explicit într-un feature
  ulterior.
- **Login social — Google în v1 (Q1):** autentificare cu contul Google prin
  OAuth. Facebook și TikTok rămân cerute de proprietar, dar amânate într-un
  feature ulterior din cauza verificării de business / review-ului de app al
  platformelor (pot dura săptămâni) — nu blochează lansarea conturilor.
- **Aceleași reguli de comandă ca înainte:** un client logat plasează comanda
  prin ACELAȘI serviciu de comenzi, cu aceleași validări de server (orar, zonă,
  produse active, ambalaj, SGR, telefon normalizat, plata la primire). Contul
  nu dă clientului nicio putere în plus față de guest — doar comoditate.
- **Confidențialitate:** pagina de confidențialitate se actualizează cu datele
  de cont și cu drepturile aferente; ștergerea/exportul datelor de cont se
  cer telefonic sau prin email (ca restul politicii), fără UI de self-service
  în v1 (propunere înregistrată în 02-clarify).

### Out of scope

- **Fără email tranzacțional în v1 (Q4):** nicio verificare de adresă de email,
  niciun reset de parolă prin email. Parola uitată se rezolvă prin login Google
  sau telefonic (ca la personal, feat-007). Email tranzacțional = feature
  ulterior.
- **Facebook și TikTok Login** — amânate (Q1); Google e singurul provider
  social în v1.
- **Verificare telefon (SMS)** și, prin urmare, legarea verificată a comenzilor
  guest — feature ulterior (Q5).
- **Precompletare din cont pentru chat/asistent (feat-008)** și canalele
  externe (feat-009) — feat-010 acoperă doar shop-ul web; integrarea contului
  cu asistentul e o extensie ulterioară.
- **Mai multe adrese salvate (agendă de adrese)** — v1 reține un singur profil
  de livrare (câmpurile de la guest checkout); adrese multiple = feature
  ulterior (propunere înregistrată în 02-clarify).
- **Roluri/permisiuni pentru clienți, program de loialitate, puncte, cupoane
  legate de cont** (cupoanele sunt feat-011), marketing prin email/newsletter
  (proprietarul nu face marketing — feat-008), plată online (feat-012).
- **Modificarea/anularea prin cont a unei comenzi deja plasate** — corectările
  rămân telefonice (ca în feat-007/feat-008); contul e read-only pe comenzi.
- **Self-service delete/export UI (GDPR)** — prin cerere telefonică/email în v1.

The out-of-scope list above is your defense. Scope creep is the most common
agent failure mode; anything not listed as in scope is out of scope by default.

## Functional Requirements

1. Un vizitator își poate crea un cont cu email + parolă sau cu Google, de pe
   mobil și desktop; validările sunt server-side; parola (când există) se
   stochează doar hash-uită (niciodată în clar), refolosind mecanismul din
   feat-007.
2. Un client logat rămâne autentificat pe dispozitiv între vizite (sesiune de
   lungă durată în cookie httpOnly); se poate deloga; delogarea invalidează
   sesiunea server-side.
3. Guest checkout rămâne identic și disponibil; niciun pas de comandă nu cere
   cont; un client fără cont nu observă nicio diferență față de azi.
4. La checkout, un client logat vede datele de contact și livrare
   precompletate din profil; le poate edita per comandă; comanda plasată se
   leagă de contul lui.
5. Un client logat își vede lista comenzilor proprii cu statusul curent al
   fiecăreia; nu vede comenzile altcuiva; un vizitator nelogat nu vede niciun
   istoric.
6. La crearea contului, comenzile guest anterioare cu același telefon/email
   devin vizibile în istoricul contului (Q3); riscul de legare neverificată e
   acceptat pentru v1 (Q5).
7. Login cu Google folosește OAuth: cheile/secretor providerului stau exclusiv
   în `.env` (niciodată în repo); dacă providerul nu e configurat, opțiunea de
   login Google pur și simplu nu apare, iar restul (email+parolă, guest) merge
   normal.
8. Datele de cont și drepturile aferente apar în pagina de confidențialitate;
   nu se trimit mesaje de marketing; datele nu depășesc ce colectează o
   comandă.
9. Un client logat plasează comanda prin același serviciu de comenzi, cu
   aceleași validări de server ca guest; contul nu acordă nicio putere în plus.

## Non-Functional Requirements

- Mobile-first (375px), funcțional pe desktop; nu blochează UI-ul shop-ului.
- Autentificarea și sesiunile respectă practicile din feat-007 (parole
  hash-uite cu scrypt, token opac cu hash în DB, cookie httpOnly, SameSite,
  Secure în producție, rate limit la login).
- Secretele (parole, secretul OAuth Google) doar în `.env` (AGENTS.md Safety
  Rules); apelurile OAuth se fac doar de pe server.
- Contul e strict opțional: indisponibilitatea sau neconfigurarea auth-ului nu
  afectează guest checkout.

## Acceptance Criteria

Each criterion pairs an observable behavior with the verification that proves
it. These become the `verification` entries in `harness/feature-list.json` and
the flows in `08-quickstart.md`. (Comanda de verificare exactă se fixează la
plan; draft: `npm test -- tests/accounts`.)

- [ ] Un vizitator creează cont cu email + parolă, se deloghează și se
      re-loghează; parola e stocată doar hash-uită.
  - Verify: `npm test -- tests/accounts`
- [ ] Login cu Google (OAuth) creează/loghează un cont; dacă Google nu e
      configurat, opțiunea nu apare și restul merge.
  - Verify: `npm test -- tests/accounts` + flow manual în `08-quickstart.md`
- [ ] Guest checkout rămâne identic: o comandă ca guest se plasează exact ca
      azi, fără să atingă conturile.
  - Verify: `npm test -- tests/orders` (neregresie) + flow manual
- [ ] Un client logat vede datele precompletate la checkout și le poate edita;
      comanda plasată se leagă de contul lui.
  - Verify: `npm test -- tests/accounts` + flow manual
- [ ] Un client logat își vede DOAR comenzile proprii cu statusul curent; un
      alt client nu le vede; un nelogat nu vede istoric.
  - Verify: `npm test -- tests/accounts` (izolare pe utilizator, ambele
    direcții)
- [ ] La creare cont, o comandă guest anterioară cu același telefon apare în
      istoric.
  - Verify: `npm test -- tests/accounts`
- [ ] Flux manual pe 375px: creez cont, comand cu date precompletate, văd
      comanda în istoric cu status, mă deloghez și re-loghez.
  - Verify: flow manual în `08-quickstart.md`

## Success Definition

The feature is successful when every acceptance criterion above passes its
verification, guest checkout is provably unchanged, and nothing outside the
in-scope list has been changed.
