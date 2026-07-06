# Debug: Conturi clienți și login social

> Authored by: Agent (append-only during the feature; summarized at close).
> Reads from: quickstart runs, test failures, live behavior.
> Feeds into: `harness/DEV_LOG.md`, future features touching auth/orders.
> Findings from executing `08-quickstart.md` (2026-07-06). No code changes
> came out of the run — both entries are recorded behaviors, not bugs.

## Observația 1 — telefonul cu spații e respins (comportament moștenit, nu regresie)

- **Văzut la:** Flow 1, primul submit al formularului „Creează cont" cu
  telefonul `0740 000 111` → `400 validation` (`telefon invalid`), UI-ul
  arată mesajul generic „Verifică datele: …".
- **Cauza:** `phoneSchema` (src/lib/order-schemas.ts:27, contract
  feat-006) face `.trim()` dar regex-ul `^(\+40|0)(2|3|7)\d{8}$` nu
  acceptă spații interioare. Formularul de cont refolosește schema
  verbatim (06-contracts), deci comportamentul e IDENTIC cu checkout-ul
  — nicio diferență logat vs guest.
- **Decizie:** nu se schimbă nimic în feat-010 (contractul feat-006 e
  aprobat; consecvența între formulare e mai valoroasă decât o excepție
  locală). Dacă proprietarul vrea toleranță la spații/liniuțe, e o
  schimbare de contract feat-006 (schema + toate formularele + testele),
  de decis separat.

## Observația 2 — OrdersList continuă polling-ul cu 401 după expirarea sesiunii

- **Văzut la:** network log — o pagină `/cont` rămasă deschisă după ce
  sesiunea/contul a dispărut server-side emite `GET /api/account/orders`
  → 401 la fiecare 15s până la navigare.
- **Cauza:** decizie deliberată, comentată în
  `src/components/account/OrdersList.tsx` — la răspuns non-OK păstrează
  ultimul snapshot și reîncearcă la tick-ul următor (sesiunile rolling de
  30 de zile fac expirarea mid-view rarisimă; un failure tranzitoriu nu
  trebuie să golească lista).
- **Cost real:** un request/15s per tab abandonat, răspuns 401 fără
  corp. Acceptat pentru v1; dacă devine zgomot în producție, oprirea
  polling-ului după N × 401 consecutive e o schimbare de 3 rânduri.

## Lecția pentru feature-urile următoare

- Backfill-ul first-claim + ștampilarea la insert au făcut verificarea
  manuală banală: „a cui e comanda" are UN singur răspuns stabil în DB
  (`orders.customer_id`), vizibil cu un SELECT — față de matching la
  citire, unde evidența ar fi fost o interogare cu OR-uri. Confirmă D4
  (03-research); același model merită păstrat pentru verificarea SMS
  (feature-ul amânat Q5) și pentru feat-012 (plăți legate de comandă).
