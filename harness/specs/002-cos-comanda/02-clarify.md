# Clarify: Coș și plasare comandă

> Authored by: Both (agent asks; human answers; agent records).
> Reads from: `01-spec.md`.
> Feeds into: `04-plan.md`, `05-data-model.md`, `06-contracts/`.
> Every unresolved ambiguity is a coin flip the agent will make silently.
> This file replaces silent assumptions with recorded answers.

## How To Use This File

- Before planning, the agent lists every ambiguity it finds in the spec as a
  numbered question. The human answers. Both happen here, in writing.
- Answers are definitive. If an answer changes the contract or data model,
  update those files in the same session — this file records intent, they
  record truth.
- New questions found mid-implementation get added here first, then answered,
  then work resumes. No guessing.

## Resolved Questions

### Q1: Livrare, ridicare personală sau ambele în v1?

**Answer:** Ambele. Checkout-ul are două moduri: livrare (adresă + taxă pe
zonă) și ridicare personală (fără adresă, fără taxă), ca pe site-ul vechi.
Răspuns de proprietar, 2026-07-04.

### Q2: Cum se calculează taxa de livrare?

**Answer:** Taxă pe zonă — localitățile mai îndepărtate au taxă mai mare.
Regula exactă a fost rafinată la Q8/Q9: taxa zonei se aplică DOAR dacă
valoarea comenzii nu atinge pragul zonei („comanda minimă"); la sau peste
prag livrarea e gratuită. Comanda NU este blocată sub prag.
Răspuns de proprietar, 2026-07-04.

### Q3: Checkout cu cont sau guest?

**Answer:** Guest checkout în v1 (prenume, nume, telefon, adresă, observații).
Conturile de client cu login social (Google/Facebook/TikTok) — dorite de
proprietar pentru fluiditate și date salvate — devin feature separat după
feat-006 (feat-010 în feature-list). Răspuns de proprietar, 2026-07-04.

### Q4: Cupoane de reducere în v1?

**Answer:** Nu. Site-ul vechi are câmp de cupon; la noi vine ca feature viitor
(feat-011 în feature-list). Coșul v1 nu are câmp de cupon.
Răspuns de proprietar, 2026-07-04.

### Q5: Programare comandă sau doar „cât mai curând posibil"?

**Answer:** Ambele în v1: ASAP (cu timp estimat afișat) plus alegerea unei ore,
validată pe orarul restaurantului. Detalii de timp la Q10.
Răspuns de proprietar, 2026-07-04.

### Q6: Cum află restaurantul de o comandă nouă înainte de panoul admin?

**Answer:** Doar în baza de date — magazinul nu intră live până nu există
feat-007. Fără email/SMS în feat-006. Răspuns de proprietar, 2026-07-04.

### Q7: SGR și grupul „Ambalaj"

**Answer:** Moștenite din feat-002 (harness/specs/001-meniu-catalog/02-clarify.md
Q7 + Notes): prețurile băuturilor sunt prețuri de bază, SGR 0,50 lei/recipient
se adaugă la coș și se afișează separat; grupul „Ambalaj" e obligatoriu, cu
preț per categorie/mărime. În seed SGR-ul există deja ca grup obligatoriu
„Garanție SGR" (radio, 0,50 lei) pe cele 9 băuturi — coșul îl aplică prin
același mecanism generic de grupuri obligatorii ca Ambalajul.
Răspuns de proprietar, 2026-07-04.

### Q8: Tabelul concret al zonelor de livrare

**Answer:** (proprietar, 2026-07-04; valori în lei, stocate în bani întregi)

| Localitate | Taxă livrare | Prag livrare gratuită („comanda minimă") |
|---|---|---|
| Sântana de Mureș | 20 | 40 |
| Târgu Mureș | 20 | 40 |
| Sâncraiu de Mureș (Sancrai) | 30 | 50 |
| Sângeorgiu de Mureș (Sangeorz) | 40 | 200 |
| Livezeni | 40 | 180 |
| Corunca | 30 | 90 |

Regula, în cuvintele proprietarului: „Prag livrare gratuită: comanda minimă,
sau taxa de livrare dacă nu se atinge comanda minimă." Adică: sub pragul zonei
comanda este permisă, dar se adaugă taxa zonei; la sau peste prag, livrarea e
gratuită. Numele localităților se afișează cu diacritice complete (formele
scurte din tabel sunt cele folosite de proprietar).

### Q9: Pragul de livrare gratuită se raportează la ce sumă?

**Answer:** La totalul cu SGR, dar fără taxa de livrare (subtotal produse +
ambalaj + SGR). Taxa se adaugă doar când acest total nu atinge pragul zonei.
Răspuns de proprietar, 2026-07-04.

### Q10: Orarul restaurantului

**Answer:** (proprietar, 2026-07-04)
- Program: în fiecare zi, 11:00–22:30, fără zile închise.
- Nicio livrare sau ridicare înainte de 11:30, sub nicio formă.
- Ridicare personală: clientul alege 15 min / 25 min / oră introdusă de el.
- Livrare: timpul implicit afișat este 60 de minute.
- Perspectivă (feat-007, nu în v1): dispecerul va putea regla timpul afișat
  (aglomerat: 70–80 min; liber și aproape: 30–40 min) — de aceea valorile de
  timp se țin configurabile, nu împrăștiate prin cod.

### Q11: Metodele de plată pe moduri

**Answer:** Corect pentru v1: livrare → numerar sau card la livrare; ridicare
personală → numerar sau card la restaurant. Plata online cu cardul vine în
perspectivă — înregistrată ca feat-012 în feature-list (era deja decizia
„Payments v1" în DECISIONS.md). Răspuns de proprietar, 2026-07-04.

### Q12: Email-ul la checkout

**Answer:** Telefonul este obligatoriu (metoda de contact principală și
informație pe care o păstrăm). Email-ul rămâne câmp opțional în v1.
Răspuns de proprietar, 2026-07-04.

### Q13: Comanda minimă se aplică și la ridicare personală?

**Answer:** Nu — pragul/taxa există doar la livrare. Ridicarea personală nu
are nici taxă, nici prag. Răspuns de proprietar, 2026-07-04.

### Q14: Termeni și Condiții / protecția datelor

**Answer:** Doar bifă de acord + pagini placeholder până redactează
proprietarul textele legale. Adresa IP a clientului se stochează pe comandă
(prevenirea fraudelor, ca pe site-ul vechi) — util și pentru viitoarea bază de
date de clienți. Răspuns de proprietar, 2026-07-04.

## Open Questions

### Q15: SGR pentru băuturile adăugate ca opțiune la alt produs

Grupul „Adaugă băutură" (checkbox pe pizza etc.) conține 8 băuturi la preț de
bază, FĂRĂ SGR atașat — site-ul vechi nu adăuga SGR la acestea, doar la
băuturile comandate ca produs. Legal, orice recipient are garanție SGR.
Propunerea agentului: aplicăm SGR 0,50 lei și băuturilor adăugate ca opțiune
(marcate în data model cu un flag), ca totalul să fie corect în ambele cazuri.
Până la răspuns, implementăm propunerea (flag-ul face regula reversibilă din
seed, fără schimbare de cod).

### Q16: Fereastra de plasare și programare a comenzilor

Propunerea agentului pentru v1 (de confirmat):
- Comenzile se pot plasa doar cât timp site-ul e „deschis" (11:00–22:30);
  în afara orarului checkout-ul e blocat cu mesaj „închis, revenim la 11:00".
- Programarea este doar pentru ziua curentă (fără comenzi pentru altă zi).
- Ora programată trebuie să fie ≥ max(acum + estimarea modului, 11:30) și
  ≤ 22:30. Estimarea modului: 60 min livrare, 15 min ridicare.
Până la răspuns, implementăm exact propunerea de mai sus.

## Notes

- Ids-urile variantelor trebuie să devină stabile înainte ca liniile de comandă
  să le refere — regula replace-variants din `scripts/seed.ts` se rezolvă în
  acest feature (03-research.md, 07-tasks.md T01).
- Schema DB actuală nu stochează `required`/`displayType` pentru grupurile de
  topping-uri (există doar în JSON-ul de seed) — coșul are nevoie de ele;
  se adaugă în acest feature (05-data-model.md).
- Proprietarul a plasat o comandă de probă pe site-ul vechi (2026-07-04) —
  structura checkout-ului legacy e păstrată în interviul din sesiune.
- Reglarea timpului de livrare de către dispecer (Q10 „în perspectivă") se
  notează pentru spec-ul feat-007.
