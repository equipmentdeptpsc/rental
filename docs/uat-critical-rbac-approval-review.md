# UAT critical RBAC and approval review

This change creates `20261008000100_uat_management_approval_guards.sql` (SHA-256 `3DA8E286748DD06D56762ED99AB15552FA670B5B73A1EC2BC9C39C272DFF069A`). It was applied successfully to a separately named local Supabase database after resetting all repository migrations from an empty database.

## Rentals access

- **Dispatcher:** LIVE UAT PASS. Regression test confirms the Rental list remains available when supporting optional reads fail; canonical role assertions confirm Dispatcher has no Billing/Admin grants.
- **Auditor and Billing Officer:** Core Rentals records and lines stay readable when supporting catalogs or reference data fail. Only affected filters are omitted.
- Supporting catalog reads run in parallel. Core Rental failures still fail the page. RLS and existing server guards remain authoritative.

## Dashboard and approvals

- Management Viewer enters Dashboard through executive or financial read permission. Sections remain permission-gated and read-only.
- Operations Manager receives `dashboard.financial.read` and `billing.approve`, with no `billing.update`, `collections.read`, or general finance mutation grant.
- Financial Dashboard RPC returns aggregate totals, period comparisons, monthly trend, and five ranked labels per category, without statement or collection rows.
- Pending approval RPC returns actionable rental and billing counts plus up to 20 prepared statement summaries with at most 100 lines each. Rental count excludes requests from the current approver.
- The Operations Manager Dashboard shows both pending counts and a link to Manager Approvals when either count is nonzero.
- Rental approval decisions and parent or line release triggers reject direct update or RPC bypasses. Existing approved rentals do not need a duplicate approval.
- Billing finalization requires the scoped `billing.approve` capability. Customer email outbox insertion requires approval by an Operations Manager or System Administrator. DEUR customer review requests are a separate, earlier workflow.
- Approval audit records retain actor identity and add actor presentation and role metadata; billing finalization retains command idempotency.

## Validation boundary

The SQL assertions in `tests/integration/uat-management-approval-guards.sql` passed against that isolated database inside a transaction that rolled back its fixture data. They exercised role permissions, both aggregate RPCs, unauthorized decisions, parent and line release gates, successful Ops Manager approval, idempotent billing finalization, and rejection of billing email before approval. Focused application tests, TypeScript, and `build:uat` pass. UAT and Production were not changed. The isolated database was built from the repository migration history; no existing local or remote database was reset.
