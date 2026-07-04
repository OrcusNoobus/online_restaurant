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

## Open Questions

- **Q3 — Fotografii:** Aveți fotografii proprii pentru produse, sau lansăm cu
  placeholder-e elegante până faceți poze? (Pozele de pe site-ul vechi ar putea
  avea drepturi de autor ale platformei — de verificat înainte să le refolosim.)
- **Q4 — Produse indisponibile:** Un produs temporar indisponibil (ex: s-a
  terminat un ingredient) dispare complet din meniu sau apare cu eticheta
  "indisponibil"? (Propunere: apare gri cu eticheta — clientul nu crede că
  meniul e alt meniu.)
- **Q5 — Prețul topping-urilor:** Un topping extra costă la fel la toate
  mărimile de pizza, sau diferă (ex: mozzarella extra la 30cm vs XXL)? Pe
  site-ul vechi cum e configurat?
- **Q6 — Ordinea categoriilor:** Păstrăm ordinea de pe site-ul vechi (Pizza
  primele) sau vreți altă ordine?

(Feature-ul rămâne `not-started`; devine `blocked` doar dacă întrebările sunt
încă deschise când începe implementarea. Q3–Q6 nu blochează modelul de date —
blochează doar detalii de afișare și seed.)

## Notes For Future Changes

- Răspunsurile despre topping-uri (Q5) devin critice la feature-ul de coș —
  acolo se calculează prețul final. De răspuns înainte de a începe coșul.
