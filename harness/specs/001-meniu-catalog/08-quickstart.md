# Quickstart: Meniu produse (catalog)

> Authored by: Agent (human executes it at least once before accepting the feature).
> Reads from: `06-contracts/`, `01-spec.md` acceptance criteria.
> Feeds into: the Definition of Done (layer 3 — end-to-end verification).
> Manual verification from the user's perspective. Automated tests prove the
> parts work; this file proves the whole works. It catches the "almost right"
> code that unit tests miss at component boundaries.

## Setup

```bash
# Start the app from a clean state:
./init.sh                # db up, migrations applied, everything green
npm run db:seed          # import the real menu
npm run dev              # http://localhost:3000
```

**Test data:** the seeded Metro dish menu (`data/menu-seed.json`).

## Flow 1: Clientul vede meniul (happy path)

1. Deschide http://localhost:3000 pe un viewport de telefon (DevTools, 375px).
   - **Expected:** categoriile apar în ordinea corectă (Pizza prima); produsele
     au nume, descriere și prețuri "NN,NN lei"; nimic tăiat/ilizibil pe 375px.
2. Găsește o pizza (ex. Quattro Stagioni).
   - **Expected:** apare O dată, cu 3 prețuri de mărime (30cm / 40cm / XXL),
     prețul mic primul.

## Flow 2: Contractul API

1. `curl -s http://localhost:3000/api/menu | head -c 2000`
   - **Expected:** JSON conform `06-contracts/api.md`: `categories[]` cu
     `products[]` cu `variants[]`; prețurile sunt integer bani (ex. `3200`),
     nu stringuri sau zecimale.

## Flow 3: Produs inactiv (failure/boundary path)

1. În DB: `UPDATE products SET active = false WHERE slug = '<un-slug>';`
   apoi reîncarcă pagina și re-rulează curl-ul.
   - **Expected:** produsul nu mai apare nici în pagină, nici în API.
2. Revert: `UPDATE products SET active = true WHERE slug = '<un-slug>';`

## Flow 4: Seed idempotent

1. `npm run db:seed && npm run db:seed`, apoi reîncarcă pagina.
   - **Expected:** niciun produs dublat; numărul de produse identic cu înainte.

## Maintenance Note

When `06-contracts/` changes, update these flows in the same session. A stale
quickstart silently verifies the wrong behavior.
