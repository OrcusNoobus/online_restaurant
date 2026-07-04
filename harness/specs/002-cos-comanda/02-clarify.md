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

**Answer:** Ambele. Checkout-ul are două moduri: livrare (adresă + taxă +
minim pe zonă) și ridicare personală (fără adresă, fără taxă), ca pe site-ul
vechi. Răspuns de proprietar, 2026-07-04.

### Q2: Cum se calculează taxa de livrare?

**Answer:** Taxă pe zonă — localitățile mai îndepărtate au taxă mai mare.
Livrare gratuită peste un anumit prag, valabil pentru toate localitățile.
Comanda minimă diferă pe zonă. Valorile concrete: vezi Q8 (deschisă).
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
validată pe orarul restaurantului. Răspuns de proprietar, 2026-07-04.

### Q6: Cum află restaurantul de o comandă nouă înainte de panoul admin?

**Answer:** Doar în baza de date — magazinul nu intră live până nu există
feat-007. Fără email/SMS în feat-006. Răspuns de proprietar, 2026-07-04.

### Q7: SGR și grupul „Ambalaj"

**Answer:** Moștenite din feat-002 (harness/specs/001-meniu-catalog/02-clarify.md
Q7 + Notes): prețurile băuturilor sunt prețuri de bază, SGR 0,50 lei/recipient
se adaugă la coș și se afișează separat; grupul „Ambalaj" e obligatoriu, cu
preț per categorie/mărime (`toppingGroups.required` în seed). Site-ul vechi
afișa SGR inclus în linia produsului (Heineken „11,50") — noi îl afișăm separat,
conform deciziei proprietarului din 2026-07-04.

## Open Questions

### Q8: Tabelul concret al zonelor de livrare

În ce localități livrați și, pentru fiecare: taxa de livrare (lei) și comanda
minimă (lei)? Care este pragul de livrare gratuită (aceeași valoare pentru
toate zonele)? Exemplu de format așteptat:

| Localitate | Taxă livrare | Comandă minimă |
|---|---|---|
| Sântana de Mureș | ? | ? |
| Târgu Mureș | ? | ? |
| ... | ? | ? |

Prag livrare gratuită: ? lei.

### Q9: Pragul de livrare gratuită se raportează la ce sumă?

Subtotalul produselor (fără SGR și fără taxă), sau totalul cu SGR? Propunerea
agentului: subtotalul produselor (inclusiv ambalaj, fără SGR).

### Q10: Orarul restaurantului

Programul pe zile (necesare pentru validarea programării și pentru „deschis
acum"). Există zile închise? Timpul estimat pentru ASAP e fix (site-ul vechi
afișa 25 min) sau diferă pe livrare vs. ridicare?

### Q11: Metodele de plată pe moduri

Confirmați maparea (după site-ul vechi): livrare → numerar sau card la
livrare; ridicare personală → numerar sau card la restaurant. Corect?

### Q12: Email-ul la checkout

Site-ul vechi cere e-mail. Îl păstrăm? Propunerea agentului: câmp opțional în
v1 (nu trimitem email-uri încă — devine util la feat-010 conturi).

### Q13: Comanda minimă se aplică și la ridicare personală?

Propunerea agentului: nu — minimul acoperă costul deplasării, ridicarea nu
are acest cost.

### Q14: Termeni și Condiții / protecția datelor

Site-ul vechi cere acordul la plasare. Avem nevoie în v1 de paginile propriu-
zise (conținut legal furnizat de proprietar) sau doar de bifă + pagini
placeholder până le redactați? Notă: înregistrarea IP-ului „pentru prevenirea
fraudelor" de pe site-ul vechi — o replicăm?

## Notes

- Ids-urile variantelor trebuie să devină stabile înainte ca liniile de comandă
  să le refere — regula replace-variants din `scripts/seed.ts` se revizuiește
  în planul acestui feature (notat la feat-002).
- Proprietarul a plasat o comandă de probă pe site-ul vechi (2026-07-04) —
  structura checkout-ului legacy e păstrată în interviul din sesiune.
