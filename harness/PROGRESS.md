# PROGRESS.md

> Authored by: Agent (updated before every session ends; human may correct).
> This file answers one question for the next session: "Where are we, and what is next?"
> It is a snapshot, not a history — overwrite sections freely. DEV_LOG.md and git log are the history.

## Current State

- **Last updated:** 2026-07-06, later session (feat-010 merged to main and
  pushed after stripping co-author trailers — owner request; SHAs remapped,
  content identical: T01 817fc4e→67d317a … T10 d2414fc→25db8f6)
- **Active feature:** none in progress. feat-010 (Conturi clienți și login
  social) is done and merged. Owner picked ALL THREE remaining features
  (2026-07-06): feat-011 cupoane first (self-contained), then feat-009 /
  feat-012 (both need owner-provided credentials — order TBD with owner).
- **Verification status:** ./init.sh fully green 2026-07-06: 198 tests
  (43 accounts + 46 admin + 22 orders + assistant + menu; the assistant
  live smoke SKIPS — the owner revoked the shared Anthropic key, see
  below), lint, typecheck, boundary checks, build with the /cont +
  /api/account/* routes. `npm test -- tests/accounts`: 43/43.
- **API keys:** the revoked ANTHROPIC_API_KEY is commented out in the
  git-ignored `.env` (a 401 from the live smoke proved it dead). With no
  key: shop unaffected, ChatFab hidden, smoke skips. A fresh key re-enables
  both. GOOGLE_CLIENT_ID/SECRET not yet created (owner) — accounts work
  fully without them; the Google button simply does not render (D8).
- **Dev DB state:** clean — quickstart test data removed (customers,
  their sessions, orders #1156/#1157, temp staff user #131). Dev staff
  accounts `admin` (#45) / `angajat` (#48) still exist (passwords not
  recorded — recreate via scripts/create-staff-user.ts if needed).

## Done

- [x] feat-001 Setup; feat-002 Meniu; feat-006 Coș și comandă (main @ cf3d2a6)
- [x] feat-007 Panou admin (chain 01–09, T01–T15) — see feature-list evidence
- [x] feat-008 Asistent AI (chain 01–09, T01–T10) — live-API quickstart done;
      remaining human checks: hear the alert tone on the restaurant device
- [x] feat-010 Conturi clienți și login social (chain 01–09, T01–T10) on
      `feat/010-conturi-clienti`:
  - shared auth primitives extracted to `src/server/auth/primitives.ts`
    (staff regression: tests/admin 46/46)
  - schema 0006: customers (has_credential CHECK), customer_sessions,
    orders.customer_id FK SET NULL + indexes
  - customer-auth service: register/login/logout, 30d rolling
    `rf_client_session`, rate limit ip|email, dummy-hash timing
  - Google OIDC hand-rolled (state+PKCE, iss/aud/exp/email_verified),
    injectable exchange as the only test seam; runtime-optional like the
    assistant key (no button + 503 when unconfigured)
  - order ownership: stamp at insert, first-claim backfill on register and
    on profile phone/email change; isolation via requireCustomer +
    repository filter (404 for foreign orders)
  - checkout: silent prefill from GET /api/account/me; after a logged-in
    order, D-h fill-the-gaps absorb into EMPTY profile fields only
  - UI: /cont (auth panel / profile + orders with 15s polling),
    /cont/comenzi/[id], header "Cont" entry, privacy section (Q5
    disclosure); ops: scripts/set-customer-password.ts (Q4)
  - quickstart flows 1–5 executed 2026-07-06 at 375px; results in
    005-conturi-clienti/08-quickstart.md "Rezultate", observations in
    09-debug.md; D3+D4 promoted to harness/docs/DECISIONS.md

## In Progress

- Nothing. Next session starts a new feature at spec time (owner's pick).

## Next Steps

1. Start feat-011 (Cupoane de reducere) at 01-spec per the document flow,
   on branch `feat/011-cupoane` from main. Owner approved all three
   remaining features 2026-07-06; 011 goes first because it needs no
   external credentials. feat-009 needs a fresh ANTHROPIC_API_KEY +
   Telegram/WhatsApp access; feat-012 needs the payment-provider choice —
   both owner inputs, collect them while 011 is in flight.
2. **Owner, small:** create the Google Cloud OAuth client (Web application;
   redirect URIs `http://localhost:3000/api/account/google/callback` + the
   production equivalent), put GOOGLE_CLIENT_ID/SECRET + APP_BASE_URL in
   `.env`, then run quickstart Flow 6 (005 08-quickstart.md) — the last
   feat-010 check. Not blocking anything.
3. ~~Merge strategy~~ DONE 2026-07-06: main fast-forwarded to feat-010 head
   (25db8f6 + this bookkeeping commit) and pushed to origin. The obsolete
   `feat/007-panou-admin` had already been deleted by the owner.
4. Still open (human): fresh production ANTHROPIC_API_KEY at deploy time;
   hear the new-order tone on the restaurant device; hide the shop cart FAB
   on /admin routes (parked chip); lawyer-reviewed T&C/GDPR texts (now incl.
   chat retention + account/linking sections).

## Blockers / Risks

- None technical. Go-live needs: branches merged + pushed, staff accounts
  on the real host, production keys in the host `.env`, owner walk-through.
- Q5 accepted risk (unverified guest-order linking) is live behavior now —
  disclosed on /confidentialitate; SMS/email verification is the recorded
  follow-up feature.

## Decisions Made This Session

- Promoted to harness/docs/DECISIONS.md (owner-approved at research):
  shared auth-primitives module (D3); write-time stamped ownership for
  cross-feature identity linking (D4).
- T10 implementation-level: set-customer-password.ts mirrors
  create-staff-user.ts exactly (env/stdin password, never argv; email
  matched lowercase). Cleanup lesson: `docker exec psql -c "A; B; C"` runs
  ONE transaction — a late error rolls back earlier deletes silently;
  verify with SELECTs in the same batch.
- Quickstart observations (005 09-debug.md): phoneSchema rejects inner
  spaces — inherited feat-006 contract, identical in checkout, NOT changed;
  OrdersList keeps polling on 401 by design (comment in code), cost
  accepted for v1.

## Files Modified This Session

- scripts/set-customer-password.ts (new — T10)
- .env.example (+GOOGLE_CLIENT_ID/SECRET, APP_BASE_URL — T10)
- harness/specs/005-conturi-clienti/08-quickstart.md (new — written AND
  executed, flows 1–5 + documented Flow 6) + 09-debug.md (new)
- harness/specs/005-conturi-clienti/07-tasks.md (T10 ticked)
- harness/feature-list.json (feat-010 → done with evidence)
- harness/docs/DECISIONS.md (+2 promoted entries)
- harness/PROGRESS.md, harness/SESSION-HANDOFF.md, harness/DEV_LOG.md
- .env (local only, git-ignored): revoked ANTHROPIC_API_KEY commented out

## Notes for the Next Session

This project uses the long-track harness. Read AGENTS.md first, always.
Docker Desktop must be running before ./init.sh. In THIS worktree, .env
needs COMPOSE_PROJECT_NAME=magazin_online or docker compose conflicts on
the royal-db container name.
Integration tests self-migrate and self-seed; the admin suite runs the real
seed and resets protection flags in cleanup; accounts tests clean up after
themselves.
The boundary check greps the server-import string even in comments in
src/components — do not write it literally there.
Topping names are unique only within their group — scope lookups by
(group, name).
