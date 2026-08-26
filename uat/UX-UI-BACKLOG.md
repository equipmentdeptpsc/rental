# UX/UI backlog

For each green workflow capture 1440, 1024, 390, and meaningful 360px before/after evidence.

1. Rental Workspace
2. Digital DEUR / operator workflow
3. Dashboard
4. Equipment
5. Users / RBAC administration
6. Billing
7. Reports
8. Remaining administration and master data

Focus on hierarchy, spacing, typography, responsive behavior, accessibility, state feedback, and safe action hierarchy without changing business rules.

Observed during Operator Digital DEUR UAT:

- HIGH: Start Digital DEUR does not expose an in-flight disabled/loading state; rapid repeat clicks can issue distinct command IDs even though the database rejects duplicate active DEURs.
- MEDIUM: the route briefly renders “Rental not found” while canonical data is still loading.
- LOW: remote Operator pages still state “Local changes saved,” which is inaccurate for confirmed canonical remote commands.
- MEDIUM: during breakdown and immediately after Resume Operation, the current-activity label/timer temporarily disappeared while action controls remained available; canonical transitions persisted correctly.
- PENDING: 390px/360px grouped customer-review checks are blocked by missing Rental timezone and review-recipient snapshot.

Observed during grouped Customer review and post-acknowledgement Rental UAT:

- MEDIUM: sub-minute Idle and Breakdown intervals round to `0 min`; display seconds or `<1 min` without changing billing calculations.
- LOW: replace the internal-facing tenant label “Local compatibility tenant” with a UAT-appropriate customer-facing label.
- LOW: hide or shorten raw canonical IDs in ordinary review screens while retaining copyable IDs in technical details.
- LOW: format revision labels consistently (for example, `R1`) instead of mixing raw revision fields and prose.
- MEDIUM: improve activity timeline scanability with clearer event grouping, timestamps, and start/end pairing.
