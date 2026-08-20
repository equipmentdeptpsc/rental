# MVP Release Baseline and Operational UAT Readiness

Date: 2026-08-20  
Working branch: `ui-ux-figma-improvement` at `0be5cbf` plus uncommitted closure changes  
Comparison branch: `architecture-standardization` at `3e71cbc`

## Release-baseline verification

`architecture-standardization` is the merge base and direct ancestor of `ui-ux-figma-improvement`.

- Commits unique to `ui-ux-figma-improvement`: 31
- Commits unique to `architecture-standardization`: 0
- Committed file delta: 706 files (521 added, 185 modified, 0 deleted)
- Line delta: 44,228 insertions and 2,692 deletions

The 31 commits, oldest to newest, are:

1. `b12348f` Add RBAC domain and authorization foundation
2. `3426013` Add local authentication repositories and persistence
3. `1044b72` Integrate authentication, route guards, and permission-aware navigation
4. `ff7a874` Complete RBAC authorization and user management foundation
5. `18a0fbb` Add mobile operator DEUR interface
6. `01d9cfd` Refresh master-data authorization after session changes
7. `e9a0a1f` Complete Phase C5C.2 live certification tests
8. `cc0924a` Complete Phase C5 implementation baseline
9. `2afb891` Complete Phase C7 durable realtime foundation
10. `ace02ef` Stabilize Phase C7 realtime recovery
11. `c17c9b9` Complete C7 release readiness and legacy normalization
12. `829a009` Fix Operator DEUR route hydration for multi-line rentals
13. `21a3e56` Preserve Assignment/Rental integrity and Operator navigation
14. `971b37f` Fix Operator account linkage and DEUR ownership resolution
15. `c73c5fc` Use the line release snapshot for Operator DEUR access
16. `19ce9c0` Resolve authenticated Operator for local DEUR commands
17. `a8474c1` Resolve local Customer reviews through the development outbox
18. `53c84dc` Complete Phase C11.2 Operator DEUR and Customer review fixes
19. `95a25c3` Preserve returned rental-line identity and DEUR compliance
20. `0c71432` Stabilize DEUR return lifecycle and Operator UAT workflows
21. `38e92c4` Complete Phase C12 Customer real-email UAT
22. `0fbe6a9` Complete C12 grouped-review scheduler and production readiness
23. `1ece0c0` Enforce LF for immutable Supabase migrations
24. `f2effc3` Patch non-breaking dependency vulnerabilities
25. `ce32bdf` Make C12 sequence cleanup clean-install compatible
26. `ab4727d` Add production scheduler principal provisioning boundary
27. `2ddc1f3` Add canonical RBAC catalog foundation
28. `a5f6033` Fix P7 RBAC alias expansion migration generation
29. `16dd41a` Add dual-permission comparison service
30. `587658f` Administration and dashboard UX stabilization WIP snapshot
31. `0be5cbf` UI/UX modernization WIP snapshot

Material differences are not limited to presentation. They include authentication/RBAC, User Administration, Assignment integrity, Operator access, Digital DEUR and offline/realtime synchronization, Customer and Manager review, Billing/Invoice/Collection behavior, Return/Close rules, server notification workers, Supabase migrations, deployment configuration, and extensive automated tests. UI modernization is interleaved with those functional changes in the final two commits.

### Baseline recommendation

`ui-ux-figma-improvement` should become the MVP release baseline **conditionally**. It is the only branch containing the validated lifecycle and security release train, and `architecture-standardization` has no competing commits. However, its WIP-named final commits, uncommitted closure fixes, lint debt, and incomplete operational UAT make it unsuitable for an immediate freeze.

Safest integration strategy:

1. Commit the four closure fixes and readiness documentation as a focused commit after approval.
2. Create a release-candidate branch from the resulting `ui-ux-figma-improvement` tip.
3. Review the complete 31-commit range and migration order through a pull request targeting `architecture-standardization`.
4. Because the target is a direct ancestor, prefer a reviewed fast-forward that preserves the existing commit and migration history.
5. Do not cherry-pick 31 commits individually; that adds ordering and omission risk. Use cherry-pick only if reviewers explicitly exclude a proven non-MVP commit, followed by the full regression and UAT gates again.

## Uncommitted-change audit

| File | Classification | Reason |
| --- | --- | --- |
| `src/features/dashboard/components/DashboardActionQueue.tsx` | Required MVP fix | Removes an unused import that blocked TypeScript compilation. |
| `src/features/rental/components/RentalListPresentation.tsx` | Required MVP fix | Removes two unused imports that blocked TypeScript compilation. |
| `src/features/rental/workspace/presentation/workspaceTabBadges.ts` | Required MVP fix | Copies a readonly equipment collection at a legacy mutable API boundary; no business rule changes. |
| `src/pages/OperatorDeur/index.tsx` | Required MVP fix | Removes an unused projection variable that blocked TypeScript compilation. |
| `docs/mvp-uat-closure-sign-off-2026-08-20.md` | Documentation | Records local certification evidence and outstanding gates. |
| `docs/mvp-release-baseline-uat-readiness-2026-08-20.md` | Documentation | Records this baseline, operational-readiness, residue, and release-gate audit. |

No uncommitted test-only, UI/UX-only, unrelated, or residue changes were found.

## Operational UAT automation evidence

Safe local Phase C7 browser certification passed:

- Three offline commands enqueued and persisted across browser restart.
- Per-aggregate ordering passed.
- Two tabs produced exactly one successful replay claim.
- Exactly one command execution occurred.
- Three fixtures were removed and final queue residue was zero.

Targeted lifecycle/readiness verification passed 156 of 156 tests across Equipment, Assignment, Rental, Operator access, Digital DEUR, Billing, Return, Close, C7 synchronization/recovery, fixture cleanup, and release-security contracts.

The remote cross-device scenario was not executed. The runbook requires separate authorization before remote mutations; controlled user/rental/DEUR/equipment-line identifiers and an approved frontend build were not supplied. Although `.env.local` contains test integration configuration, remote operational writes remain correctly disabled.

## Residue and cleanup audit

- Debug code: no `debugger`, TODO/FIXME/HACK, or ad-hoc runtime console debugging found.
- Console output: two intentional structured Cloudflare Worker loggers remain in `worker/runtime.ts`.
- Temporary mocks/test seeds: no `TENANT-UAT-*`, `example.invalid`, or test-fixture seed values found in runtime source.
- Feature flags: remote operational writes remain disabled. Local/Supabase persistence and equipment-status source switches are active configuration, not proven stale flags.
- Local persistence: active theme, sidebar, authentication, repository, notification, review, and offline-queue storage paths are referenced. No key was proven obsolete; destructive key cleanup was not attempted.
- Routes: all configured routes resolve to imported pages. Development email/review outbox routes are intentional restricted settings routes, although they are not primary navigation entries.
- Generated artifacts: `dist` and `node_modules` are ignored and untracked. The Worker dry-run directory was removed after verification. One tracked UAT billing-statement PDF exists under `output/pdf`; its history identifies it as an intentional release artifact.
- Working tree after automation: only the four required fixes and two documentation reports are present.

Repository-wide lint is not clean: 495 errors and 30 warnings. The failures are broad pre-existing debt across runtime and tests (including explicit `any`, React fast-refresh boundaries, hook rules, and unused test variables). They were not auto-fixed because that would be an unrelated, high-churn refactor. TypeScript, focused tests, full tests, and builds remain passing.

## Preview and deployment readiness

- Vite application build: passed previously.
- Server TypeScript: passed.
- Worker TypeScript: passed.
- Cloudflare Worker dry-run: packaged successfully without deployment; 25 assets, 331.73 KiB raw and 68.03 KiB gzip.
- Cloudflare UAT configuration exists as `psc-ed-uat`, but the dry run warns that an explicit environment must be selected.
- Netlify configuration points to `npm run verify`; the machine-level `npm`/`npx` shims are broken, so this exact command is not locally reproducible until npm is repaired, even though equivalent local binaries pass.
- GitHub preview/PR inspection is blocked because the configured GitHub token is invalid and sandbox network access is unavailable.
- No approved preview URL, preview build identifier, or authorization to publish was supplied.

## Final readiness recommendation

| Gate | Decision | Basis |
| --- | --- | --- |
| A. Ready to commit | **YES** | The working tree contains four minimal compile fixes and two evidence documents; tests, TypeScript, and builds pass. Human review is still required before committing. |
| B. Ready to merge | **NO** | No PR/check evidence, lint baseline is failing, remote operational UAT is incomplete, and human approval is required for lifecycle/security/billing changes. |
| C. Ready to preview | **CONDITIONAL** | Artifacts build and the Worker packages, but npm tooling, explicit UAT environment selection, credentials/connectivity, preview URL, and publish authorization are unresolved. |
| D. Ready for operational UAT | **CONDITIONAL** | Local queue/replay and lifecycle readiness pass; remote-write authorization, controlled fixtures/build, cross-device execution, and cleanup evidence remain required. |
| E. Ready to freeze MVP | **NO** | Preview verification, operational UAT, PR checks, release-baseline approval, lint disposition, and human sign-off remain open. |

