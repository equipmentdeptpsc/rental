# Current UAT state

- Current milestone: canonical historical DEUR-expectation waiver and Daily Operations projection correction for RNT-2026-000001.
- Canonical state: DEUR-2026-000001 is Acknowledged at row version 9 with its event history retained; the grouped review request is consumed exactly once and billing lines remain zero.
- Certified defect: remote Rental workspace assembled DEURs from the local compatibility repository and Billing presentation used local Equipment context, despite canonical authenticated readers already returning the records.
- Local correction: hydrate remote workspace DEURs through the authenticated read repository and use canonical workspace Equipment/Operator presentation data. No migration or business-data mutation is required.
- Local gates: focused projection tests 24/24; relevant regressions 55/55; formerly timed-out Rental/DEUR provider tests pass 34/34 in isolation; Commercial Terms UAT 4/4; application, Worker, and test TypeScript green; build green.
- Full-suite concurrency run: 1977 passed, 139 skipped, 36 failed from shared React test timeouts/cascade; all directly affected failures rerun green with one worker.
- Deployed commit: `1059949`.
- Isolated-UAT Worker version: `45874c26-0d88-4fc8-9354-686168e832f2`.
- Remote certification: UAT-EQP-003 and DEUR-2026-000001 R1 are visible; the DEUR is Acknowledged and the workspace reports Billing Eligible. No billing or lifecycle command was executed.
- Approved remediation implemented locally: immutable `WAIVED` disposition evidence, `deur.expectation.waive` granted only to System Administrator, a tenant-derived idempotent command, audited read projection, distinct waived compliance counts, and no DEUR/billing mutation. Remote DEUR mapping also normalizes absent compatibility `logs` to `[]` without fabricating logs from events.
- Local gates: clean reset through `20260826000700`; focused 39/39; relevant Rental/DEUR/billing/RBAC 68/68; full suite 2019 passed and 139 skipped; application, Worker, and test TypeScript green; build and diff check green.
- Remote waiver attempt made no business mutation because the command referenced nonexistent `erp.deurs.deleted_at` and failed when PostgreSQL executed the evidence guard.
- Forward-only correction `20260827000100` replaces only the command and uses the canonical current-revision predicate `superseded_by_revision_id IS NULL`; local runtime certification returned ACCEPTED then REPLAYED with one waiver, one audit, and zero DEURs.
- Correction commit `f800cd9` was pushed to the UAT branch and only `20260827000100` was applied to isolated UAT; the post-apply dry run is up to date.
- The single approved retry succeeded. Hard-refresh certification shows Expected 3, Acknowledged 1, Waived 1, Missing 0; 2026-08-25 is distinctly WAIVED with the approved reason, DEUR-2026-000001 remains Acknowledged, and Billing Eligible remains projected.
- Next safe action: resolve the separate Billing Preview optional-term validation defect before executing any billing calculation or mutation.
