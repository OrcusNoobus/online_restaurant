# Clarify: Cupoane de reducere

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

## Resolved Questions (owner interview 2026-07-06)

### Q1: Ce tipuri de reducere intră în v1?

**Answer:** **Toate trei:** procent din produse, sumă fixă în lei și livrare
gratuită. Răspuns de proprietar, 2026-07-06.

### Q2: La ce se aplică reducerea (procent / sumă fixă)?

**Answer:** **Doar la subtotalul produselor.** Garanția SGR nu se reduce
niciodată (e garanție returnabilă, nu venit al restaurantului); taxa de
livrare nu se reduce decât prin tipul dedicat «livrare gratuită». Răspuns de
proprietar, 2026-07-06.

### Q3: Ce limitări ale cupoanelor intră în v1?

**Answer:** **Doar perioada de valabilitate** (de la – până la, plus
activ/inactiv manual). Proprietarul NU a selectat: număr total de utilizări,
o-folosire-per-client, valoare minimă de comandă — toate trei amânate într-un
feature ulterior. **Consecință înregistrată și acceptată:** în v1 un cupon
valid în fereastra lui poate fi folosit nelimitat, inclusiv de același client
la comenzi repetate; controlul e fereastra de valabilitate + dezactivarea
manuală. (Simplifică și modelul de date: fără contor de utilizări, fără
identitate per client la validare.) Răspuns de proprietar, 2026-07-06.

### Q4: Cine administrează cupoanele în panoul de personal?

**Answer:** **Doar rolul admin** — creare, editare, activare/dezactivare și
citirea listei de cupoane sunt admin-only, consecvent cu matricea de roluri
feat-007 (prețurile și banii = admin). Angajatul nu vede secțiunea de
cupoane, dar vede reducerea aplicată pe comenzile din panou. Răspuns de
proprietar, 2026-07-06.

## Defaults Recorded (propuse de agent; devin definitive la aprobarea 03-research)

- **D-a Un singur cupon per comandă:** fără stacking; aplicarea unui alt cod
  îl înlocuiește pe cel curent.
- **D-b Normalizarea codului:** trim + case-insensitive (stocat/comparat
  normalizat); codurile sunt unice după normalizare. Formatul exact
  (alfanumeric, lungime) se fixează la plan.
- **D-c Comanda stochează un snapshot:** codul și valoarea reducerii se
  copiază pe comandă la plasare (ca prețurile de produse în feat-006);
  modificarea sau ștergerea ulterioară a cuponului nu atinge comenzile
  existente. Cupoanele folosite se dezactivează, nu se șterg (mecanismul
  exact — soft/hard delete — la plan).
- **D-d Pragul de livrare gratuită rămâne pe valoarea DINAINTE de reducere:**
  reducerea nu scoate clientul de sub pragul de livrare gratuită al zonei
  (subtotal + SGR se compară cu pragul ca azi, înainte de aplicarea
  cuponului). Motivare: aplicarea unui cupon nu poate URCA niciodată o taxă
  — fără surprize negative; comportamentul existent al pragului rămâne
  neschimbat.
- **D-e Doar shop-ul web în v1:** câmpul de cupon există în coș/checkout web;
  asistentul AI (feat-008) nu expune cupoane (schema tool-urilor lui rămâne
  neschimbată); extensia = feature ulterior.
- **D-f Capetele ferestrei sunt opționale:** fără dată de început = valabil
  imediat; fără dată de sfârșit = valabil până la dezactivarea manuală.
- **D-g Rotunjirea procentului:** reducerea procentuală se calculează în bani
  întregi cu rotunjire în jos (floor) — deterministă, nu depășește niciodată
  procentul promis.
- **D-h Livrare gratuită fără efect ≠ eroare:** la ridicare personală sau
  când livrarea e deja gratuită, cuponul de livrare gratuită e acceptat cu
  reducere 0 (afișat onest în coș), nu refuzat — clientul nu e pedepsit că a
  introdus codul înainte să aleagă modul de livrare.

## Open Questions (de confirmat înainte sau la research)

Niciuna. Q1–Q4 răspunse la interviu (2026-07-06); D-a…D-h devin definitive
la aprobarea 03-research de către proprietar. Orice ambiguitate nouă
descoperită la implementare se adaugă AICI înainte de a scrie cod.
