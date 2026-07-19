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
