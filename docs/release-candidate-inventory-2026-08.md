# Release Candidate Inventory — 2026-08

Release candidate: `release-candidate-mvp-2026-08` (`e108cb0`)

Baseline: `architecture-standardization` (`3e71cbc`)

Audit date: 2026-08-20

## Executive summary

The release candidate is a direct descendant of `architecture-standardization`. It is 32 commits ahead and zero commits behind, so there is no two-sided branch divergence. The candidate is a broad MVP release train rather than a UI-only increment: it introduces authentication and RBAC, User Administration, Assignment and Rental integrity controls, Digital DEUR and offline/realtime synchronization, Billing and review workflows, database migrations, notification workers, and dashboard/UI modernization.

## 1. Total commits since architecture-standardization

- Total unique release-candidate commits: **32**
- Commits unique to `architecture-standardization`: **0**
- Merge base: `3e71cbc1246165c6fa29edc1f45a62928f30dcc6`
- Release-candidate tip: `e108cb0ea2eca1d75562166777b92a2532b6296f`
- Commit period: 2026-07-28 through 2026-08-20

The release train comprises RBAC/authentication foundation, Operator DEUR, Phase C5/C7/C11/C12 lifecycle work, operational recovery, production-readiness migrations, administration/dashboard UX stabilization, UI modernization, and the final MVP UAT closure commit.

## 2. Files changed

- Files changed: **708**
- Files added: **523**
- Files modified: **185**
- Files deleted: **0**
- Insertions: **44,399**
- Deletions: **2,692**

Top-level distribution:

| Area | Files |
| --- | ---: |
| `src` | 334 |
| `tests` | 240 |
| `supabase` | 84 |
| `docs` | 23 |
| `server` | 11 |
| `worker` | 4 |
| `scripts` | 2 |
| Root configuration and metadata | 10 |

Within `src/features`, Rental is the largest change surface at 151 files, followed by Auth at 30, Reports at 12, Equipment at 11, Masters at 11, Administration at 9, Dashboard at 6, and Assignment at 4.

## 3. Features added

- Local and remote authentication providers, sessions, login routing, protected routes, and permission-aware navigation.
- User Administration for identities, roles, account status, Operator linkage, audit history, and protected administrator invariants.
- Mobile Operator workspace and Digital DEUR workflow.
- Assignment and multi-line Rental preparation commands with integrity validation.
- Rental workspace expansion covering DEUR, Billing, Invoice, Collection, Return, and Close readiness.
- Customer and Manager review workflows, grouped Customer review, correction handling, and public review credentials.
- Offline operational command queue, replay coordination, event ordering, realtime/polling recovery, and cross-tab synchronization.
- Notification outbox, trusted delivery worker, retry policy, scheduler, Resend provider, and Cloudflare Worker runtime.
- Dashboard action queue, fleet-utilization projections, enhanced reports, responsive UI foundations, and navigation modernization.
- Additional master data for idle reasons and equipment subcategories.

## 4. RBAC changes

- Added canonical users, sessions, roles, permissions, and role-permission domain models.
- Added authentication and authorization services, route guards, mutation assertions, and permission-aware navigation.
- Added canonical role and permission catalogs with schemas and generated migration support.
- Added User, Role, Permission, and Audit Trail administration pages.
- Added dual-permission comparison and local-to-canonical permission delta reporting.
- Added Operator-persona policies and canonical User-to-Operator linkage.
- Added protected-role invariants, including retention of an active System Administrator.
- Added remote current-user authorization, user-profile policy helpers, tenant read helpers, and `users.manage` catalog parity.
- Added authorization coverage for Assignment creation, Rental preparation, current Operator work, financial evidence, and Operator auxiliary reads.

## 5. Billing changes

- Added remote Billing commands, statement-number correction, duplicate classification, and recovery contracts.
- Expanded billing calculation terms and rate-engine behavior for DEUR-backed charging.
- Added rental-line-aware billing statement generation and multi-line Billing support.
- Added Billing readiness/blocker resolution and guided Rental-to-Billing handoff.
- Added Billing workspace drafts, preview, statement consumption, Invoice preparation, and Collection projection.
- Preserved Customer review and DEUR evidence through Billing and Invoice presentation.
- Added financial-evidence authorization and Billing read-policy coverage.
- Added return/financial-close validation to prevent closing incomplete or ineligible rentals.

## 6. DEUR changes

- Added the Operator Digital DEUR interface with account, assignment, rental-line, shift, work-description, and meter validation.
- Added canonical DEUR creation, event state machine, submission validation, acknowledgement, rejection, correction revisions, and review lifecycle.
- Added commercial and operational snapshots to preserve release-time facts.
- Added multi-equipment and multi-line DEUR identity resolution.
- Added idle reason, meal break, breakdown, hour-meter, odometer-trip, completion-evidence, and shift-window handling.
- Added offline queueing, optimistic projection, durable replay, idempotency, lock coordination, event ordering, and realtime recovery.
- Added Customer and Manager review generation, public credentials, correction work items, grouped review, delivery, and notification evidence.
- Added DEUR completeness, event-closure, tenant-fill, read-policy, release-readiness, and snapshot-enforcement database controls.
- Added return readiness and compliance behavior for acknowledged, corrected, returned, and billed DEUR records.

## 7. Dashboard changes

- Added a consolidated dashboard view model.
- Added an operational action queue for exceptions requiring attention.
- Added fleet-utilization calculations and equipment leaderboard support.
- Updated equipment category and status charts.
- Added KPI, status, workflow, empty-state, and responsive presentation components.
- Modernized dashboard navigation, cards, spacing, dark-mode presentation, and responsive behavior.

## 8. Persistence changes

- Preserved repository boundaries while adding local and remote repository contracts.
- Added local authentication/user schemas and backward-compatible Local Storage handling.
- Added repository catalogs and migration/offline/remote persistence contracts.
- Added local and remote Equipment Status reads.
- Added Supabase read repositories and command repositories for DEUR, Assignment, Rental preparation, reviews, and operational events.
- Added IndexedDB offline operational command persistence with in-memory fallback.
- Added versioned DEUR persistence, replay cursors, conflict handling, applied-operation tracking, and synchronization health/lock state.
- Added trusted server-side notification persistence and Cloudflare Worker configuration.
- Remote operational writes remain feature-gated; local persistence remains available for the MVP.

## 9. Migration changes

- Added **84 ordered Supabase migrations**, numbered from `20260728000100` through `20260803008300`.
- Migration groups cover remote reads, DEUR and operational commands, tenant isolation, mutation functions, command/security hardening, Rental lifecycle, Billing, recovery, Customer/Manager review, notifications, realtime publication, UAT cleanup, legacy normalization, grouped review, scheduler principals, canonical RBAC, Assignment creation, Rental preparation, and scoped authorization.
- Migration immutability was reinforced through `.gitattributes` and LF normalization.
- Clean-install and dependency-order corrections were added for sequence cleanup, Customer email cleanup, grouped-review finalization, and scheduler variables/schema.
- The migration train is forward-ordered and interdependent. Selective omission or reordering is unsafe.

## 10. Security changes

- Added authenticated route guards and permission checks at navigation, UI action, service, repository, RPC, and database-policy boundaries.
- Added tenant-aware operational commands and read policies.
- Hardened PostgreSQL function search paths, permission views, role policies, command lookup, and security-definer behavior.
- Added idempotency, event-closure, version, assignment, rental-line, Operator ownership, and snapshot validation.
- Added public review credentials and separated trusted notification processing from browser-accessible data.
- Added dedicated non-human scheduler principals with least-privilege permissions.
- Added authorization matrices and integration coverage for missing, inactive, cross-tenant, and unauthorized identities.
- Added cleanup and residue controls intended to remove only explicitly scoped UAT fixtures.

## 11. Risks

### High

- The 84-migration sequence is large and interdependent. A production-like rehearsal, baseline verification, and immutable checksum review are required before release.
- Operational UAT remains incomplete for the approved cross-device remote-write scenario, including replay, realtime reconciliation, identity/tenant isolation, and second-pass zero cleanup.
- Authentication, authorization, Billing, persistence, and lifecycle behavior changed in the same release train; these require human approval and preview verification.

### Medium

- The final UI and Administration commits retain WIP-style messages, making scope review more important even though automated tests and builds passed.
- Repository-wide lint remains non-clean, with broad pre-existing errors and warnings. This is not a current build blocker but weakens static-quality assurance.
- Local and remote persistence modes increase configuration and parity risk.
- Notification delivery depends on external Supabase, Resend, scheduler, and Cloudflare configuration.
- Large frontend bundles generate non-blocking chunk-size warnings.
- Machine-level npm/npx tooling was broken in the audited environment, although repository-local test, TypeScript, and build binaries passed.

### Low

- Development email and Customer review outbox routes remain available behind Settings permissions for local workflows.
- A tracked UAT Billing Statement PDF remains as an intentional release artifact.

## 12. Rollback strategy

### Before deployment

1. Record the exact candidate commit, build identifiers, environment configuration, database migration head, and baseline data counts.
2. Create a recoverable release tag only after approval; do not move or overwrite existing tags.
3. Back up the target database and verify restore procedures before applying any migration.
4. Keep `VITE_REMOTE_OPERATIONAL_WRITES_ENABLED=false` until the controlled operational gate is authorized.

### Application rollback

1. Stop new operational writes and scheduled notification jobs.
2. Redeploy the last approved `architecture-standardization` artifact or other explicitly recorded previous release artifact.
3. Restore the previous environment-variable set and confirm local/remote persistence mode.
4. Verify login, read access, navigation, Equipment, Assignment, Rental, Billing, and historical DEUR visibility before reopening access.

### Database rollback

1. Do not reverse, edit, or selectively delete immutable migration files.
2. If migrations have not run, rollback is limited to the application artifact and configuration.
3. If migrations have run without destructive data effects, prefer forward-compatible application rollback only when the older application is proven compatible with the expanded schema.
4. If schema or data compatibility is not proven, restore the pre-release database snapshot into an isolated environment, validate counts and referential integrity, then perform a controlled cutover.
5. For defects that do not require full restoration, create a reviewed forward-fix migration rather than hand-editing production schema or data.

### Operational cleanup

1. Remove only release/UAT fixtures with approved tenant and identifier prefixes.
2. Run cleanup twice; the second pass must remove zero records.
3. Audit IndexedDB queues, Local Storage, Session Storage, Cache Storage, cookies, subscriptions, notification outbox/envelopes, and database fixtures.
4. Confirm scheduled jobs, remote-write flags, baseline counts, and active subscriptions return to their approved state.

### Rollback decision gate

Do not resume production writes until the rollback owner confirms application health, database integrity, authorization boundaries, queue residue, notification state, and Billing/DEUR lifecycle consistency.
