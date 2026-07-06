# Quickstart: Conturi clienți și login social

> Authored by: Agent (verified by running the flows; human can replay).
> Reads from: `01-spec.md` acceptance criteria, `06-contracts/api.md`.
> Feeds into: `harness/feature-list.json` evidence.
> Prerequisites: `./init.sh` green, `npm run dev`, Docker db up. Viewport
> 375px (mobile-first). Google NU trebuie configurat pentru fluxurile 1–5
> (fluxul 4 chiar cere să NU fie); fluxul 6 cere clientul OAuth al
> proprietarului (pașii de consolă sunt documentați acolo).
>
> Curățenie după rulare: șterge conturile de test
> (`DELETE FROM customers WHERE email LIKE '%test-qs%'` — sesiunile cad în
> cascadă, comenzile revin la guest prin `ON DELETE SET NULL`), comenzile
> de test (`DELETE FROM orders WHERE id > <ultimul id real>`) și contul de
> staff temporar dacă a fost creat pentru pasul de status.

## Flow 1 — Jurnalul complet email+parolă (375px)

1. Deschide `/` pe 375px. În header apare intrarea „Cont" (discretă, nu
   blochează meniul). Atinge-o → `/cont` arată panoul de autentificare cu
   tab-urile Intră / Cont nou (fără buton Google — vezi Flow 4).
2. Tab „Cont nou": completează email `ana.test-qs@example.com`, parolă
   `parola-qs-1`, nume `Ana`, prenume `Test`, telefon `0740 000 111`,
   bifează acceptul de termeni. Trimite.
3. Așteptat: cont creat + auto-login (201 + `Set-Cookie rf_client_session`,
   httpOnly — invizibil în JS); `/cont` arată profilul (email, nume,
   telefon normalizat `+40740000111`) și istoricul gol; adresa/zona sunt
   goale (signup-ul nu le cere — D-g).
4. Din meniu adaugă un produs în coș → `/comanda`. Așteptat: nume, prenume,
   telefon PRECOMPLETATE din profil (silențios, prin
   `GET /api/account/me`); adresa e goală — completeaz-o per comandă
   (ex. „Str. Principală 10", zona Sântana de Mureș). Orice câmp rămâne
   editabil per comandă (Q2).
5. Plasează comanda (plata la primire). Așteptat: confirmarea obișnuită;
   în DB comanda are `customer_id` = contul Anei (ștampilat la insert, nu
   backfill).
6. D-h (absorbție în profil gol): `/cont` → profilul are ACUM adresa și
   zona completate din comandă (erau goale); un profil deja completat nu
   se suprascrie (verificat în teste).
7. Istoricul arată comanda cu status „nouă", total și numărul de produse.
   Deschide detaliul → produse, opțiuni, subtotal/SGR/taxă livrare — exact
   cifrele serverului de la checkout.
8. Status live: loghează-te în `/admin` (alt browser/profil), preia
   comanda. Așteptat: pe `/cont` statusul se schimbă în „preluată" în
   ≤15s FĂRĂ refresh (polling 15s).
9. Delogare: butonul de logout → `/cont` revine la panoul de autentificare;
   istoricul nu mai e vizibil; `GET /api/account/me` → 401.
10. Re-login cu emailul + parola de la pasul 2 → profilul și istoricul
    revin (sesiunea e una NOUĂ — token proaspăt la fiecare login).

## Flow 2 — Legarea comenzilor guest la crearea contului (Q3)

1. Delogat (sau alt profil de browser), plasează o comandă GUEST cu
   telefonul `0740 000 222` și emailul `bogdan.test-qs@example.com`.
2. Creează apoi un cont nou cu ACELAȘI telefon (email poate diferi, ex.
   `bogdan-alt.test-qs@example.com`).
3. Așteptat: comanda guest de la pasul 1 apare în istoricul contului
   imediat după creare (backfill first-claim la înregistrare, prin
   telefonul normalizat).
4. (Acoperit de teste, nu se repetă manual: legarea prin email, regula
   first-claim — un al doilea cont cu același telefon NU fură comanda
   deja legată, re-rularea la schimbarea telefonului în profil.)

## Flow 3 — Regresie guest: nimic nu s-a schimbat (FR3)

1. Delogat complet (fără cookie `rf_client_session`), parcurge comanda
   exact ca azi: coș → `/comanda` → câmpuri GOALE (niciun prefill, niciun
   apel care blochează UI-ul; `GET /api/account/me` răspunde 401 și
   checkout-ul nu face nimic) → plasează.
2. Așteptat: fluxul identic cu feat-006; în DB `customer_id IS NULL`;
   `npm test -- tests/orders` rămâne 22/22 (rulează în `./init.sh`).

## Flow 4 — Degradare fără Google (FR7 / D8)

1. Cu `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ABSENTE din `.env`:
   `/cont` delogat NU arată butonul „Continuă cu Google" (nici în tab-ul
   de login, nici la cont nou); textul „ai uitat parola" recomandă doar
   telefonul.
2. `curl -i localhost:3000/api/account/google/start` →
   `503 {"error":"google_not_configured"}`.
3. Email+parolă și guest checkout funcționează normal (fluxurile 1–3 au
   rulat exact în această stare).

## Flow 5 — Recuperare parolă telefonică (Q4)

1. Operatorul, pe host: `CUSTOMER_PASSWORD='parola-noua-9' npx tsx
   scripts/set-customer-password.ts --email ana.test-qs@example.com`
   (parola din env sau stdin, NICIODATĂ din argv).
2. Așteptat: mesaj de confirmare cu id-ul contului; login cu parola veche
   → 401 `invalid_credentials`; login cu parola nouă → 200.

## Flow 6 — Google real (necesită clientul OAuth al proprietarului)

> Configurare unică în Google Cloud Console (console.cloud.google.com →
> APIs & Services → Credentials → Create credentials → OAuth client ID):
> tip **Web application**; Authorized redirect URIs:
> `http://localhost:3000/api/account/google/callback` pentru dev și
> `https://<domeniul-de-producție>/api/account/google/callback` la deploy.
> Valorile merg DOAR în `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
> plus `APP_BASE_URL` corespunzător originii.

1. Cu variabilele setate, repornește `npm run dev`. `/cont` delogat arată
   „Continuă cu Google" cu nota de consimțământ (termeni + politica).
2. Atinge butonul → consimțământul Google (select_account) → înapoi pe
   `/cont` LOGAT: cont creat cu emailul Google (verificat), numele
   precompletat din claims, fără parolă (`hasPassword: false` — panoul de
   profil arată asta la „ai uitat parola"/metode de login).
3. Delogare → „Continuă cu Google" din nou → ajunge în ACELAȘI cont
   (potrivire pe `google_sub`, nu cont duplicat).
4. Legare la cont existent: pentru un cont email+parolă cu ACELAȘI email
   ca al contului Google, „Continuă cu Google" intră în acel cont și îi
   leagă `google_sub` (o singură identitate — D-e). Refuzul emailurilor
   neverificate și eșecurile (state mismatch etc. → `302 /cont?eroare=
   google` cu mesajul prietenos) sunt acoperite de teste cu exchange
   injectat.

## Rezultate

Executat 2026-07-06 pe preview la 375px (viewport mobile), dev DB, fără
Google configurat. `npm test -- tests/accounts`: 43/43.

- **Flow 1 — PASS.** Cont #433 creat din tab-ul „Creează cont"
  (auto-login; cookie invizibil din JS — httpOnly; în DB parola DOAR
  `scrypt:…`, telefonul normalizat `+40740000111`, `terms_accepted_at`
  setat). `/comanda` a precompletat silențios prenume/nume/telefon/email
  din profil (adresa goală — completată per comandă). Comanda **#1156**
  (Margherita 30 cm + ambalaj, 32,00 + 20,00 livrare = 52,00 lei, cifre
  identice pe confirmare/detaliu/DB) ștampilată `customer_id=433` la
  insert; profilul GOL a absorbit adresa+zona din comandă (D-h).
  Istoricul a arătat #1156 „Nouă"; după `accepted` (staff temporar, est.
  45 min) badge-ul a devenit „Preluată", iar tranziția `in_delivery`
  făcută cu pagina deschisă a apărut ca „În livrare" în ≤15s FĂRĂ
  refresh (polling). Delogare → panoul de login, `GET /api/account/me`
  401, istoricul nevizibil; re-login → profil + istoric înapoi.
- **Flow 2 — PASS.** Comanda guest #1157 (telefon `0740000222`, email
  bogdan.test-qs@…) plasată delogat avea `customer_id NULL`; contul nou
  #434 cu ALT email și ACELAȘI telefon a primit-o în istoric imediat
  după înregistrare (claim pe telefonul normalizat). Izolare verificată
  din browser ca #434: `GET /api/account/orders/1157` → 200,
  `/1156` (a Anei) → **404**, id inexistent → 404 — indistinguibile.
- **Flow 3 — PASS.** Delogat: toate câmpurile checkout GOALE, `me` 401,
  comanda plasată identic cu feat-006, `customer_id IS NULL` în DB;
  `tests/orders` 22/22 în `./init.sh`.
- **Flow 4 — PASS.** Fără `GOOGLE_*` în `.env`: niciun buton Google pe
  `/cont` (textul „ai uitat parola" recomandă doar telefonul);
  `GET /api/account/google/start` → `503 {"error":"google_not_configured"}`;
  fluxurile 1–3 au rulat exact în această stare.
- **Flow 5 — PASS.** `set-customer-password.ts` (parola prin env) a
  actualizat contul #433: parola veche → 401 `invalid_credentials`,
  parola nouă → 200. Email inexistent → eroare curată, exit 1.
- **Flow 6 — NEEXECUTAT (nu blochează):** cere clientul OAuth din Google
  Cloud al proprietarului (încă necreat). Toate comportamentele Google
  deterministe (creare / login pe `google_sub` / legare pe email
  verificat / refuz email neverificat / state mismatch → redirect cu
  mesaj prietenos) sunt acoperite de teste cu exchange injectat
  (tests/accounts). Rămâne check-ul uman la configurare — pașii de
  consolă sunt documentați mai sus.

Constatare (nu regresie): `phoneSchema` (contract feat-006, refolosit
verbatim) respinge spațiile interioare — „0740 000 111" → 400 și
formularul de cont arată mesajul generic; identic cu checkout-ul.
Detalii + observația despre polling-ul 401 în `09-debug.md`.

Curățenie efectuată: clienții #433/#434 șterși (sesiuni în cascadă,
comenzile revin la guest prin SET NULL), comenzile de test #1156/#1157
șterse, contul staff temporar #131 șters.
