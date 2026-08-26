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
- Next safe action: commit/push the scoped files, apply only `20260826000700` to isolated UAT, deploy, read-first certify the exact 2026-08-25 target, and execute one approved waiver only if every gate remains green.
