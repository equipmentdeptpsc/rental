# R3D-BQ offline occurrence-time contract

`20260925000200_preserve_deur_offline_occurrence_time.sql` is a forward,
RPC-local migration. It replaces only `erp.command_transition_deur_activity(jsonb)`
and `erp.command_complete_deur_shift(jsonb)`.

Authoritative source provenance is the aligned migration chain: Activity was last
defined in `20260830002300_canonical_deur_turnover_custody.sql`; Complete Shift was
last defined in `20260925000100_beta_odometer_only_deur_meter_policy.sql`. In both
cases the migration begins with that complete function body and limits the semantic
change to occurrence-time selection and validation.

The mobile `clientOccurredAt` JSON field is parsed once into
`client_occurrence_at`. When present and valid it is written to both
`erp.deur_events.client_created_at` and canonical `erp.deur_events.occurred_at`.
`server_accepted_at`, DEUR `updated_at`, and audit timestamps remain the server
operational clock. Without `clientOccurredAt`, the old server-clock occurrence
behavior and legacy `clientCreatedAt` storage remain unchanged.

Validation rejects malformed values, occurrence times earlier than the latest
canonical DEUR event, and times over five minutes ahead of the server clock. Five
minutes is the explicitly bounded device-clock allowance. No maximum event age is
introduced: a valid authenticated offline-continuation command may be replayed up
to the existing twelve-hour continuation window later.

`erp.begin_deur_command` fingerprints the whole JSON payload except `commandId`
and `idempotencyKey`; therefore `clientOccurredAt` participates in idempotency
without an unrelated helper change. An exact retry replays without duplicate events;
the same identity with an altered occurrence timestamp is rejected as an
idempotency mismatch.

No trigger, table alteration, backfill, historical rewrite, Travel/Refuel change,
billing change, or review change is included.
