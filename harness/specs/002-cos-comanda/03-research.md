# Research: Coș și plasare comandă

> Authored by: Agent (human approves each decision).
> Reads from: `01-spec.md`, `02-clarify.md`.
> Feeds into: `04-plan.md`; durable decisions get promoted to `harness/docs/DECISIONS.md`.
> Records feature-level technical choices and WHY they were made, so no later
> session quietly re-decides them.

## Decision 1: Cart state lives on the client; the server stays stateless

- **Options considered:**
  - A: DB-backed cart with an anonymous session cookie (server owns the cart).
  - B: Client-held cart (localStorage) + stateless server services: a quote
    endpoint that prices any submitted selection, and a place-order endpoint
    that re-validates and re-prices everything.
  - C: Server-side in-memory session cart.
- **Decision:** B — client-held selection, stateless quote + place services.
- **Reason:** DECISIONS.md (2026-07-04) makes ordering channel-agnostic: the
  web UI, the future chat assistant and WhatsApp/Telegram adapters each hold
  their own "what the customer picked" state and call the SAME two services.
  A DB cart adds garbage collection, merge semantics and a session concept
  none of the channels need. Security is unchanged either way: the server
  never trusts client prices — it re-resolves every id against the database
  on every quote and on placement (ARCHITECTURE.md hard constraint). C dies
  on every deploy/restart.
- **Consequences:** the cart survives refresh via localStorage (spec NFR);
  an item whose product/variant/topping has meanwhile been deactivated is
  reported by the quote endpoint with a machine-readable reason and removed
  from the client cart with a visible message.

## Decision 2: Delivery zones are a database table, seeded from a committed JSON

- **Options considered:**
  - A: Constants in `src/lib` (no DB).
  - B: `delivery_zones` table seeded idempotently from `data/delivery-zones.json`.
- **Decision:** B.
- **Reason:** Zones carry money values that the pricing service must join
  against on the server, orders must reference the zone they were priced for
  (FK, auditability), and feat-007 will edit fees/thresholds from the admin —
  a table now avoids a migration-with-meaning later. The committed JSON keeps
  the values reviewable by the owner exactly like `menu-seed.json`.
- **Values (02-clarify.md Q8):** fee applies only BELOW the zone's
  free-delivery threshold; at/above it delivery is free. No hard minimum —
  orders below threshold are allowed and pay the fee.

## Decision 3: Opening hours & time estimates — typed constants in `src/lib`, v1

- **Options considered:**
  - A: A `settings` table in the DB from day one.
  - B: One typed config module `src/lib/restaurant-config.ts` (hours,
    earliest-fulfillment 11:30, delivery estimate 60 min, pickup options
    15/25 min, timezone), promoted to DB storage when feat-007 gives the
    dispatcher a UI to change estimates (02-clarify.md Q10 note).
- **Decision:** B.
- **Reason:** The schedule is constant (daily 11:00–22:30, no closed days) and
  nobody can edit a DB row before the admin panel exists — a table now is
  speculative scope. The spec's NFR only demands a single configurable place.
  All schedule math is pure (input: now + config) → unit-testable without DB.
- **Timezone rule:** all schedule validation happens in `Europe/Bucharest`;
  timestamps are stored as `timestamptz`. Server clock ≠ restaurant clock is
  a classic prod bug — the config module owns the conversion.

## Decision 4: Variant ids become stable — natural-key upsert replaces delete-and-recreate

- **Options considered:**
  - A: Keep replacing variants on every seed (status quo from feat-002).
  - B: Unique `(product_id, name)` (NULLS NOT DISTINCT) + seed upserts by that
    key: update price/sort on match, insert new; leftover variants are deleted
    only if unreferenced — the `orders → variants` RESTRICT FK turns a silent
    data loss into a loud seed error a human must resolve.
- **Decision:** B — this closes the debt noted in `scripts/seed.ts` at feat-002.
- **Reason:** `order_items.variant_id` references variants; re-seeding must
  never re-point history. Size names ("30 cm") are stable in practice, so the
  natural key holds.

## Decision 5: SGR flows through the generic option mechanism via `sgrDepositBani`

- **Options considered:**
  - A: Special-case "SGR" logic in the pricing service (match by group name).
  - B: A single `sgr_deposit_bani` column on toppings. Every selected option
    contributes `priceBani` to the subtotal and `sgrDepositBani` to the SGR
    total. Seed transform: the "Garanție SGR" topping (already a required
    radio group on the 9 drink products) becomes price 0 + deposit 50; the 8
    drink add-ons in "Adaugă băutură" get deposit 50 (02-clarify.md Q15
    proposal — reversible from seed data alone if the owner declines).
- **Decision:** B.
- **Reason:** One uniform rule, no name-matching magic, and the SGR total is
  cleanly identifiable for the separate display line the owner requires
  (Q7/Q9 — the free-delivery threshold compares against subtotal + SGR).
  `data/menu-seed.json` stays an untouched legacy snapshot; the transform
  lives in the seed script.

## Decision 6: Order statuses and payment methods are enums defined now

- **Decision:** `order_status`: `new → accepted → in_delivery → completed`,
  plus `canceled` (English codes in DB/code, Romanian at the display edge —
  same rule as everywhere). feat-006 only ever creates `new`; transitions
  belong to feat-007 but the enum is defined once, here.
  `payment_method`: `cash`, `card_delivery`, `card_restaurant` — allowed per
  mode (delivery: cash | card_delivery; pickup: cash | card_restaurant),
  per 02-clarify.md Q11. DECISIONS.md already reserves the field for the
  future online payment (feat-012).
- **Reason:** feat-007 renaming statuses later would rewrite order history;
  agreeing on the lifecycle now costs one enum.

## Decision 7: Order number = database id, formatted at display

- **Options considered:** daily sequence ("#42 de azi"), random short code,
  plain serial id.
- **Decision:** plain serial id, displayed as `#123`.
- **Reason:** v1 volume makes ids small and phone-readable; a vanity sequence
  is feat-007 material if the owner ever asks. No extra table, no race.

## Decision 8: API surface — three service-shaped endpoints

- **Decision:** `GET /api/zones` (active zones for checkout), `POST
  /api/cart/quote` (stateless pricing of a submitted selection), `POST
  /api/orders` (validate + re-price + place atomically). `GET /api/menu` is
  extended with each product's topping groups (required/displayType/prices
  per size) so the options UI renders from one fetch.
- **Reason:** exactly the operations the future chat/WhatsApp channels need
  (DECISIONS.md); quote and place share one input schema (`src/lib`), so a
  cart the client assembled is, verbatim, the order payload.
