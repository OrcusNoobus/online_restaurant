# Data Model: Panou admin — produse și comenzi

> Authored by: Agent (human approves; contracts and code must match this file).
> Reads from: `01-spec.md`, `02-clarify.md`, `04-plan.md`.
> Feeds into: `06-contracts/`, `07-tasks.md`, the code.
> Single source of truth for entities, fields, rules, and lifecycle.
> If the code and this file disagree, one of them is a bug.

Extends the feat-002 menu model and the feat-006 order model
(`harness/specs/001-meniu-catalog/05-data-model.md`,
`harness/specs/002-cos-comanda/05-data-model.md`). Unchanged entities are not
repeated here.

## Entity: StaffUser

Restaurant staff account (02-clarify Q1/Q2/Q14). Created only by
`scripts/create-staff-user.ts` at install — no signup, no management UI in v1.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `username` | text | yes | — | unique, case-insensitive (stored lowercase) |
| `displayName` | text | yes | — | shown in the panel header and on status events |
| `passwordHash` | text | yes | — | scrypt, format `scrypt:N:r:p:salt:hash` (base64url); NEVER plaintext |
| `role` | enum `staff_role` | yes | — | `'admin'` \| `'staff'` (Q14 matrix) |
| `active` | boolean | yes | true | false → login refused, existing sessions invalid |
| `createdAt` | timestamptz | yes | now() | |

## Entity: StaffSession

One logged-in device (03-research D1). Opaque token lives only in the
httpOnly cookie; the DB stores its SHA-256, so a DB leak yields no usable
tokens.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `tokenHash` | text | yes | — | unique; SHA-256 (base64url) of the 32-byte random cookie token |
| `staffUserId` | integer FK → StaffUser | yes | — | CASCADE — deleting a user kills its sessions |
| `expiresAt` | timestamptz | yes | — | rolling: extended to now + 7 days on authenticated use |
| `createdAt` | timestamptz | yes | now() | |
| `lastUsedAt` | timestamptz | yes | now() | rolling-renewal bookkeeping |

Expired rows are deleted opportunistically on login and on failed lookups.

## Entity: OrderStatusEvent

Journal of every status change (03-research D4). `orders.status` remains the
authoritative current state; events are history, attribution, cancel reasons
and the undo source.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `orderId` | integer FK → Order | yes | — | CASCADE |
| `fromStatus` | enum `order_status` | yes | — | |
| `toStatus` | enum `order_status` | yes | — | |
| `reason` | text | no | null | REQUIRED when `toStatus='canceled'` (service-enforced, Q15) |
| `staffUserId` | integer FK → StaffUser | yes | — | RESTRICT — who pressed it |
| `createdAt` | timestamptz | yes | now() | |

## Entity: RestaurantSettings (single row)

Live schedule/estimate configuration (03-research D6) + the seed-ownership
flag (D7). Exactly one row, `id = 1` (CHECK). Created by migration 0004 from
the current `src/lib/restaurant-config.ts` constants.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | integer PK | yes | 1 | CHECK `id = 1` |
| `openMinutes` | integer | yes | 660 | minutes after local midnight (11:00) |
| `closeMinutes` | integer | yes | 1350 | 22:30; CHECK `open < close`, both 0–1440 |
| `earliestFulfillmentMinutes` | integer | yes | 690 | 11:30; CHECK `≥ openMinutes` |
| `deliveryEstimateMinutes` | integer | yes | 60 | default quoted at placement; CHECK > 0 |
| `pickupEstimateOptionsMinutes` | integer[] | yes | {15,25} | non-empty, each > 0 (zod; array CHECK is app-level) |
| `catalogOwnedByAdminSince` | timestamptz | no | null | null = seed may write catalog; set by the FIRST admin mutation of catalog/zones/settings; seed then refuses (SEED_FORCE=1 resets) |
| `updatedAt` | timestamptz | yes | now() | |

Timezone (`Europe/Bucharest`) and restaurant address/phone stay in
`src/lib/restaurant-config.ts` — not editable from the panel (Q10 scope).

## Changed Entity: Order (enum extended)

- `order_status` gains `'ready_for_pickup'` (Q5). Full set:
  `new | accepted | in_delivery | ready_for_pickup | completed | canceled`.
- `estimateMinutes` (existing field) is now writable by the dispatcher at
  acceptance (Q6); it remains the ONLY mutable business field on an order —
  snapshots, totals, customer data are frozen forever.

## Changed Entity: Product (extended)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `ingredients` | text | no | null | free text (Q7, 03-research D8); shown in the options sheet when present |
| `allergens` | text | no | null | free text; shown in the options sheet when present |

## Changed Entity: ProductVariant (extended)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `active` | boolean | yes | true | NEW — availability per size (spec: produs/mărime/topping). Menu payload omits inactive variants; pricing rejects them with the existing inactive reason codes |

## Ownership & Access Rules (Q14 matrix)

| Operation | staff | admin |
|---|---|---|
| View orders, day totals, detail | ✓ | ✓ |
| Status transitions, cancel (reason), undo, estimate at accept | ✓ | ✓ |
| Toggle `active` on product / variant / topping | ✓ | ✓ |
| Edit prices (variant, topping prices), names, descriptions, ingredients, allergens | — | ✓ |
| Create products, categories | — | ✓ |
| Zones: create / edit fee & threshold / deactivate | — | ✓ |
| Settings (schedule, estimates) | — | ✓ |

Enforced server-side in route-handler guards + per-role zod schemas; the UI
merely hides what the role cannot do.

## Validation Rules

- Transition validity comes from the pure graph in `src/lib/order-status.ts`
  (per mode — see Lifecycle); invalid → 422, never a DB write.
- `reason` required iff transitioning to `canceled`; stored on the event.
- `estimateMinutes` may be set only on the transition into `accepted`
  (integer > 0); otherwise 422.
- Category/product names non-empty; new products need ≥ 1 variant with
  price > 0 bani; slugs generated server-side, unique.
- Money stays integer bani ≥ 0 everywhere (existing CHECKs apply to new
  writes); settings CHECKs as in the table above.
- Zod at every `/api/admin/*` boundary; staff-role PATCH schemas accept
  `{active}` and nothing else.

## Lifecycle

- **Delivery order:** `new → accepted → in_delivery → completed`
- **Pickup order:** `new → accepted → ready_for_pickup → completed`
- **Cancel:** from any non-final state (`new`, `accepted`, `in_delivery`,
  `ready_for_pickup`) → `canceled`, reason required.
- **Undo (Q15):** one step back — revert to the latest event's `fromStatus`,
  recorded as a new compensating event (history is append-only). Works for
  cancel too. No undo when the order has no events.
- **Final states:** `completed`, `canceled` — no forward transitions out;
  only undo of the step that entered them.
- Every transition = one transaction: `orders.status` update (+ estimate at
  accept) + event insert.
- Sessions: created at login, rolling 7-day expiry, deleted at logout /
  user deactivation; expired rows swept opportunistically.
