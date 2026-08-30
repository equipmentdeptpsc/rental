# Limited Operational Pilot Plan

Status: planning only (Milestone 6). This document is not production rollout approval.

## Purpose

Define the smallest controlled envelope in which the certified Web/backend and
mobile DEUR flow could be evaluated with real operating staff. No production
enablement, financial posting, customer email, or Return is authorized by this
plan.

## Certified baseline

The isolated-UAT certification established authenticated/session restore,
tenant- and operator-scoped work, canonical DEUR creation with PER_WORKDAY
identity, one DEUR per Rental Equipment Line/workday, activity transitions with
one active activity and no overlap, End Shift, Submit, submitted read-only
behavior, and exactly-once submit evidence. Three operators exercised three
lines across two Rentals with counts 1/1/1 and no cross-operator exposure.
The grouped-review and notification architecture is server-owned and was
observed without dispatch; billing is a read-only projection and statements and
invoices remained zero; Return was not executed. UAT-only inspection surfaces,
safe errors, audit/idempotency evidence, and deterministic residue/recovery
guards are available. Production was unchanged.

These are certification results, not a claim that every operational or support
capability is pilot-ready.

## Recommended envelope

| Dimension | Limit |
|---|---|
| Duration | 5 consecutive workdays, then a go/no-go review |
| Projects/sites | 1 named site and 1 named project; no simultaneous second site |
| Rentals | At most 2 concurrent named Rentals |
| Equipment | At most 3 named units; standard, non-hazardous equipment only |
| Operators | 3 named operators, each with one assigned line; no shared credentials |
| Dispatch/admin | 1 named dispatcher and 1 named System Administrator for support |
| Relievers | Not allowed in this first envelope; assigned-operator continuity only |
| Billing | PER_HOUR and PER_WORKDAY projection/read-only checks only; no statement or invoice creation |
| Customer review | Candidate generation may be observed; no external email and no real acknowledgement |
| Return | Outside the pilot; remain in Web/admin workflow and disabled for pilot staff |

The three-operator/two-Rental shape is the smallest configuration that exercises
line ownership and cross-Rental isolation without making turnover or offline
reconciliation a hidden dependency.

## Allowed DEUR behavior

Operators may start one same-day DEUR for their assigned line, use Operating,
Idle, Standby, Meal Break, and Breakdown transitions, End Shift, and Submit.
The server remains authoritative for tenant, operator, work date, line identity,
status, and timestamps. Cross-midnight work is not allowed; stop at the local
workday boundary and escalate any required continuation. A submitted DEUR is
read-only. Corrections, reopen/revision, reliever takeover, and offline replay
after an unresolved conflict are outside this envelope.

## Capability assessment

| Capability | Classification | Basis / condition |
|---|---|---|
| Authentication and session restore | PILOT_OPTIONAL | Certified for named UAT operators; support must verify identity before use. |
| Ownership isolation and duplicate-click/idempotency guards | PILOT_OPTIONAL | Certified in the exercised scenario; monitor every command outcome. |
| Reliable-network activity flow | PILOT_OPTIONAL | Certified for the listed states and Submit path. |
| Unreliable-network recovery / app resume | PILOT_BLOCKER | Offline queue/reconciliation and conflict recovery are not operationally certified. |
| Reliever/operator turnover | PILOT_BLOCKER | Current ownership admits the assigned operator only; no accept/continue protocol. |
| Device replacement/session transfer | POST-PILOT | Requires explicit support and revocation workflow. |
| GPS/location capture | POST-PILOT | Not part of the certified DEUR evidence contract. |
| Odometer/hour-meter automation | POST-PILOT | Not certified for this envelope. |
| Fuel capture and maintenance detail | POST-PILOT | Not certified. |
| Breakdown detail / waiting reasons | PILOT_OPTIONAL | Use only existing canonical Breakdown; do not invent reasons or fields. |
| Customer review real-email delivery | PILOT_BLOCKER | External delivery is prohibited; retain UAT recipient override. |
| Billing statement/invoice generation | PILOT_BLOCKER | Projection may be reviewed; financial mutation requires a separate approval and gate. |
| Return workflow | PILOT_BLOCKER | No Return in mobile pilot; canonical readiness and business disposition remain separate. |
| Admin resend/recovery interface | PILOT_BLOCKER | Support relies on controlled runbooks/read surfaces, not a certified self-service console. |
| Audit/read visibility for support | PILOT_BLOCKER | Canonical audit exists, but support-facing end-to-end visibility remains open. |
| Password reset/operator support | PILOT_BLOCKER | Define a private support procedure before admitting real staff. |

## Safety guards and support procedure

1. Maintain an allowlist of the named users, equipment, Rentals, project, and site;
   reject everything else server-side and keep the isolated-UAT environment flag.
2. Require canonical authentication and least-privilege permissions. Never accept
   tenant, actor, status, rate, or work date as authoritative browser input.
3. Capture daily read-only evidence: DEUR/line identity, activity timeline,
   Submit/idempotency result, cross-operator exposure, downstream counts, and
   audit correlation ID. Do not log passwords, tokens, or secrets.
4. Take a verified database backup/checkpoint before each workday and retain the
   immutable audit/idempotency history. No destructive cleanup is permitted.
5. The dispatcher is first responder; the System Administrator owns escalation.
   Freeze the affected line, preserve timestamps and screenshots, and attach the
   sanitized read projection before any remediation decision.
6. Keep notification recipient override enabled, billing/Invoice writes blocked,
   and Return outside the pilot feature envelope.

## Stop and rollback criteria

Any of the following is an immediate stop (Severity 1): duplicate daily DEUR,
cross-operator work exposure, lost or altered submitted DEUR, activity overlap,
wrong work date/line/equipment lineage, non-idempotent Submit, unintended
billing/invoice, Return, external email, or authentication/session corruption.
Freeze new commands, preserve read-only evidence and the backup checkpoint, and
escalate to the System Administrator. Restart requires a root-cause fix,
regression evidence, a fresh isolated-UAT deployment, and an explicit go/no-go.

Severity 2 stop conditions are repeated recoverable network failures, missing
audit/read evidence, unexpected support errors, or a device/session anomaly.
Pause the affected operator and Rental, do not retry blindly, and resume only
after the canonical read surface and support owner confirm a safe continuation.

Rollback means disabling the pilot flag/allowlist and returning to the known
isolated-UAT build; it does not delete or rewrite business, audit, or idempotency
history. Production rollback is not part of this plan.

## Success and exit criteria

Exit only after 5 workdays with at least 3 operators and 3 equipment units
exercised, at least 10 eligible DEURs completed, and:

- 100% successful completion or explicitly documented operator-aborted runs;
- zero duplicate daily identities, zero lost submissions, zero overlap, and zero
  cross-operator exposure;
- 100% of submitted DEURs remain readable and immutable after reload/session restore;
- zero unintended billing statements, invoices, Returns, or external notifications;
- no more than one Severity 2 incident and zero Severity 1 incidents;
- every workday has a reconciled evidence pack and named support sign-off.

Any failed criterion is a no-go for expansion. A successful exit authorizes only
design review for the next envelope, not production-wide enablement.

## Pilot entry checklist

- [ ] named users, equipment, Rentals, site, and project approved;
- [ ] isolated-UAT feature flag and recipient override verified;
- [ ] support/on-call owner, escalation channel, and private credential procedure documented;
- [ ] backup/checkpoint and evidence storage verified;
- [ ] billing, invoice, Return, external email, reliever, and offline paths explicitly blocked;
- [ ] stop criteria rehearsed and go/no-go owner recorded.

## Pilot exit checklist

- [ ] success metrics and incident log reconciled;
- [ ] all DEURs, audit/idempotency records, and downstream counts read back;
- [ ] no unresolved Severity 1/2 incident or unexplained residue;
- [ ] backup/evidence retained and access reviewed;
- [ ] expansion decision recorded separately from production approval.

## Unresolved risks and next engineering work

The highest risks are offline synchronization, reliever turnover, support-facing
audit visibility, password recovery, and the still-blocked billing/Return/email
boundaries. Next work should design and test an actor-attributed turnover state,
encrypted offline queue replay/conflict handling across two devices, a narrow
support audit projection, and private operator recovery procedures. Only after
those are independently certified should the envelope consider additional sites,
financial writes, real customer acknowledgement, or production deployment.
