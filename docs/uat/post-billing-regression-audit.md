# UAT regression recovery audit

## Evidence and cause

- Deployed UAT application HEAD: `6c978b40a3688a283443317c2d40e47e19614582`.
- Last accepted pre-correction application HEAD: `239bb7b660877583e8dbf236fa01e86d671110d0` on `codex/uat-initial-bundle-route-lazy-loading`.
- Merge base: `eb244e5859bb47f07c8c96a241c8085a01e66cf0`. `git rev-list --count 6c978b40..239bb7b6` reports **62** commits absent from the deployed ancestry. Local UAT reflog shows the UAT branch at `ffe1f3a7` before the correction fast-forward, which explains why accepted descendants were omitted.
- The recovery merge has parents `6c978b40` and `239bb7b6`. Conflict resolutions preserve the deployed billing/auth behavior and recover the accepted UAT line. Migration files were restored to the deployed release version and are unchanged by this recovery.
- Complete missing commit list: `git log --reverse --format='%H %s' eb244e5859bb47f07c8c96a241c8085a01e66cf0..239bb7b660877583e8dbf236fa01e86d671110d0`.

| Area | Last-good commit(s) | State at deployed `6c978b40` | Regressed | Missing commit(s) | Main files | Fix required |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | `be6dfa35`, `7ddcfd4c`, `239bb7b6` | Older exception-first page and sequential collection reads | Yes | Same | `src/pages/Dashboard/index.tsx`, `src/features/dashboard/{hooks,services,components}` | Restore accepted layout/read model and overlap collection read; retain billing visibility and approval permission. |
| Equipment | `1fb0492b`, `3e15334a`, `c16ce6fa`, `ca513159`, `d57a760a` | Maintenance edit, meter policy, narrow writes and detail fixes absent | Yes | Same | `src/pages/Equipment`, `src/features/equipment` | Restore and retain current commercial meter rules. |
| Bookings | `ba532ec4`, `2a586c84`, `648c987d` | Accepted workspace/search absent | Yes | Same | `src/pages/Assignments`, `src/features/booking` | Restore list/search and retain current calendar behavior. |
| Rentals/returns/DEUR | `db1f0ec7` through `4ad65bfc` (rental and DEUR group) | Per-line return, event order, dual-meter and return-date work absent | Yes | See full Git list | `src/features/rental`, `src/integrations/supabase` | Restore with current billing lifecycle and current safe RPC diagnostics. |
| Daily Logs | `30a96c0f` | Field-work view absent | Yes | `30a96c0f` | `src/pages/DailyLogs.tsx`, `src/features/daily-log` | Restore remote view and full reads. |
| Operators | `e92bdcb6`, `60a1a4aa` | Operator PIN provisioning/narrow creation absent | Yes | Same | `src/pages/Operators`, `src/features/operators`, `worker/userAdministration.ts` | Restore narrow capability. |
| Projects | `60a1a4aa`, `0acb5ba2` | Narrow creation and permission correction absent | Yes | Same | `src/pages/Projects`, `src/features/project` | Restore gated creation. |
| Customers | `60a1a4aa` | Narrow remote creation absent | Yes | Same | `src/pages/Customers`, `src/features/customer` | Restore gated creation. |
| Billing/invoices/collections | `a5c2c7ae`, `e439ec7a`, `f5fe7e30`, `dab8a597`, `d2333e7a` | Current Operation/Idle, discount, VAT and invoice columns present; accepted invoice/collection flows absent | Partial | Same | `src/features/rental/{billing,workspace}`, `src/integrations/supabase/readRepositories.ts` | Reconcile prior flows with current correction; preserve migration compatibility. |
| Reports | `0016964d` | Lazy chart/PDF loading absent | Yes | `0016964d` | `src/features/reports`, `src/app/router.tsx` | Restore lazy loading. |
| Users/roles/permissions | `e92bdcb6`, `0acb5ba2` | Current profile dropdown/password/sign-out present; prior Operator/PIN and project permission progress absent | Partial | Same | `src/features/users`, `src/features/auth`, `worker/userAdministration.ts` | Keep current profile/auth and restore missing prior behavior. |
| Header/navigation/profile | `4fb9131e`, `0016964d` | Current auth/profile controls present; prior shell cleanup and route behavior absent | Partial | Same | `src/app/Header.tsx`, `src/app/router.tsx`, `src/shared/branding` | Reconcile shell and preserve current profile controls. |
| Loading text | `4fb9131e` and earlier copy | Architecture terms visible on UAT pages | Yes | Multiple | Page and feature display text | Replace presentation strings only. |
| Performance | `bfea51a0`, `0016964d`, `71f43c56`, `239bb7b6` | Route loading, bounded DEUR post mapping and collection overlap omitted | Yes | Same | `src/app/router.tsx`, `src/main.tsx`, `src/integrations/supabase/readRepositories.ts`, Dashboard hook | Restore without the rejected Daily Logs 6→4 read shortcut. |
| Narrow feature flags | `c16ce6fa`, `60a1a4aa`, `f0739ac5` | Current correction flags present; accepted creation/read diagnostic flags absent | Yes | Same | `.env.example`, `src/app/composition` | Combine with default-off behavior. |
| Route splitting | `bfea51a0`, `0016964d` | Eager pages returned | Yes | Same | `src/app/router.tsx`, `src/main.tsx` | Restore lazy pages, public reset route and deferred DEUR sync. |

## Copy classification

- **A, developer/internal:** TypeScript identifiers, filenames, repository interfaces, database read projection names, UAT diagnostic metadata and event keys remain technical. The audit does not rename them.
- **B, user-facing and appropriate:** Product terms such as Rental, DEUR, audit log, access permissions, and the UAT certification page remain where they explain user actions.
- **C, user-facing architecture leakage:** Loading, empty, error, help and button text in pages, feature components, hooks, runtime capability messages and presentation errors included “canonical”, “repository”, “command”, or “projection”. The wording commit replaces these with task-oriented text. The specifically reported loading state was replicated in Billing (`Loading canonical billing statements…`), Assignments, bookings and Rental pages.

## Safety boundary

No database commands, migration edits, UAT web deployment, production access, or branch merge into the deployed UAT branch are part of this recovery.

## Exact missing commits (oldest to newest)

- 2de8a4f1 fix(rental): preserve start rental inputs
- e41c9894 fix(deur): scope start uniqueness to open work
- 32d2e1df fix(assignments): stabilize assignment display identity
- d00727f4 feat(dashboard): add canonical billing visibility
- ba532ec4 feat(bookings): modernize canonical booking operations workspace
- 2a586c84 fix(bookings): align operations workspace with reference
- db1f0ec7 feat(deur): add canonical dual-meter evidence support
- 2f25f239 chore(migrations): restore authoritative uat migration history
- 0982ceb5 feat(deur): add canonical travel checkpoint domain
- 3422d22b fix(deur): repair travel checkpoint migration sql
- 1ffea722 fix(deur): align travel history authorization with canonical permissions
- ac419608 feat(deur): support beta odometer-only meter evidence
- 52bd9343 feat(deur): preserve offline activity occurrence time
- 92847063 fix corrected grouped review remediation
- a5c2c7ae fix billing panel readiness eligibility guard
- e439ec7a fix billing readiness effective DEUR events
- 8251d54c fix(deur): preserve logical event order across replacements
- 51d82f72 fix: renumber logical-order migration
- eb3cc656 fix(deur): route billing reads through canonical order
- 40ccf99a fix(deur): accept canonical supersession coverage
- d7d037d7 feat: add isolated UAT single billing fixture
- 7a9134d6 feat: add UAT billing approval control
- 94e5c94f fix: invoke UAT billing approval handler
- f5fe7e30 feat: add normal create invoice workflow
- dab8a597 feat: add canonical remote collection workflow
- fe04a691 fix: grant authenticated collection reads
- f0739ac5 chore: add opt-in UAT remote read diagnostics
- b5247f89 fix: emit UAT read diagnostics as metadata
- 5a17edf4 fix: reassert UAT collection read capability
- d2333e7a fix: scope collection reads through tenant RPC
- 1c507177 fix: route remote rental returns through canonical reads
- 1cab7e0a fix: resolve rental return date automatically
- 332f38df feat: add canonical per-line rental returns
- 8fed953c fix: show business identifiers on return cards
- 2500fdab fix: normalize legacy rental return failures
- 36f45455 fix: make rental line return identity explicit
- e8fbe8e3 fix: diagnose and correct rental line return date guard
- a59c133b fix: remove duplicate rental return audit trigger
- e92bdcb6 fix: provision operator users with PIN credentials
- 4ad65bfc fix(deur): allow pending same-day return DEUR
- 25807565 restore migration provenance for September 24-27
- d1965dc7 restore migration provenance for September 28-30
- cbbd3abb restore migration provenance for October 1-3
- 46571142 restore migration provenance for September DEUR reconstructions
- 348c3836 restore migration provenance for waiver migration and manifest
- be6dfa35 fix: align dashboard with canonical UAT reads
- 7ddcfd4c fix: refine dashboard financial and exception visibility
- 30a96c0f fix: add remote daily logs field-work view
- 4fb9131e fix: clean up application shell presentation
- 1fb0492b fix: align maintenance type with operator meters
- 3e15334a fix: harden equipment maintenance type command
- def4f1fa chore: restore certified UAT migration lineage
- c16ce6fa fix: separate equipment beta write capabilities
- ca513159 fix: expose assignment action for UAT equipment
- d57a760a fix: preserve equipment detail encoding for UAT
- 648c987d fix: expose assignment search for UAT
- 60a1a4aa feat: enable narrow UAT master data creation
- 0acb5ba2 fix: align project creation permission
- bfea51a0 Optimize initial bundle with lazy route pages
- 0016964d perf: optimize application route loading
- 71f43c56 perf: parallelize canonical DEUR post mapping
- 239bb7b6 perf: overlap dashboard collection reads
