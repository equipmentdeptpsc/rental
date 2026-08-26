# Current UAT state

- Current milestone: post-acknowledgement Rental workspace projection for RNT-2026-000001.
- Canonical state: DEUR-2026-000001 is Acknowledged at row version 9 with its event history retained; the grouped review request is consumed exactly once and billing lines remain zero.
- Certified defect: remote Rental workspace assembled DEURs from the local compatibility repository and Billing presentation used local Equipment context, despite canonical authenticated readers already returning the records.
- Local correction: hydrate remote workspace DEURs through the authenticated read repository and use canonical workspace Equipment/Operator presentation data. No migration or business-data mutation is required.
- Local gates: focused projection tests 24/24; relevant regressions 55/55; formerly timed-out Rental/DEUR provider tests pass 34/34 in isolation; Commercial Terms UAT 4/4; application, Worker, and test TypeScript green; build green.
- Full-suite concurrency run: 1977 passed, 139 skipped, 36 failed from shared React test timeouts/cascade; all directly affected failures rerun green with one worker.
- Deployed commit: `1059949`.
- Isolated-UAT Worker version: `45874c26-0d88-4fc8-9354-686168e832f2`.
- Remote certification: UAT-EQP-003 and DEUR-2026-000001 R1 are visible; the DEUR is Acknowledged and the workspace reports Billing Eligible. No billing or lifecycle command was executed.
- Remaining canonical compliance blocker: the Per Workday policy has a due, missing expectation for `2026-08-25`; `2026-08-26` is compliant. Investigate the legitimate prior-day obligation before creating billing.
- Next safe action: read-first certification of whether the `2026-08-25` expectation is contractually required or predates actual operation; do not fabricate a DEUR or generate billing to bypass it.
