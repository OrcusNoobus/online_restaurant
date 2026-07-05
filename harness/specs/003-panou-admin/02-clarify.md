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

### Q1: Cine folosește panoul și câte conturi?

**Answer:** Conturi multiple, cu două roluri: **admin** și **angajat**.
Matricea exactă de permisiuni la Q14. Răspuns de proprietar, 2026-07-05.

### Q2: Cum arată autentificarea în v1?

**Answer:** Da — utilizator + parolă, conturile create de noi la instalare;
fără self-signup și fără reset de parolă prin email în v1 (parola uitată se
rezolvă cu noi). Durata sesiunii: proprietarul nu a impus o valoare — default
înregistrat: sesiune de lungă durată per dispozitiv (ordinul zilelor,
propunere 7 zile rolling; valoarea exactă e decizie tehnică la plan).
Răspuns de proprietar, 2026-07-05.

### Q3: Pe ce dispozitiv se lucrează cu panoul?

**Answer:** În mare parte pe PC, dar trebuie să rămână utilizabil și pe alte
device-uri → layout gândit pentru desktop, funcțional și pe mobil (375px).
Răspuns de proprietar, 2026-07-05.

### Q4: Ce înseamnă „în timp real" pentru comenzile noi?

**Answer:** Da — lista se împrospătează singură la câteva secunde; comenzile
noi apar evidențiat, cu **sunet repetat până la preluare** (cât timp există
comenzi „noi" nepreluate). Răspuns de proprietar, 2026-07-05.

### Q5: Fluxul exact al stărilor comenzii

**Answer:** Se adaugă starea **„gata de ridicare"** pentru comenzile cu
ridicare personală. Fluxurile devin:
- Livrare: nouă → preluată → în livrare → finalizată
- Ridicare: nouă → preluată → gata de ridicare → finalizată
- Anularea și corectarea greșelilor: la Q15.
Enum-ul `order_status` din DB se extinde cu `ready_for_pickup` (migrare).
Răspuns de proprietar, 2026-07-05.

### Q6: Reglarea timpului de livrare de către dispecer

**Answer:** **Per comandă, la preluare** — nu există o valoare globală pentru
toți clienții. În cuvintele proprietarului: dacă e de lucru și adresa e
departe, termenul dat e 70–80 min; dacă e liber și aproape, 30–40 min. La
ridicare personală la fel: clientul cere de ex. 15 min, dar la preluare
dispecerul poate seta un termen mai mare (ex. 25 min) dacă e aglomerat.
Concret în v1: la preluarea comenzii dispecerul confirmă sau ajustează
estimarea (`estimate_minutes` există deja pe comandă); clientul e anunțat
telefonic dacă diferă semnificativ de ce a cerut (v1 nu are notificări).
Estimările implicite din checkout (60 min livrare, 15/25 min ridicare) rămân
cele afișate la plasare. Răspuns de proprietar, 2026-07-05.

### Q7: Ce înseamnă „editez produse" în v1?

**Answer:** Mai mult decât propunerea inițială: pe lângă preț +
activare/dezactivare (produs, mărime, topping) și editare nume/descriere,
trebuie și **adăugare de produse și categorii noi**, plus câmpuri de
**ingrediente și alergeni** pe produse. Toate acestea **doar pentru contul de
admin**. Ingredientele/alergenii completați se afișează clientului în shop
(în sheet-ul de opțiuni al produsului). Răspuns de proprietar, 2026-07-05.

### Q8: După lansarea panoului, meniul se editează DOAR din panou?

**Answer:** Da („putem încerca așa"). De la feat-007 încolo baza de date e
sursa adevărului pentru meniu; seed-ul/importul nu mai are voie să suprascrie
modificările făcute din panou (mecanismul de gardă se decide la research).
Răspuns de proprietar, 2026-07-05.

### Q9: Zonele de livrare din panou

**Answer:** Editare taxă/prag **și** adăugare de localități noi +
dezactivare. Răspuns de proprietar, 2026-07-05.

### Q10: Orarul și timpii de ridicare — editabili din panou?

**Answer:** Editabile din panou, **doar contul de admin**. Configurația de
orar/estimări din `src/lib/restaurant-config.ts` se mută în baza de date
(exact scenariul anticipat în comentariul acelui modul).
Răspuns de proprietar, 2026-07-05.

### Q11: Cât istoric de comenzi se vede în panou?

**Answer:** Propunerea acceptată (ziua curentă implicit + filtre pe stare +
răsfoire zile trecute), **plus, minim pentru v1: totalul pe zi**. Default
înregistrat: totalul zilei = număr de comenzi și suma lor pentru comenzile
ne-anulate; anulatele apar numărate separat. Rapoarte peste atât — nu în v1.
Răspuns de proprietar, 2026-07-05.

### Q12: Trebuie tipărit ceva la comandă nouă?

**Answer:** Nu în v1. În viitor va exista o **integrare cu POS** care
printează și trimite comanda către monitoarele din bucătărie — de înregistrat
ca feature viitor la momentul potrivit. Răspuns de proprietar, 2026-07-05.

### Q13: De unde se accesează panoul?

**Answer:** Pe același site (`/admin`), protejat doar de login, accesibil de
oriunde — suficient pentru v1. Răspuns de proprietar, 2026-07-05.

### Q14: Matricea de permisiuni angajat vs. admin

**Answer:** Angajatul (non-admin) lucrează cu **comenzile** (stări, timpi per
comandă) și poate comuta **disponibilitatea** produselor/topping-urilor
(ex: „nu mai avem Pepsi în seara asta"). Restul — prețuri, produse/categorii
noi, nume/descrieri/ingrediente/alergeni, zone, orar — doar admin.
Gestiunea conturilor nu are UI în v1 (conturile se creează la instalare, Q2).
Răspuns de proprietar, 2026-07-05.

### Q15: Anularea și corectarea greșelilor de stare

**Answer:** Anulare permisă din orice stare ne-finală, cu **motiv
obligatoriu** (ex: „clientul nu răspunde"); clientul e anunțat telefonic de
personal. Pentru greșeli de apăsare, starea se poate da **un pas înapoi**
(undo). Răspuns de proprietar, 2026-07-05.

## Open Questions

(none — toate întrebările sunt rezolvate)

## Notes

- Enum-ul de stări și `estimate_minutes` per comandă există din feat-006
  (002 03-research D6) — feat-007 adaugă `ready_for_pickup` și execută
  tranzițiile.
- Dezactivarea (soft hide) e deja respectată de meniu și de validarea
  coșului/comenzii — panoul doar o comută.
- Decizia „magazinul nu intră live înainte de feat-007" vine din
  002-cos-comanda/02-clarify.md Q6.
- Viitor (nu v1), de înregistrat la momentul potrivit: integrare POS cu
  printare + monitoare bucătărie (Q12); notificări către client la
  schimbarea stării; UI de gestiune a conturilor de personal.
