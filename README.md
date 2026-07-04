# Royal Food Delivery

Magazin online cu livrare la domiciliu pentru restaurantul Royal Food Delivery
(Sântana de Mureș). Înlocuiește platforma închiriată Metro dish (TastyIgniter)
cu un magazin propriu, mobile-first: meniu, coș, comandă cu plata la livrare
(v1) și panou de administrare pentru produse și comenzi.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4, PostgreSQL 17 în Docker,
Vitest. O singură aplicație monolit: site clienți + admin + API.

## Pornire rapidă

```bash
./init.sh                    # verificare completă: instalare, DB, migrări, lint, teste, build
npm run db:seed              # importă meniul real (idempotent) — altfel meniul e gol
npm run dev                  # http://localhost:3000
docker compose up -d db      # doar baza de date (Postgres pe localhost:5433)
```

## Pentru agenți și dezvoltatori

Citește `AGENTS.md` — sursa unică de adevăr pentru regulile proiectului.
Starea feature-urilor: `harness/feature-list.json`. Documentație de arhitectură
și decizii: `harness/docs/`.
