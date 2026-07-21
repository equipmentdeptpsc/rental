# Billing Architecture

## Source of truth

`DeurRecord.commercialSnapshot` and canonical DEUR evidence are calculation inputs. `BillingRateEngine` is the single calculation authority. Persisted `BillingStatementLine` values are the source for invoice rendering.

```text
DEUR snapshot + evidence → eligibility → BillingRateEngine
→ equipment-aware statement line → Rental totals
→ Billing Statement → read-only InvoiceDocument
```

Every DEUR is resolved and calculated independently, so mixed methods are supported. Contract fallback is restricted to unambiguous historical single-line records lacking an embedded snapshot.

## Persistence sequence

Local storage cannot provide an atomic multi-record commit. The canonical sequence validates and calculates all candidates, persists one complete statement, then locks included DEURs. A lock failure restores original DEURs and removes the statement. Incomplete compensation returns a manual-reconciliation error. Duplicate periods and DEUR/revision-chain consumption remain prohibited.

## Invoice and errors

There is no separate Invoice persistence aggregate. Invoice status advances the statement through its established lifecycle. Documents copy persisted values, hide zero optional charges, and report reconciliation differences without repairing history.

Boundary errors should provide `code`, `message`, contextual identities, recoverability, and a recommended action. Compatibility result shapes remain supported and should be normalized at future server application boundaries.
