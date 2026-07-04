# Data Model: Meniu produse (catalog)

> Authored by: Agent (human approves; contracts and code must match this file).
> Reads from: `01-spec.md`, `02-clarify.md`, `04-plan.md`.
> Feeds into: `06-contracts/`, `07-tasks.md`, the code.
> Single source of truth for entities, fields, rules, and lifecycle.
> If the code and this file disagree, one of them is a bug.

## Entity: Category

A menu section (Pizza, Burgeri, Ciorbe, Băuturi…).

### Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `slug` | text | yes | — | unique, URL-safe (`pizza`, `bauturi`); seed upsert key |
| `name` | text | yes | — | display name, Romanian |
| `sortOrder` | integer | yes | 0 | display order |
| `active` | boolean | yes | true | inactive → hidden everywhere public |

## Entity: Product

One orderable item, shown once regardless of how many sizes it has.

### Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `categoryId` | integer FK → Category | yes | — | on delete: restrict |
| `slug` | text | yes | — | unique; seed upsert key |
| `name` | text | yes | — | e.g. "Pizza Quattro Stagioni" |
| `description` | text | no | null | ingredients line |
| `imageUrl` | text | no | null | null → UI shows placeholder |
| `sortOrder` | integer | yes | 0 | order within category |
| `active` | boolean | yes | true | inactive → hidden everywhere public |

## Entity: ProductVariant

A purchasable size/version of a product. **Every product has at least one
variant** — single-price products get one variant with `name = null`. Prices
live ONLY here, never on Product.

### Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `productId` | integer FK → Product | yes | — | on delete: cascade |
| `name` | text | no | null | "30 cm", "40 cm", "60x40 cm"; null for single-variant |
| `priceBani` | integer | yes | — | > 0; integer bani (ARCHITECTURE.md) |
| `sortOrder` | integer | yes | 0 | smallest size first |

## Entity: ToppingGroup

A set of optional extras attachable to products (e.g. "Topping-uri extra
pizza"). Modeled and seeded now; UI selection arrives with the cart feature.

### Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `name` | text | yes | — | |

## Entity: Topping

### Fields

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `groupId` | integer FK → ToppingGroup | yes | — | on delete: cascade |
| `name` | text | yes | — | "Mozzarella extra" |
| `priceBani` | integer | yes | — | >= 0; flat per topping in v1 (02-clarify.md Q5 open) |
| `active` | boolean | yes | true | |

## Entity: ProductToppingGroup (join)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `productId` | integer FK → Product | yes | — | composite PK with groupId |
| `groupId` | integer FK → ToppingGroup | yes | — | |

### Ownership Rules

- Menu data is owned by the restaurant; there is no per-user data in this feature.

### Validation Rules

- `slug` values are unique per table, lowercase, `[a-z0-9-]+`.
- `priceBani` is a positive safe integer (toppings: non-negative).
- A `Product` MUST have >= 1 `ProductVariant` (enforced by seed + repository test).

### Lifecycle

- **Initial state:** `active = true` on import.
- **Allowed transitions:** active ⇄ inactive (soft hide; no deletes from admin in v1).
- **Not supported in v1:** hard deletion of products with order history —
  listed so the boundary is a decision, not an accident (orders arrive in a
  later feature and will reference variants).
