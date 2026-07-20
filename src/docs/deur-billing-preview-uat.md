# Digital DEUR billing preview UAT

Use a local browser profile with representative rental contracts. The preview is informational and must never create or alter a billing statement.

1. Start a Per Hour operation and confirm the panel shows **Live estimate** and advances with the operation timer.
2. Configure minimum billable hours above elapsed operation time and confirm the preview uses the minimum without changing the DEUR.
3. Complete and acknowledge a shift and confirm the panel shows **Final preview**.
4. Record idle activity with a standby rate and confirm a non-zero Idle / standby row appears.
5. Configure mobilization and demobilization fees and confirm their non-zero rows appear.
6. Compare contracts with operator included and excluded; the Operator row should appear only for a non-zero calculated charge.
7. Configure a fuel charge, then set it to zero; confirm the Fuel row appears only when non-zero.
8. Repeat for VAT and withholding tax, confirming zero rows are hidden and the grand total remains visible.
9. Open a One Lot rental and confirm the contract amount is used.
10. Open a Per Cubic Meter rental and confirm **Not calculable** explains that quantity evidence is missing.
11. Remove or zero the required billing rate and confirm a specific configuration issue appears instead of a zero total.
12. Open a locked or already billed DEUR and confirm **Ineligible** with a user-friendly explanation and no charges.
13. Refresh while an activity is running and confirm the estimate resumes from persisted timestamps.
14. View the same synchronized DEUR in another tab and confirm equivalent evidence produces an equivalent preview at the same evaluation time.
15. Navigate between workspace tabs and confirm no billing statement is created, no DEUR becomes locked/billed, and no posting action exists in the preview panel.

## Billing handoff and close

1. For a returned rental with one completed eligible Per Hour DEUR, open **Review Billing and Close Rental** and verify the selected rental, DEUR, and totals.
2. Confirm minimum billable hours are reflected in both the preview and review.
3. Verify non-zero fuel and operator charges appear.
4. Verify VAT and withholding match the preview.
5. Verify zero optional rows remain hidden while subtotal and grand total remain visible.
6. Confirm One Lot uses the contract amount.
7. Confirm Per Cubic Meter is blocked because quantity evidence is unavailable.
8. Confirm a running DEUR cannot open a confirmable review.
9. Confirm a missing rate blocks the review with an actionable message.
10. Confirm locked and already billed DEURs cannot be billed again.
11. Open the review and select **Cancel**; verify no statement, DEUR, or rental changes.
12. Open again and select **Create Billing Statement and Close Rental**.
13. Rapidly attempt a double click and confirm only one statement exists.
14. Refresh after success and confirm the same statement number remains linked.
15. Reopen the closed rental and confirm it is read-only.
16. Change the billing rate while a review is open and confirm a refreshed review is required.
17. Change DEUR evidence while a review is open and confirm a refreshed review is required.
18. Exercise the automated failure checkpoints in the test suite and confirm retries repair partial progress.
19. Confirm exactly one active statement contains the selected DEUR.
20. Confirm the selected DEUR is billing-locked and linked to that statement.
21. Confirm the rental reaches Closed only after the statement and linkage succeed.
22. Confirm unrelated DEURs remain unlocked and unlinked.
23. Confirm no synchronization operation is queued merely by opening or cancelling the review.
