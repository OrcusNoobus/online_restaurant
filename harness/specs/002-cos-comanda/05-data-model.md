# Data Model: Coș și plasare comandă

> Authored by: Agent (human approves; contracts and code must match this file).
> Reads from: `01-spec.md`, `02-clarify.md`, `04-plan.md`.
> Feeds into: `06-contracts/`, `07-tasks.md`, the code.
> Single source of truth for entities, fields, rules, and lifecycle.
> If the code and this file disagree, one of them is a bug.

Extends the feat-002 menu model (`harness/specs/001-meniu-catalog/05-data-model.md`).
Unchanged entities are not repeated here.

## Changed Entity: ToppingGroup (extended)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `required` | boolean | yes | false | true → the cart cannot contain the product without a selection from this group (Ambalaj, Garanție SGR) |
| `displayType` | text | yes | 'checkbox' | 'radio' (exactly one) \| 'checkbox' (zero or more) |
| `sortOrder` | integer | yes | 0 | display order in the options sheet |

`required = true` implies `displayType = 'radio'` in current data; not
enforced by constraint — the service enforces "≥ 1 selection" for required
groups regardless of display type.

## Changed Entity: Topping (extended)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `sgrDepositBani` | integer | yes | 0 | ≥ 0. Added to the order's SGR total per selected unit; NOT part of the subtotal. 50 for "Garanție SGR" (whose price becomes 0 at seed) and for drink add-ons (02-clarify.md Q15 proposal) |

## Changed Entity: ProductVariant (constraint added)

- New unique constraint `(productId, name)` NULLS NOT DISTINCT — the seed
  upsert key (03-research.md D4). Variant ids are STABLE from this feature
  on; order lines reference them with ON DELETE RESTRICT.

## Entity: DeliveryZone

One deliverable locality with its fee and free-delivery threshold
(02-clarify.md Q8/Q9). Seeded from `data/delivery-zones.json`.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `slug` | text | yes | — | unique (`santana-de-mures`) |
| `name` | text | yes | — | display, full diacritics ("Sâncraiu de Mureș") |
| `feeBani` | integer | yes | — | ≥ 0; charged only below the threshold |
| `freeFromBani` | integer | yes | — | ≥ 0; (subtotal + SGR) ≥ this → fee = 0 |
| `sortOrder` | integer | yes | 0 | |
| `active` | boolean | yes | true | inactive → not offered at checkout |

## Entity: Order

One placed order. Created only by `placeOrder()`; status transitions belong
to feat-007.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | displayed as the order number `#id` (03-research.md D7) |
| `mode` | enum `order_mode` | yes | — | 'delivery' \| 'pickup' |
| `status` | enum `order_status` | yes | 'new' | 'new' \| 'accepted' \| 'in_delivery' \| 'completed' \| 'canceled' |
| `customerFirstName` | text | yes | — | |
| `customerLastName` | text | yes | — | |
| `phone` | text | yes | — | validated RO mobile/landline, normalized +40 (Q12) |
| `email` | text | no | null | optional (Q12) |
| `zoneId` | integer FK → DeliveryZone | no | null | REQUIRED when mode='delivery' (CHECK); RESTRICT on delete |
| `addressStreet` | text | no | null | REQUIRED when mode='delivery' (CHECK) |
| `notes` | text | no | null | customer comments |
| `scheduledFor` | timestamptz | no | null | null = ASAP; else same-day within hours (Q16) |
| `estimateMinutes` | integer | no | null | quoted estimate for ASAP orders (delivery 60; pickup 15/25) |
| `paymentMethod` | enum `payment_method` | yes | — | 'cash' \| 'card_delivery' \| 'card_restaurant'; allowed set depends on mode (Q11) |
| `subtotalBani` | integer | yes | — | ≥ 0; items incl. options, excl. SGR |
| `sgrBani` | integer | yes | 0 | ≥ 0; sum of option `sgrDepositBani` × qty |
| `deliveryFeeBani` | integer | yes | 0 | ≥ 0; 0 for pickup or at/above threshold |
| `totalBani` | integer | yes | — | CHECK: = subtotal + sgr + deliveryFee, > 0 |
| `termsAcceptedAt` | timestamptz | yes | — | consent timestamp (Q14) |
| `clientIp` | text | no | null | from request headers (Q14) |
| `createdAt` | timestamptz | yes | now() | |

## Entity: OrderItem

One cart line, with name/price snapshots — the menu may change later, the
order must not.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `orderId` | integer FK → Order | yes | — | CASCADE |
| `productId` | integer FK → Product | yes | — | RESTRICT |
| `variantId` | integer FK → ProductVariant | yes | — | RESTRICT |
| `productName` | text | yes | — | snapshot |
| `variantName` | text | no | null | snapshot ("30 cm"; null single-size) |
| `unitPriceBani` | integer | yes | — | > 0; variant price snapshot |
| `quantity` | integer | yes | — | > 0 |
| `lineTotalBani` | integer | yes | — | (unitPrice + Σ option price + Σ option sgr) × quantity |

## Entity: OrderItemOption

One selected option (topping/packaging/SGR/drink add-on) on one order line.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `orderItemId` | integer FK → OrderItem | yes | — | CASCADE |
| `toppingId` | integer FK → Topping | yes | — | RESTRICT |
| `groupName` | text | yes | — | snapshot ("Ambalaj") |
| `toppingName` | text | yes | — | snapshot |
| `priceBani` | integer | yes | — | ≥ 0; per unit, size-resolved snapshot |
| `sgrDepositBani` | integer | yes | 0 | ≥ 0; per unit snapshot |

### Ownership Rules

- Orders belong to the restaurant; there are no user accounts in v1. The
  customer's only handle on an order is the confirmation screen (`#id`).
- Personal data on orders (name, phone, email, address, IP) is collected with
  the T&C/GDPR consent checkbox (placeholder pages in v1 — Q14).

### Validation Rules

- Every money field is a non-negative safe integer in bani; `totalBani` CHECK
  enforces the sum; quantities > 0.
- Delivery orders MUST have `zoneId` + `addressStreet` (DB CHECK + zod);
  pickup orders MUST NOT be charged a delivery fee.
- `paymentMethod` allowed per mode: delivery → cash | card_delivery;
  pickup → cash | card_restaurant (service-enforced, tested).
- Required topping groups of the product must each have ≥ 1 selected option;
  selected toppings must belong to groups attached to the product; option
  prices resolve by the chosen variant's `name` (feat-002 ToppingPrice rule).
- Schedule: orders placeable only 11:00–22:30 Europe/Bucharest; `scheduledFor`
  same-day, ≥ max(now + mode estimate, 11:30), ≤ 22:30 (Q10/Q16).

### Lifecycle

- **Initial state:** `status = 'new'`, timestamps set at insert, all
  snapshots frozen.
- **Allowed transitions (defined now, executed by feat-007):**
  new → accepted → in_delivery → completed; any non-final → canceled.
  feat-006 performs NO transitions.
- **Not supported in v1:** editing or deleting an order after placement;
  deleting products/variants/toppings/zones referenced by orders (RESTRICT —
  deactivate instead).
