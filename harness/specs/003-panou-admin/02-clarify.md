# Clarify: Panou admin — produse și comenzi

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

(none yet — interview pending)

## Open Questions

### Q1: Cine folosește panoul și câte conturi?

Un singur cont comun pentru tot personalul, sau cont separat pentru fiecare
angajat? Există roluri diferite (ex: proprietar/admin care editează prețuri
vs. dispecer care lucrează doar cu comenzile), sau toată lumea poate face tot?

### Q2: Cum arată autentificarea în v1?

Propunere simplă: email/utilizator + parolă, conturile create de noi la
instalare (fără self-signup, fără reset de parolă prin email în v1 — parola
uitată o rezolvă proprietarul cu noi). E suficient? Cât ține o sesiune
(o zi de lucru? o săptămână — „ține-mă minte"?)?

### Q3: Pe ce dispozitiv se lucrează cu panoul?

Telefon, tabletă sau laptop/PC la casă? Contează pentru cum proiectăm lista
de comenzi (mobile-first ca shop-ul, sau ecran lat cu tabel dens).

### Q4: Ce înseamnă „în timp real" pentru comenzile noi?

Propunere v1: lista se împrospătează singură la câteva secunde și comenzile
noi apar evidențiat + sunet de notificare cât timp există comenzi „noi"
nepreluate. Ajunge? Sau trebuie ceva mai insistent (sunet repetat până le
preia cineva, ca un sonerie)? Pe site-ul vechi (TastyIgniter) cum vă anunța?

### Q5: Fluxul exact al stărilor comenzii

Stările există deja în sistem: nouă → preluată → în livrare → finalizată,
plus anulată.
- La **ridicare personală** nu există „în livrare" — sărim direct
  preluată → finalizată, sau vreți o stare vizibilă „gata de ridicare"?
- **Anularea**: permisă din orice stare (inclusiv „în livrare")? Cere motiv
  obligatoriu (ex: „client nu răspunde", „adresă greșită")? Clientul e anunțat
  telefonic de voi — corect?
- Se poate **da înapoi** o stare (ex: am apăsat greșit „finalizată")?

### Q6: Reglarea timpului de livrare de către dispecer

Din interviul feat-006 (Q10): aglomerat 70–80 min, liber 30–40 min. Reglajul
e **global** (o singură valoare afișată tuturor clienților în checkout, pe
care dispecerul o schimbă când se aglomerează), sau **per comandă** (la
preluare dispecerul spune „la tine ajunge în 45 min"), sau ambele? Pentru
ridicarea personală (15/25 min) se reglează ceva?

### Q7: Ce înseamnă „editez produse" în v1?

Propunere v1: modificare preț + activare/dezactivare pentru produse, mărimi
și topping-uri, plus editare nume/descriere la produse existente. **Adăugarea**
de produse noi și categorii noi rămâne pe mai târziu (azi meniul vine din
importul de pe site-ul vechi). E de ajuns pentru operarea zilnică, sau aveți
nevoie să adăugați produse noi din panou încă de la început?

### Q8: După lansarea panoului, meniul se editează DOAR din panou?

Până acum meniul vine dintr-un fișier de import (seed) pe care îl controlăm
noi. Din momentul în care editați prețuri/disponibilitate din panou, baza de
date devine sursa adevărului și importul nu mai are voie să suprascrie
modificările voastre. Confirmați că de la feat-007 încolo modificările de
meniu se fac exclusiv din panou (schimbările mari, ex. meniu nou de sezon,
le facem tot noi, coordonat)?

### Q9: Zonele de livrare din panou

Editarea taxei și a pragului de livrare gratuită pentru localitățile existente
e clară. Trebuie în v1 și adăugarea de localități noi sau
dezactivarea/ștergerea uneia existentă?

### Q10: Orarul și timpii de ridicare — editabili din panou?

Orarul (11:00–22:30, deschis zilnic) și opțiunile de ridicare (15/25 min) sunt
acum fixe în configurație. Le facem editabile din panou în v1 (ex: închis de
sărbători, alt orar), sau rămân fixe și le schimbăm noi la cerere?

### Q11: Cât istoric de comenzi se vede în panou?

Propunere v1: implicit ziua curentă (asta e ecranul de lucru), cu filtre pe
stare și posibilitatea de a răsfoi zilele trecute. Fără rapoarte/totaluri în
v1 (vin mai târziu). E ok, sau vă trebuie de la început măcar un total al
zilei (câte comenzi, ce sumă)?

### Q12: Trebuie tipărit ceva la comandă nouă?

Pe fluxul actual (site-ul vechi / telefon), comanda se scrie sau se tipărește
pentru bucătărie? Panoul v1 afișează comanda pe ecran; o variantă „printează
comanda" (pe imprimantă obișnuită, din browser) e ușor de adăugat — imprimante
termice de bonuri NU intră în v1. Aveți nevoie de tipărire?

### Q13: De unde se accesează panoul?

Doar din restaurant, sau și de acasă / de pe drum (telefonul proprietarului)?
Panoul va fi pe același site (ex: royalfood.ro/admin), protejat de login —
e suficient, sau vreți restricții suplimentare de acces?

## Notes

- Enum-ul de stări și `estimate_minutes` per comandă există deja în DB din
  feat-006 (003-research D6) — feat-007 doar execută tranzițiile.
- Dezactivarea (soft hide) e deja respectată de meniu și de validarea
  coșului/comenzii — panoul doar o comută.
- Decizia „magazinul nu intră live înainte de feat-007" vine din
  002-cos-comanda/02-clarify.md Q6.
