# Clarify: Conturi clienți și login social

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

### Q1: Ce metode de autentificare intră în v1?

**Answer:** **Email + parolă ȘI login Google (OAuth)** în v1. Facebook și
TikTok rămân cerute (interviul feat-006), dar amânate într-un feature ulterior
— Facebook Login și TikTok Login cer verificare de business + review de app
(săptămâni), pe când Google OAuth se aprobă rapid și email+parolă refolosește
scrypt-ul din feat-007. Conturile de client sunt SEPARATE de cele de personal
(tabel + cookie proprii; clienții nu ating `/admin`). Răspuns de proprietar,
2026-07-06.

### Q2: Ce face contul — doar precompletare, sau și comenzi?

**Answer:** **Precompletare + istoric + status.** Clientul logat vede datele de
livrare precompletate la checkout ȘI lista comenzilor proprii cu statusul lor
curent (live), citite din aceleași date ca panoul de personal, DOAR pentru
comenzile care îi aparțin. Redeschide — exclusiv pentru proprietarul
autentificat al comenzii — ceea ce feat-008 a lăsat telefonic (statusul prin
chat rămâne out of scope). Răspuns de proprietar, 2026-07-06.

### Q3: Legăm comenzile guest anterioare de un cont nou?

**Answer:** **Da, după telefon/email.** La creare cont, comenzile guest cu
același telefon (identificator principal) sau email devin vizibile în istoric.
Vezi Q5 pentru mecanismul de siguranță. Răspuns de proprietar, 2026-07-06.

### Q4: Email tranzacțional (verificare + resetare parolă) în v1?

**Answer:** **Amânat — fără email în v1.** Nicio verificare de email, niciun
reset de parolă prin email. Parola uitată se rezolvă prin login Google sau
telefonic (ca la personal, feat-007). Provider SMTP + secret de email = feature
ulterior. Răspuns de proprietar, 2026-07-06.

### Q5: Cum facem legarea comenzilor guest sigură fără verificare email/SMS?

**Answer:** **Link automat după telefon/email, fără dovadă.** Proprietarul a
ales comoditatea, informat asupra riscului. **Risc acceptat și înregistrat:**
fără verificare, un cont nou creat cu un telefon/email care nu-i aparține poate
vedea istoricul (nume, adresă, comenzi) al altui client. Mitigarea (verificare
email/SMS, sau revendicare cu numărul comenzii) este amânată explicit într-un
feature ulterior. Implementare: legăm în primul rând după **telefon
normalizat** (câmpul cerut oricum la checkout, identificatorul tare pentru acest
business) pentru a reduce, nu elimina, expunerea. Răspuns de proprietar,
2026-07-06.

## Defaults Recorded (proprietarul poate suprascrie)

Alegeri pe care agentul le propune ca implicite rezonabile; dacă proprietarul
nu le contrazice, devin definitive la research/plan.

- **D-a Durata sesiunii:** propunere 30 de zile rolling per dispozitiv (clienții
  se așteaptă să „rămână logați" mai mult decât personalul, care e la 7 zile);
  cookie httpOnly separat de cel de personal. Valoare exactă = decizie tehnică
  la plan.
- **D-b Un singur profil de livrare:** contul reține exact câmpurile de la guest
  checkout (nume, prenume, telefon, email opțional, o adresă + zonă). Agendă cu
  mai multe adrese = feature ulterior.
- **D-c Consimțământ la înregistrare:** acceptarea Termeni & Condiții +
  Protecția datelor la signup (ca `termsAccepted` la checkout); FĂRĂ checkbox de
  marketing (proprietarul nu face marketing — feat-008).
- **D-d GDPR:** ștergerea/exportul datelor de cont prin cerere telefonică/email
  (ca politica actuală); fără UI de self-service în v1. Pagina de
  confidențialitate se actualizează cu secțiunea de cont.
- **D-e Contul Google vs. email existent:** dacă emailul Google (verificat de
  Google) coincide cu un cont email+parolă existent, se leagă de ACELAȘI client
  (evită duplicate). Nuanța „email de parolă neverificat" se tratează la plan
  (Google e sursa de adevăr pentru posesia adresei).
- **D-f Comenzile din cont sunt read-only:** contul afișează statusul, dar nu
  permite modificarea/anularea (corectările rămân telefonice).

## Open Questions (de confirmat înainte sau la research)

Niciuna care blochează research-ul. Dacă proprietarul vrea să schimbe vreun
default de mai sus (în special D-a durata sesiunii și D-b o singură adresă),
se notează aici înainte de plan.
