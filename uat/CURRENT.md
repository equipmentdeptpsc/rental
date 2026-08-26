# Current UAT state

- Current milestone: post-acknowledgement Rental workspace projection for RNT-2026-000001.
- Canonical state: DEUR-2026-000001 is Acknowledged at row version 9 with its event history retained; the grouped review request is consumed exactly once and billing lines remain zero.
- Certified defect: remote Rental workspace assembled DEURs from the local compatibility repository and Billing presentation used local Equipment context, despite canonical authenticated readers already returning the records.
- Local correction: hydrate remote workspace DEURs through the authenticated read repository and use canonical workspace Equipment/Operator presentation data. No migration or business-data mutation is required.
- Local gates: focused projection tests 24/24; relevant regressions 55/55; formerly timed-out Rental/DEUR provider tests pass 34/34 in isolation; Commercial Terms UAT 4/4; application, Worker, and test TypeScript green; build green.
- Full-suite concurrency run: 1977 passed, 139 skipped, 36 failed from shared React test timeouts/cascade; all directly affected failures rerun green with one worker.
- Next safe action: commit and push the scoped projection correction, deploy isolated UAT, then verify the authenticated workspace shows canonical Equipment, Acknowledged DEUR, and event history without creating billing.
