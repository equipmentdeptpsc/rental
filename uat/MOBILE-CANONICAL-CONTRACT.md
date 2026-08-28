# eDEUR Mobile canonical contract

Contract version: `2026-08-28.phase1`

Source of authority: the `erp` schema and trusted commands in this repository. Mobile is a client and must not reproduce lifecycle, financial, tenancy, numbering, work-date, or daily-uniqueness rules.

## Authentication and authority

- UAT uses Supabase Auth username/password. Email identifiers may use Supabase Auth directly; usernames use the trusted `/api/auth/username-login` boundary.
- The authenticated Auth user resolves to one active `erp.users` row. Tenant and linked Operator identity are server-derived.
- UAT fails closed when configuration, authentication, application-user linkage, or Operator linkage is unavailable. It never falls back to demo fixtures.

## Minimum Operator work projection

The Mobile read boundary returns only the authenticated Operator's current operational scope: application user and tenant; linked active Operator; active Assignment; assigned Equipment; active Rental and Rental Equipment Line; frozen operational policy; Mobile-safe informational commercial terms; and any open originating DEUR, including a prior-workday DEUR.

The projection is tenant- and Operator-scoped from the authenticated session. Client-supplied tenant or Operator identifiers are never authority.

## Trusted commands

Mobile reuses:

- `erp.command_start_deur_shift(jsonb)`
- `erp.command_transition_deur_activity(jsonb)`
- `erp.command_complete_deur_shift(jsonb)`
- `erp.command_submit_deur(jsonb)`

Every mutation carries a stable command UUID/idempotency key. Versioned commands carry the last server row version. Server responses establish canonical DEUR ID, number, work date, timestamps, status, and version.

Mobile must not send an authoritative work date, tenant, DEUR number, or fabricated Operator identity. Optional shift metadata is descriptive only and is not part of uniqueness, expectation, or billing identity.

## DEUR and event identity

One originating chain exists per tenant + Rental Equipment Line + server-derived work date. A prior open DEUR remains discoverable after midnight and blocks starting another DEUR until properly completed and submitted.

`deurs.operator_id` is the assigned/starting Operator snapshot. Event `actor_id` records the actual authenticated actor. A future turnover workflow continues the same DEUR and must not overwrite historical participation.

Canonical activities are `operation`, `idle`, `standby`, `mealBreak`, and `breakdown`, with `shift` as the lifecycle envelope. Mobile `Operating`, `Meal Break`, and `Breakdown` map directly. Mobile `Waiting` remains blocked until the business distinguishes `idle` from `standby`.

## Submission and downstream ownership

Submission is accepted only through `erp.command_submit_deur`. Customer review, acknowledgement, billing eligibility, financial calculations, Return, and Close remain backend/Web responsibilities. Mobile may display server-projected state but never performs those authoritative transitions.

## Offline foundation

Phase 1 is online-only. A future durable queue preserves a stable command UUID across retries, expected version, capture time, payload, retry state, server acknowledgement, and conflict classification. Offline creation may use a temporary client reference but cannot assign canonical DEUR number, work date, or daily uniqueness.

## Future turnover commands (design only)

- `command_offer_deur_turnover`: the current authenticated participant offers the open DEUR to an eligible active Operator; validates tenant, work scope, current version, expiry, and competing offers; audits and is idempotent.
- `command_accept_deur_turnover`: the authenticated target accepts an unexpired offer using expected DEUR/offer versions; records current actor without replacing `deurs.operator_id`; audits and is idempotent.
- `command_reject_deur_turnover`: the authenticated target or authorized current participant rejects or cancels an open offer with concurrency and audit controls.

Offline turnover remains out of scope until online offer/accept concurrency is certified.
