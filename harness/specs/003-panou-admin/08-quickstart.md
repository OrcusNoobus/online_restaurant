# Quickstart: Panou admin — produse și comenzi

> Authored by: Agent (verified by running every flow; human can replay).
> Reads from: `01-spec.md` acceptance criteria, `06-contracts/api.md`.
> Feeds into: `harness/feature-list.json` evidence.
> Prerequisites: `./init.sh` green, `npm run dev`, Docker db up, un cont
> admin + unul staff create cu `scripts/create-staff-user.ts`. Comenzile de
> test se plasează prin `POST /api/orders` sau prin shop.

## Flow 1 — Autentificare, proxy, roluri în navigare

1. `/admin` fără cookie → redirect imediat la `/admin/login` (proxy-ul vede
   doar prezența cookie-ului; verificarea reală e în layout).
2. Login `admin` → panoul se deschide pe „Comenzi"; nav: Comenzi, Produse,
   Zone, Setări + „Ana Dev · administrator" + Ieși.
3. Login cont staff → nav arată DOAR Comenzi și Produse; `/admin/zone` și
   `/admin/setari` accesate direct răspund cu mesajul de 403 („Doar
   administratorul…”), API-ul răspunde `403 forbidden_role`.
4. Credențiale greșite → „Utilizator sau parolă greșită." (nedistins între
   utilizator inexistent / parolă greșită / cont dezactivat).

**Executat 2026-07-05 (utilizatori dev `admin` #45, `angajat` #48). PASS.**

## Flow 2 — Comandă nouă → alertă → preluare cu estimare ajustată

1. Plasează o comandă pickup (#275, estimare cerută 15 min) și una delivery
   (#276) — day view-ul (poll la 5s) le arată în câteva secunde, cu badge
   „Nouă” și card pulsând amber; totalurile zilei includ ambele.
2. Starea sunetului e vizibilă lângă titlu: „🔔 Sunet pornit” (sau
   „⚠️ Sunet blocat — apasă” dacă browserul cere gest — un click îl
   deblochează). Tonul Web Audio se repetă la ~3s cât există comenzi „Nouă”.
3. Deschide #275 → panoul arată clientul, produsele cu opțiuni și prețuri
   snapshot, totalul, istoricul gol.
4. Introdu estimare 25 și „Preia comanda” → status „Preluată”, estimarea
   afișată devine ~25 min (cea promisă la plasare era 15), istoricul arată
   „Ana Dev: Nouă → Preluată”.

**Executat 2026-07-05 → #275: acceptare cu 25 min (jurnal event #225);
starea vizuală + toggle sunet verificate în browser. Tonul audio efectiv
(difuzoare) rămâne de confirmat de om pe dispozitivul real — starea UI și
gestul de deblocare sunt verificate. PASS (cu nota audio).**

## Flow 3 — Fluxurile complete pe ambele moduri, până la Finalizată

1. Pickup #275: Nouă → Preluată → „Gata de ridicare” → „Finalizează” —
   butoanele oferite sunt exact cele permise de graf la fiecare pas.
2. Delivery #276: Nouă → Preluată → „Trimite în livrare” → „Finalizează”.
3. În stare finală panoul nu mai oferă acțiuni înainte (doar undo pentru
   ultimul pas), iar cardul iese din filtrele active.

**Executat 2026-07-05 → #275 events #252–254 (pickup), #276 events până la
„În livrare → Finalizată” la 16:22 (jurnalul complet vizibil în panou). PASS.**

## Flow 4 — Anulare cu motiv obligatoriu + undo (inclusiv undo la anulare)

1. Pe o comandă „Nouă”, „Anulează…” deschide dialogul; butonul de confirmare
   e DEZACTIVAT cât timp motivul e gol.
2. Cu motiv („clientul nu răspunde la telefon”) → status „Anulată”, motivul
   apare în istoric; totalurile zilei o mută la „anulate” (Q11), suma zilei
   scade corespunzător.
3. „↩ Anulează ultimul pas” pe comanda anulată → revine la „Nouă” cu event
   compensator marcat „(undo)”; după un undo butonul dispare (un undo nu se
   poate anula — se merge înainte cu tranziții normale).

**Executat 2026-07-05 → #276: Nouă → Anulată (motiv) → Nouă (undo), apoi
#275: Preluată → Nouă (undo) după o preluare de test; ambele în jurnal. PASS.**

## Flow 5 — Două dispozitive, un singur câștigător

1. Comandă nouă #325; două POST `/transition {to:accepted}` trase SIMULTAN
   (sesiune admin cu estimare 20 + sesiune staff cu estimare 30).
2. Rezultat: admin 200, staff refuzat; în DB o singură preluare, estimare 20.
   Perdanta primește `409 stale_state` când citirea ei a fost înainte de
   commit-ul câștigătoarei, sau `422 invalid_transition` când a citit după —
   ambele căi lasă exact o scriere. Calea 409 pură e ținută determinist de
   testul de integrare „two devices race” din `tests/admin.test.ts`.
3. UI-ul care pierde reîncarcă comanda și re-randează acțiunile valide
   (mesaj „Starea s-a schimbat de pe alt dispozitiv…”).

**Executat 2026-07-05 → #325 (admin 200 / staff 422, o singură scriere) +
testul de race din suită (409). PASS.**

## Flow 6 — Catalog: editări reflectate în shop

1. Ca admin, `/admin/produse` → Pizza Bambini: preț 30 cm 37,00 → 37,50 →
   `GET /api/menu` arată 3750 imediat; sheet-ul din shop afișează 37,50.
2. Dezactivează varianta 60x40 → dispare din meniul public și din sheet
   (produsul rămâne cu 2 mărimi); reactivarea o readuce.
3. Completează Ingrediente + Alergeni → blocul „Ingrediente: … / Alergeni: …”
   apare în options sheet în shop.
4. „+ Categorie” („Deserturi Test”) și „+ Produs” („Papanași cu smântână”,
   mărime unică 18,50, grupa Ambalaj) → produsul apare în meniul public în
   categoria nouă și primește quote valid (1850 + 300 ambalaj) — comandabil
   end-to-end.
5. Ca staff: fără butoane de creare, fără celule de preț, fără formular de
   texte — DOAR toggle-urile Activ/Inactiv (care funcționează: staff a
   reactivat varianta 60x40). Categoriile nu au toggle pentru staff (Q14).

**Executat 2026-07-05 în browser + `GET /api/menu`/quote după fiecare pas;
DB readus la seed cu `SEED_FORCE=1` după. PASS.**

## Flow 7 — Zone: taxe live, zonă nouă, dezactivare

1. `/admin/zone` (admin): toate zonele cu taxă + prag; Corunca 30,00 → 35,00
   → următorul quote pentru Corunca folosește 3500 (fără cache).
2. Zonă nouă „Ceuașu Test” (40 / 150) → apare imediat în `GET /api/zones`
   (selectabilă la checkout).
3. Dezactivare → dispare din lista publică, rămâne în lista admin (tăiată);
   zonele nu se șterg niciodată (FK RESTRICT pe comenzile vechi).

**Executat 2026-07-05 (quote 3500 verificat; zona de test ștearsă din DB și
reseed forțat după). PASS.**

## Flow 8 — Setări: program + estimări live, validare

1. `/admin/setari` (admin): formularul arată valorile DB (11:00 / 22:30 /
   11:30 / 60 / „15, 25”).
2. Închidere 10:00 (înainte de deschidere) → eroare client „Ora de închidere
   trebuie să fie după deschidere.”; serverul are aceleași reguli (zod+CHECK).
3. Estimare livrare 60 → 50 → `GET /api/schedule` public arată 50 imediat
   (checkout-ul citește aceleași valori); revenit la 60 cu mesaj „Salvat.”.

**Executat 2026-07-05. PASS.**

## Flow 9 — Seed guard: panoul devine proprietarul datelor

1. Cu flag-urile NULL, `npm run db:seed` rulează complet.
2. Prima mutație de catalog din panou setează `catalog_protected_since`;
   prima mutație de zonă setează `zones_protected_since` (editările de
   SETĂRI nu setează niciunul).
3. `npm run db:seed` refuză zgomotos DOAR secțiunea protejată („SKIPPED
   catalog section: … admin-owned since …”), cealaltă se reînsămânțează.
4. `SEED_FORCE=1 npm run db:seed` resetează flag-urile și restaurează tot.

**Executat 2026-07-05: în testele de integrare (ambele direcții, cu seed-ul
REAL rulat prin execSync) și live de două ori la curățenia după Flow 6/7.
PASS.**

## Definition of Done — dovezi (2026-07-05)

- **Layer 1 (static):** `npm run lint && npm run typecheck` — pass (și în
  `./init.sh`, cu boundary checks).
- **Layer 2 (teste):** `npm test` — 112/112 pass (46 admin + 16 order-status
  + suitele pre-existente menținute verzi).
- **Layer 3 (E2E):** `npm test -- tests/admin` — 46/46 pass; fluxurile
  manuale 1–9 de mai sus executate live în browser pe 2026-07-05 (desktop +
  375px pentru day view + panou detaliu).
- Un singur punct rămas pe om: auzirea efectivă a tonului de alertă pe
  dispozitivul din restaurant (starea vizuală + deblocarea prin click sunt
  verificate; tonul e generat cu Web Audio, fără fișiere).
