# Data Model: Asistent AI pe site (chat)

> Authored by: Agent (human approves; contracts and code must match this file).
> Reads from: `01-spec.md`, `02-clarify.md`, `04-plan.md`.
> Feeds into: `06-contracts/`, `07-tasks.md`, the code.
> Single source of truth for entities, fields, rules, and lifecycle.
> If the code and this file disagree, one of them is a bug.

Extends the existing model (menu: 001, orders: 002, admin: 003). Unchanged
entities are not repeated. The assistant reads menu/zones/schedule and
writes orders exclusively through existing services — no changes to those
tables. Only two new tables.

## Entity: AssistantConversation

One chat conversation on one device (02-clarify Q8/Q9). Created on the
first message; the id returns to the client and lives in `sessionStorage`.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | yes | random | server-issued; unguessable (acts as the access token to the transcript) |
| `clientIp` | text | yes | — | same normalization as `orders.client_ip`; drives the per-IP daily limit |
| `createdAt` | timestamptz | yes | now() | |
| `lastActivityAt` | timestamptz | yes | now() | bumped on every message; index — retention scans it |

Lifecycle: created → appended to (messages) → deleted by retention when
`lastActivityAt` < now − 30 days (Q9). No soft delete; deletion CASCADEs
to messages. Retention runs opportunistically on conversation creation.

## Entity: AssistantMessage

One entry in a conversation's transcript — user text, assistant text, or
a tool interaction. The transcript is the audit trail the owner reviews
(Q9) and the replay source for the provider on the next turn.

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | serial | yes | auto | |
| `conversationId` | uuid FK → AssistantConversation | yes | — | CASCADE on delete |
| `role` | enum `assistant_role` | yes | — | `'user'` \| `'assistant'` \| `'tool'` |
| `content` | jsonb | yes | — | shape per role, below |
| `inputTokens` | integer | no | null | provider-reported usage for the turn that produced this message (assistant rows only) |
| `outputTokens` | integer | no | null | idem |
| `createdAt` | timestamptz | yes | now() | ordered reads by (conversationId, id) |

`content` shapes (validated in code, stored as jsonb):
- role `user`: `{ "text": string }`
- role `assistant`: `{ "text": string }` — the reply shown to the customer,
  OR `{ "toolCalls": [{id, name, input}] }` for an intermediate tool round
- role `tool`: `{ "toolCallId": string, "name": string, "result": unknown, "isError"?: true }`

Rules:
- The per-conversation limit counts rows with role `user` (≤ 40).
- The per-IP daily limit counts role-`user` rows joined through their
  conversation's `clientIp` over the last 24h (≤ 60).
- Token counts are observability only (DECISIONS 2026-07-05: no budget
  enforcement in code).
- History sent to the provider is capped to the most recent ~30 messages;
  the DB keeps the full transcript until retention deletes it.

## Not stored (by design)

- No customer identity on the conversation — the guest details exist only
  inside a placed order (same data the web checkout stores). The
  transcript may contain what the customer typed; retention (30 days)
  bounds it, and the privacy page discloses it (Q9).
- No cart snapshots per message — the cart travels with each request and
  ends up in the order on placement; persisting intermediate carts adds
  data without a reader.
- No monthly cost counters (DECISIONS 2026-07-05 — console governs spend).
