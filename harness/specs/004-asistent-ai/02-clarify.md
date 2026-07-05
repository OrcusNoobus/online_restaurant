# Clarify: Asistent AI pe site (chat)

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

### Q1: Livrăm totul odată sau în etape (sub-feature-uri)?

**Answer:** **Într-o singură etapă** — Q&A meniu + comandă prin chat live
împreună; nu se sparge în sub-feature-uri. Proprietarul a decis totodată că
asistentul se construiește pe **API-urile Anthropic** („cred că sunt cele
mai bune modele"). **Amendament (2026-07-05, a doua discuție):**
arhitectura trebuie să fie **model-agnostică** (modelul se schimbă oricând
dintr-o singură linie de configurare, fără modificări de cod) și, în
perspectivă, **provider-agnostică** — asistentul se scrie peste o
interfață de furnizor LLM, Anthropic fiind prima implementare.
Răspuns de proprietar, 2026-07-05.

### Q2: Furnizor LLM, cont și buget lunar

**Answer:** Cont **propriu al proprietarului** la Anthropic (dezvoltatorul
îl ghidează la creare); cheia API stă exclusiv în `.env` pe server.
Plafon mic de pornire (ordin de mărime ~50 lei/lună).
**Amendament (2026-07-05, a doua discuție):** plafonul de cost se
administrează de proprietar **din platforma furnizorului** (spend limit în
consolă), NU se implementează contorizare de buget în cod. Obligația
codului: când API-ul furnizorului e indisponibil (inclusiv plafon atins),
asistentul comunică politicos indisponibilitatea, iar magazinul web nu e
afectat. Limitele anti-abuz din Q10 rămân în cod (ele apără de abuz, nu
de facturare). Răspuns de proprietar, 2026-07-05.

### Q3: În ce limbi răspunde asistentul?

**Answer:** **Română + maghiară + engleză** — asistentul răspunde în limba
în care i se scrie; denumirile produselor rămân în română (meniul e stocat
în română). Răspuns de proprietar, 2026-07-05.

### Q4: Cum se finalizează comanda prin chat?

**Answer:** **Cap-coadă în chat** — asistentul cere datele de
livrare/ridicare în conversație (ca la guest checkout) și plasează comanda
direct, cu confirmarea explicită de la Q5. Pregătește feat-009, unde nu
există pagină de checkout. Răspuns de proprietar, 2026-07-05.

### Q5: Confirmarea explicită înainte de plasare

**Answer:** Default acceptat: sumar complet (produse, cantități, total cu
SGR + taxă, mod + adresă, estimare) + confirmare explicită. Fără
confirmare, nimic nu se plasează. Răspuns de proprietar, 2026-07-05.

### Q6: Comportamentul în afara orarului

**Answer:** Chat-ul **răspunde la întrebări de meniu și oferă programare**:
în afara orarului poate plasa comenzi programate pentru orele de deschidere
(serviciul de comenzi suportă deja ora programată). Plasarea imediată
(ASAP) rămâne blocată de aceleași validări ca în web. Răspuns de
proprietar, 2026-07-05.

### Q7: Formularea pentru alergii

**Answer:** Default acceptat: asistentul citează doar alergenii introduși
în panou; dacă produsul nu are date, spune explicit că nu are informația;
în ambele cazuri recomandă telefonul restaurantului pentru alergii
serioase. Răspuns de proprietar, 2026-07-05.

### Q8: Plasare în UI și istoric per dispozitiv

**Answer:** Default acceptat: buton flotant de chat pe paginile shop-ului
(nu pe /admin, nu în checkout-ul deja început), istoric păstrat per
dispozitiv cât durează sesiunea de browsing; revenirea după închiderea
tab-ului pornește conversație nouă. Răspuns de proprietar, 2026-07-05.

### Q9: Stocăm conversațiile pe server?

**Answer:** **Da, cu retenție 30 de zile** — proprietarul le poate revedea
(ce întreabă clienții, unde se blochează asistentul); ștergere automată
după 30 de zile; menționat în politica de confidențialitate. Răspuns de
proprietar, 2026-07-05.

### Q10: Limite de utilizare (cost/abuz)

**Answer:** Default acceptat: limită de mesaje per conversație și per
IP/zi (valorile exacte la plan), lungime maximă de mesaj; peste limită,
mesaj politicos + numărul de telefon. Se adaugă plafonul lunar de la Q2.
Răspuns de proprietar, 2026-07-05.

### Q11: Coșul din chat e același cu coșul site-ului?

**Answer:** **Da, același coș** — ce adaugă asistentul apare în coșul
normal al site-ului; clientul poate verifica și edita vizual oricând.
(Pe canalele viitoare din feat-009 coșul va fi oricum doar conversațional.)
Răspuns de proprietar, 2026-07-05.

### Q12: „Unde e comanda mea?" prin chat

**Answer:** Confirmat out of scope în v1 — asistentul răspunde politicos
că statusul se află telefonic. De înregistrat ca feature viitor la
momentul potrivit. Răspuns de proprietar, 2026-07-05.

## Open Questions

(none — toate întrebările sunt rezolvate)

## Notes

- Serviciile pe care se sprijină asistentul există și sunt testate:
  meniu (feat-002), cotație + plasare comandă (feat-006), orar din DB
  (feat-007). Asistentul nu introduce reguli de business noi.
- Decizia channel-agnostic core (DECISIONS.md 2026-07-04) a fost luată
  exact pentru acest feature; contractele din 002/006-contracts sunt
  scrise pentru consumatori non-browser.
- Alegerea Anthropic ca furnizor (Q1) e candidat de promovare în
  DECISIONS.md la research, împreună cu mecanismul de plafon (Q2).
- Viitor (nu v1), de înregistrat la momentul potrivit: status comandă
  prin chat (Q12); live-chat cu personalul; canale externe (feat-009).
