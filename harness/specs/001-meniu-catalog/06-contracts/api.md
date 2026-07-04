# Contract: Meniu produse (catalog) API

> Authored by: Agent (human approves; this file is the authoritative shape).
> Reads from: `01-spec.md`, `05-data-model.md`.
> Feeds into: `07-tasks.md`, the code, `08-quickstart.md`.
> Exact request/response shapes. The code conforms to this file — not the
> other way around. Error responses are part of the contract, not an afterthought.

## Common Rules

- Public endpoint, no authentication in this feature.
- Responses are JSON, `Content-Type: application/json`.
- All prices are **integer bani** (`priceBani`); clients format for display.
- Only `active` categories/products (and their variants) are ever returned.
- Toppings are NOT included in this endpoint in v1 — they enter the contract
  with the cart feature.

## Endpoint: Get full menu

`GET /api/menu`

**Request:** no parameters.

**Response `200 OK`:**

```json
{
  "categories": [
    {
      "id": 1,
      "slug": "pizza",
      "name": "Pizza",
      "products": [
        {
          "id": 10,
          "slug": "pizza-quattro-stagioni",
          "name": "Pizza Quattro Stagioni",
          "description": "sos de roșii, mozzarella, șuncă, ciuperci, salam, ardei",
          "imageUrl": null,
          "variants": [
            { "id": 100, "name": "30 cm", "priceBani": 3200 },
            { "id": 101, "name": "40 cm", "priceBani": 4300 },
            { "id": 102, "name": "60x40 cm", "priceBani": 7800 }
          ]
        }
      ]
    }
  ]
}
```

- Categories sorted by `sortOrder`; products by `sortOrder` within category;
  variants by `sortOrder` (smallest first).
- Single-variant products: `variants` has one entry with `"name": null`.
- An active category with zero active products IS returned (empty `products`) —
  the UI decides whether to render it.

**Errors:**

| Status | When | Body |
|---|---|---|
| `500` | database unreachable / unexpected failure | `{"error": "internal"}` |

(No 4xx: the endpoint takes no input. An empty menu is `200` with
`"categories": []`, not an error.)
