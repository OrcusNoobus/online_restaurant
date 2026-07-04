# Clarify: Meniu produse (catalog)

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

### Q1: De unde vin datele inițiale ale meniului?

**Answer:** Se extrag automat de pe site-ul Metro dish existent
(royal-food-delivery.order.app.hd.digital) și se salvează în repo ca fișier de
seed. Confirmat de proprietar la interviul din 2026-07-04.

### Q2: Mărimile de pizza sunt produse separate (ca pe site-ul vechi) sau variante?

**Answer:** Variante ale aceluiași produs. Pe site-ul vechi "Pizza 30cm",
"Pizza 40cm" și "Pizza XXL" sunt categorii separate; la noi o pizza e UN produs
cu 3 variante de mărime, fiecare cu prețul ei. Decis la interviu (2026-07-04).

### Q3: Fotografii — proprii sau placeholder?

**Answer:** Placeholder-e elegante în faza asta; fotografii proprii mai târziu.
Pozele de pe site-ul vechi NU se copiază (posibile drepturi ale platformei).
Răspuns de proprietar, 2026-07-04.

### Q4: Cum apare un produs temporar indisponibil?

**Answer:** Rămâne vizibil, gri, cu eticheta "indisponibil" — nu dispare din
meniu. Răspuns de proprietar, 2026-07-04.

### Q5: Prețul topping-urilor pe mărimi

**Answer:** Diferă — fiecare mărime de pizza are propriul preț pentru același
topping (ex: mozzarella extra costă altfel la 30cm decât la XXL). Modelul de
date primește prețuri de topping per mărime — actualizat în `05-data-model.md`
în aceeași sesiune. Răspuns de proprietar, 2026-07-04.

### Q6: Ordinea categoriilor

**Answer:** Se păstrează ordinea de pe site-ul vechi (Pizza primele).
Răspuns de proprietar, 2026-07-04.

## Open Questions

(none — toate întrebările sunt rezolvate; feature-ul poate începe)

## Notes For Future Changes

- Q5 (prețuri topping per mărime) devine operațională la feature-ul de coș —
  acolo se calculează prețul final al unei pizza cu topping-uri. Modelul de
  date e pregătit de pe acum (`topping_prices` per mărime).
- Direcția "canale conversaționale" (chat LLM pe site, WhatsApp/Telegram),
  anunțată de proprietar pe 2026-07-04, e consemnată în
  `harness/docs/DECISIONS.md` și în roadmap (feat-008/009). Nu afectează acest
  feature dincolo de regula: datele de meniu se expun prin repository/API, nu
  se leagă de UI.
