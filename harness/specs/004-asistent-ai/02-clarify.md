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

(în așteptare — vezi Open Questions)

## Open Questions

### Q1: Livrăm totul odată sau în etape (sub-feature-uri)?

Feature-list-ul anticipează spargerea în sub-feature-uri. Variante:
(a) un singur feature: Q&A meniu + comandă prin chat, live împreună;
(b) etapizat: 008a doar Q&A meniu (live mai devreme, risc mic), apoi 008b
comanda prin conversație. Recomandarea agentului: (b) — Q&A e valoros
singur și validează costurile/comportamentul înainte să dăm AI-ului voie
să plaseze comenzi.

### Q2: Furnizor LLM, cont și buget lunar

Asistentul are nevoie de un API plătit (recomandare: Anthropic Claude —
tool-calling matur; modelul exact e decizie tehnică la research). Cine
face contul și plata (proprietar / dezvoltator)? Există un plafon lunar
acceptat (ordin de mărime: la trafic mic, zeci de lei/lună; limită hard
configurabilă)? Peste plafon, chat-ul se oprește politicos, magazinul
web nu e afectat.

### Q3: În ce limbi răspunde asistentul?

Doar română? Sau și maghiară (zona Mureș are mulți vorbitori) și/sau
engleză? Meniul e stocat în română — asistentul poate conversa în alte
limbi păstrând denumirile de produse în română.

### Q4: Cum se finalizează comanda prin chat?

(a) totul în conversație: asistentul cere adresă/telefon/mod în chat și
plasează comanda direct; (b) hibrid: asistentul construiește coșul, apoi
predă clientul către pagina de checkout existentă (datele deja validate
acolo). Recomandarea agentului: (a) cap-coadă în chat — ăsta e sensul
feature-ului și pregătește feat-009 (pe WhatsApp nu există checkout page);
(b) rămâne fallback UX („preferi să termini în site?").

### Q5: Confirmarea explicită înainte de plasare

Propunere de default: sumar complet (produse, cantități, total cu SGR +
taxă, mod + adresă, estimare) + confirmare explicită („da, plasează").
Fără confirmare, nimic nu se plasează. De confirmat.

### Q6: Comportamentul în afara orarului

Când restaurantul e închis: (a) chat-ul răspunde la întrebări de meniu
dar refuză plasarea, oferind programarea pentru orele de deschidere
(checkout-ul web suportă deja ora programată); (b) chat-ul e complet
indisponibil. Recomandarea agentului: (a) cu ofertă de programare.

### Q7: Formularea pentru alergii

Propunere de default: asistentul citează doar alergenii introduși în
panou; dacă produsul nu are date, spune explicit că nu are informația;
în ambele cazuri adaugă recomandarea de a suna restaurantul pentru
alergii serioase. De confirmat formularea (răspundere).

### Q8: Plasare în UI și istoric per dispozitiv

Propunere de default: buton flotant de chat pe paginile shop-ului (nu pe
/admin, nu în checkout-ul deja început), istoric păstrat per dispozitiv
cât durează sesiunea de browsing (revenirea după închiderea tab-ului
pornește conversație nouă). De confirmat.

### Q9: Stocăm conversațiile pe server?

(a) da — proprietarul le poate revedea (ce întreabă clienții, unde se
blochează), retenție limitată (ex. 30 zile), menționat în politica de
confidențialitate; (b) nu — doar comanda rezultată rămâne, conversația e
efemeră. Recomandarea agentului: (a) cu retenție scurtă — feedback-ul
real e singurul mod de a îmbunătăți asistentul.

### Q10: Limite de utilizare (cost/abuz)

Propunere de default: limită de mesaje per conversație și per IP/zi
(valorile exacte la plan), lungime maximă de mesaj; peste limită, mesaj
politicos + numărul de telefon. De confirmat principiul.

### Q11: Coșul din chat e același cu coșul site-ului?

(a) da — ce adaugă asistentul se vede în coșul normal al site-ului
(clientul poate verifica/edita vizual); (b) separat — conversația își
ține comanda proprie până la plasare. Recomandarea agentului: (a) pentru
transparență pe site; pe canalele viitoare (feat-009) va fi oricum (b).

### Q12: „Unde e comanda mea?" prin chat

Draft-ul de spec o lasă out of scope în v1 (răspuns politicos: sunați
restaurantul). De confirmat că e acceptabil pentru v1.

## Notes

- Serviciile pe care se sprijină asistentul există și sunt testate:
  meniu (feat-002), cotație + plasare comandă (feat-006), orar din DB
  (feat-007). Asistentul nu introduce reguli de business noi.
- Decizia channel-agnostic core (DECISIONS.md 2026-07-04) a fost luată
  exact pentru acest feature; contractele din 002/006-contracts sunt
  scrise pentru consumatori non-browser.
