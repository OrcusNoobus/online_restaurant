# Quickstart: Cupoane de reducere

> Authored by: Agent (executed manually; results recorded below).
> Reads from: `01-spec.md` acceptance criteria, `06-contracts/api.md`.
> Feeds into: the Definition of Done (layer 3) and `harness/feature-list.json` evidence.
> Manual flows at 375px complementing `npm test -- tests/coupons` (28 tests).

## Prerequisites

- `./init.sh` green; `npm run dev` running; browser viewport 375px.
- Two staff accounts (one `admin`, one `staff`) — create with
  `scripts/create-staff-user.ts` if needed.
- If testing outside opening hours: temporarily set `open_minutes = 0` in
  `restaurant_settings` and RESTORE it afterwards (settings edits do not
  touch the seed-protection flags).

## Flow 1 — Adminul creează toate cele 3 tipuri (+ unul expirat)

1. Login ca admin → nav-ul arată «Cupoane» → deschide /admin/cupoane.
2. Creează: `VARA10` procent 10; `SUPER50` sumă fixă 50 lei; `TRANSPORT0`
   livrare gratuită; `EXPIRAT` procent 20 cu «până la» o dată din trecut.
3. Verifică: toate apar în listă cu tipul, valoarea (−10% / 50,00 lei /
   taxa 0), fereastra («până la …» / «fără limită de timp») și starea Activ.

## Flow 2 — Angajatul nu vede secțiunea (dar vede reducerea pe comenzi)

1. Logout → login ca angajat.
2. Verifică: nav-ul arată DOAR Comenzi + Produse (fără Cupoane).
3. Intră direct pe URL-ul /admin/cupoane → mesajul «Doar administratorul
   are acces la cupoane.», fără nicio dată de cupon în pagină.

## Flow 3 — Comandă completă cu procent (guest, 375px)

1. Ca vizitator: meniu → Pizza Bambini → 30 cm + Ambalaj → «Adaugă în coș».
2. /cos: «Ai un cod de reducere?» → tastează `vara10` (litere mici) →
   Aplică. Verifică: chip «Cupon aplicat: VARA10», linia
   «Reducere (VARA10): −4,00 lei», Total produse 36,00 lei.
3. /comanda: Livrare + Sâncraiu de Mureș (taxă 30, prag 50) + date client +
   Termeni → verifică Total 66,00 lei (40 − 4 + 30) → Plasează.
4. Confirmarea arată linia de reducere și totalul; coșul ȘI cuponul s-au
   golit din localStorage.
5. În DB: comanda are `coupon_id`, `coupon_code='VARA10'`,
   `discount_bani=400`, `total_bani=6600`.
6. Ca ANGAJAT în panou: deschide comanda → blocul de bani arată
   «Reducere (VARA10): −4,00 lei», Total 66,00 lei.

## Flow 4 — Sumă fixă plafonată la subtotal

1. Coș de 40,00 lei; aplică `SUPER50` (50 lei).
2. Verifică: reducerea afișată e −40,00 lei (NU −50), Total produse
   0,00 lei — totalul nu devine negativ.

## Flow 5 — Livrare gratuită sub prag

1. Același coș (40 lei, sub pragul Sâncraiu de 50); aplică `TRANSPORT0`.
2. /comanda cu Livrare + Sâncraiu: linia taxei arată «gratuită (cupon)»,
   Total 40,00 lei, FĂRĂ o linie separată de reducere (ar dubla vizual).

## Flow 6 — Coduri invalide, coșul rămâne utilizabil

1. Aplică `EXPIRAT` → mesaj «Codul a expirat.», cuponul dispare din starea
   coșului, produsele rămân, Total produse revine la 40,00 lei.
2. Aplică `NUEXISTA` → mesaj «Codul introdus nu există.», același
   comportament.

## Flow 7 — Fără cupon = neschimbat (neregresie)

1. Coșul fără niciun cod arată exact liniile de dinainte de feat-011
   (Subtotal / SGR / Total produse) — nicio linie de reducere.
2. `npm test -- tests/orders` (22/22) rămâne poarta de neregresie.

## Cleanup

Șterge comanda de test, cele 4 cupoane, utilizatorii staff temporari;
restaurează `open_minutes`; golește localStorage (`rfd-cart-v1`,
`rfd-coupon-v1`). Verifică cu SELECT-uri în același batch.

## Rezultate (executat 2026-07-07, 375px, preview live)

- **Flow 1: PASS** — toate 4 cupoanele create prin formularul UI ca
  `test-cpn-ui-admin` (#172); lista le-a afișat cu tip/valoare/fereastră
  corecte (screenshot în sesiune).
- **Flow 2: PASS** — angajatul (#173) a văzut doar Comenzi + Produse;
  URL-ul direct a răspuns cu mesajul de acces, zero date de cupon.
- **Flow 3: PASS** — comanda #1687: `vara10` normalizat la VARA10, coș
  36,00, checkout 66,00, confirmare cu reducere, storage golit; rândul DB:
  coupon_id=432, coupon_code=VARA10, discount_bani=400, total_bani=6600,
  customer_id NULL (guest); angajatul a văzut «Reducere (VARA10): −4,00
  lei» în detaliu.
- **Flow 4: PASS** — SUPER50 pe coș de 40: reducere −40,00, Total produse
  0,00.
- **Flow 5: PASS** — TRANSPORT0 sub prag: «gratuită (cupon)», Total 40,00,
  fără linie dublă.
- **Flow 6: PASS** — EXPIRAT: «Codul a expirat.», cupon scos, coș intact;
  NUEXISTA: «Codul introdus nu există.» (verificat și la T07).
- **Flow 7: PASS** — coș fără cod identic cu pre-011; tests/orders 22/22.
- **Cleanup: DONE** — comanda #1687, cele 4 cupoane și staff-ul temporar
  șterse; open_minutes restaurat la 660; verificat cu SELECT-uri în același
  batch psql.
