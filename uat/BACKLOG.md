# UAT backlog

| Item | State | Evidence / next action |
|---|---|---|
| Catalog 2.0 Users-list visibility | CLOSED | 00700 applied; four users and both Operations Managers visible with role embeds. |
| Duplicate Operations Manager | CLOSED | `645384d0-c872-4245-84b5-9ec16305431c` deactivated; original and both Auth identities preserved. |
| Rental Activate | CLOSED | RNT-2026-000001 activated; DEUR/commercial/Assignment/equipment invariants preserved. |
| Canonical remote Return | VERIFIED | Existing canonical `returnAll` command wired into remote quick actions; deployed control is visible and enabled. Return was not executed. |
| Remote Audit Trail projection | OPEN | UI shows zero events despite successful transactional trusted commands; diagnose after Return deployment. |
| Digital DEUR end-to-end | VERIFIED | DEUR-2026-000001 corrected audibly to `2026-08-26`, exercised through activity transitions, completed, and submitted exactly once. |
| Grouped customer acknowledgement | VERIFIED | One trusted grouped review was delivered through the isolated-UAT override and manually acknowledged; the canonical DEUR is Acknowledged at row version 9 with one consumed request and no duplicate outcome. |
| Post-acknowledgement workspace projection | VERIFIED | Commit `1059949` deployed as UAT Worker `45874c26-0d88-4fc8-9354-686168e832f2`; canonical Equipment and Acknowledged DEUR now project into the workspace and Billing readiness. |
| Missing 2026-08-25 DEUR expectation | VERIFIED | Forward-only `20260827000100` corrected the invalid DEUR guard. One approved waiver now persists for 2026-08-25 with exact reason; Expected 3, Acknowledged 1, Waived 1, Missing 0 after hard refresh, with no fabricated DEUR. |
| Billing Preview optional-term normalization | VERIFIED | Deployed Worker `7886816e-cc1c-42cc-8866-1efad7386752` projects the authorized immutable snapshot and omits only null optional values. Hard refresh shows Final Preview PHP 3,883.33; zero billing statements/invoices and no financial mutation. |
| Canonical remote Billing creation | VERIFIED | Exactly one Draft `BS-2026-000001` persists for 2026-08-26 with one line and PHP 3,883.33 subtotal; Not Invoiced. Remote joined projection and fail-closed action UI deployed in `e4eaeb7`/`5668d47`. |
| UAT DEFECT INVESTIGATION — Rental Equipment Line / DEUR Relationship | P1 YELLOW | Core line/DEUR/revision/cardinality is canonical. Still certify remote FK validation state, five underlying UUIDs/audit IDs, composite Operator/provenance gaps, Audit Trail, and multi-equipment behavior across every remote projection. |
| Immutable Billing lineage | VERIFIED | Commit `64e1889`; forward-only `20260828000100` applied; Worker `ce0b581a-3069-4adf-86cb-ab03ddbd877f` deployed. Clean replay and rollback-only multi-equipment/adversarial database certification pass; existing statement remains Draft/Not Invoiced at PHP 3,883.33. |
| Canonical Return expectation gate | REMEDIATION READY | Forward-only `20260828000200` and fail-closed UI are locally green. The approved 2026-08-27 disposition is a genuine DEUR, not waiver. Apply/deploy, then certify Return remains disabled while the DEUR is absent. Do not execute Return. |
| Canonical Per Hour precision | VERIFIED | `20260827000200` applied only to isolated UAT; exact-minute pricing produced the certified PHP 3,883.33 statement without changing displayed 3.8833 hours. |
| Daily Operations remote logs projection | REMEDIATION READY | Remote mapper now guarantees `logs: []` when the compatibility collection is absent while preserving canonical events and any existing logs. Deployment and browser route/deep-link certification remain. |
| Remote Operator commercial evidence | CLOSED | Operators remain unable to read financial snapshots; remote preparation now delegates immutable commercial binding to the canonical server command. |
| Remote DEUR event projection | CLOSED | `deur_events` are hydrated and ordered; the active view now shows Operation instead of offering a duplicate Start Operation. |
| UX/UI modernization | OPEN | Begin with Rental Workspace only after its workflow is green. |
