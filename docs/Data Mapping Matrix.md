# Data Mapping Matrix

| TypeScript entity/repository | Local Storage key | PostgreSQL target | ID | Transformation / compatibility concern |
| --- | --- | --- | --- | --- |
| Equipment | `equipment-records` | `equipment` | `id` | Resolve master IDs; keep display-name fallbacks in `legacy_payload`; epoch `deletedAt` becomes `timestamptz`. |
| EquipmentHistory | `equipment-history-records` | `equipment_history` | `id` | Append-only; preserve snapshots as JSONB and original event time. |
| Assignment | `assignments` | `assignments` | `id` | Validate equipment/operator/project FKs and active uniqueness before insert. |
| Customer | `customer_records` | `customers` | `id` | Preserve optional legacy contact fields in `legacy_payload`. |
| Project | `projects` | `projects` | `id` | Resolve optional customer; retain unmodeled fields in `legacy_payload`. |
| Operator | `operators` | `operators` | `id` | Validate status/certification enum spelling. |
| Rental | `equipment-rental-records` | `rentals` | `id` | Header equipment/operator are legacy references; snapshots and operational metadata are copied, never recalculated. |
| RentalEquipmentLine | `equipment-rental-equipment-lines` | `rental_equipment_lines` | `id` | Versioned envelope; create exactly one deterministic compatibility line only when absent and unambiguous. |
| RentalContract | `equipment-rental-contracts` | `rental_contracts` | `id` | Resolve line association; preserve decimals as text/numeric during loader conversion. |
| CommercialSnapshot | embedded in Rental/DEUR records | `commercial_snapshots` | generated staging evidence ID | Copy historical values; line identity must be deterministic; compute verification hash without changing evidence. |
| DEUR | `equipment-rental-deur` | `deurs` | `id` | Resolve line without random selection; retain legacy/manual/evidence JSONB; normalize timestamps only for SQL types. |
| DEUR logs/events/reviews | embedded in DEUR | `deur_activity_logs`, `deur_events`, `deur_review_history` | embedded `id` or deterministic import ID | Preserve sequence and evidence; append-only after import. |
| DEURShiftWindow | `equipment-rental-deur-shift-windows` | rental snapshot/reference import | `id`/code | Live definitions must not replace released rental window snapshots. |
| BillingStatement | `equipment-rental-billing-statements` | `billing_statements` | `id` | Persist header totals verbatim; do not sum/recalculate during import. |
| BillingStatementLine | embedded in statement | `billing_statement_lines` | existing `id`; deterministic legacy ID if absent | Preserve DEUR/revision/line identity and all stored charge/tax totals. |
| LegacyBilling | `equipment-rental-billing` | staging/legacy reconciliation | source ID | Do not promote until mapped to statement evidence without ambiguity. |
| BillingHandoffAudit | `equipment-rental-billing-handoff-audit` | `audit_log` | `id` | Map aggregate/action metadata; missing actors remain reconciliation warnings. |
| ActivityCode | `equipment-rental-activity-codes` | `activity_codes` | `id` | Preserve code/name and detect case-insensitive duplicates. |
| CostCode | `equipment-rental-cost-codes` | `cost_codes` | `id` | Preserve code/name and detect case-insensitive duplicates. |
| WorkDescription | `equipment-rental-work-descriptions` | `work_descriptions` | `id` | Map `requiresRemarks`; validate optional code uniqueness during import. |
| Equipment masters | catalog master keys | equipment master tables | `id` | Import IDs/names; SQL audit metadata exceeds some current TypeScript models. |
| RentalStatus | `rental-status-master` | `rental_statuses` | `id` | Reconcile current master IDs with deterministic reference seed IDs. |
| Maintenance | `maintenance_records` | `maintenance_records` | `id` | Migration 007 preserves readings, schedule/completion dates, technician, remarks, and status. |
| DailyLog | `equipment-daily-logs` | `equipment_daily_logs` | `id` | Migration 007 preserves equipment/operator/project identity, date, readings, hours, and remarks. |

Key findings: current JavaScript numbers require decimal-safe string conversion at the loader boundary; Local Storage timestamps are strings or epoch milliseconds while PostgreSQL uses `date`/`timestamptz`; embedded evidence becomes relational child rows; SQL audit/version/deletion columns are future persistence metadata; nullable DEUR line and snapshot references exist only for explicit legacy compatibility.
