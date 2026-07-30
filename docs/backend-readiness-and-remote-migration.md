# Backend Readiness and Remote Repository Migration Plan

Status: architecture baseline only. Local Storage remains active. No provider, SDK, credential, deployment, or remote runtime has been selected.

## 1. Current local architecture

The intended dependency direction is Feature → Context/Application Service → Domain Service → Repository Interface → Adapter. `createLocalApplicationDependencies` is the application composition root, but several mature features still use module-level local repository singletons. Browser persistence is centralized in `LocalStorageService`, repository adapters, authentication adapters, and backup/migration support. The sidebar collapse value is a UI preference and is intentionally outside business persistence.

The discovery catalog contains 36 persisted repository areas, plus the separately versioned auth users and session stores: Equipment, history and audit; Assignment; Rental, lines, contracts and audit; DEUR and shift windows; Billing Statement, Collection, legacy billing and billing handoff audit; Customer, Project, Operator and User link; Maintenance and Daily Log; Activity/Cost/Work Description; Prefix; eight Equipment masters; and Rental Status. Development approval/customer-review outboxes and manager-approver configuration are also cataloged.

Direct coupling classification:

| Location | Classification | Decision |
|---|---|---|
| `core/storage/LocalStorageService` | repository implementation | allowed |
| local repositories and auth repositories | repository/session implementation | allowed |
| `settings/services/applicationBackupService` | migration/compatibility | allowed until migration tool replaces it |
| `rental/deur/synchronization/deurChangeNotifications` | local adapter notification | allowed only in local mode |
| `app/AppLayout` sidebar key | UI preference | allowed; never migrate |
| Equipment `AuditContext` | defect in Context | removed; repository injected |
| module-level repository singletons | migration debt | move into repository bundle incrementally before remote cutover |

No business page or domain service directly uses `localStorage` or `sessionStorage` after the audit fix. The architecture test guards pages, Contexts, components, domain services, and application services.

## 2. Persistence inventory

All current schemas are catalog version 1 unless the adapter has an internal envelope version. IDs below are stable application UUID/string IDs; display numbers are never keys. Most legacy records have inconsistent optional timestamps and no durable concurrency version—normalization is required before import.

| Domain / supporting record | Current key | Identity and relationships | Remote behavior / sensitivity |
|---|---|---|---|
| Users / credentials | `equipment-rental.auth.v1.users` | user ID; roles; optional `operatorId` → Operator | shared; security-sensitive; no credential material in migration logs |
| Session | `equipment-rental.auth.v1.session`; legacy `auth_user`, `auth_token` | session ID/user ID | remote session authority; sensitive/revocable; legacy import is compatibility-only |
| Roles / permissions | embedded frozen catalog and User linkage | role/permission code | server-authoritative; configuration cache may subscribe |
| Operators / User link | `operators`; `equipment-rental-operator-user-links` | operator ID; unique active user/operator linkage | shared/realtime for assignments; personal data |
| Customers / Projects | `customer_records`; `projects` | project → customer | shared; project code unique; customer contact data sensitive |
| Equipment | `equipment-records` | equipment ID; asset number; master FKs | shared/realtime; soft delete; status writes participate in rental transactions |
| Equipment masters | `equipment-types`, `equipment-models`, `equipment-brand-master`, `equipment-category-master`, `equipment-condition-master`, `equipment-location-master`, `equipment-ownership-master`, `equipment-status-master`, `equipment-prefixes` | ID/code, prefix relationships | shared, low frequency; subscribe by catalog version |
| Assignments | `assignments` | assignment ID; equipment/operator/project | shared/realtime; exclusivity constraints; atomic with rental/return |
| Rentals / contracts | `equipment-rental-records`; `equipment-rental-contracts` | rental ID; customer/project; contract → rental | shared/realtime; number unique; commercial snapshots immutable |
| Rental Equipment Lines | `equipment-rental-equipment-lines` | line ID; rental/equipment/operator | shared/realtime; unique rental/equipment; commercial snapshot immutable |
| Rental / Equipment audit | `equipment-rental-audit-events`; `equipment-audit-logs`; `equipment-history-records` | event ID; aggregate IDs | append-only, retained; shared; actor-sensitive |
| DEUR / shift definitions | `equipment-rental-deur`; `equipment-rental-deur-shift-windows` | DEUR ID; rental/line/equipment/operator/work date/shift | shared/realtime; optimistic version required |
| DEUR activities/revisions | currently nested/associated with DEUR | event/revision ID; source DEUR | normalize into append-only tables; server time authoritative |
| Customer review / approval | development customer-review and approval outbox keys | request/token ID; DEUR/rental | public token is sensitive, hashed at rest; realtime state |
| Billing Statements / lines | `equipment-rental-billing-statements` | statement/line IDs; rental and DEUR consumption | shared/realtime to Finance; immutable priced snapshots |
| Legacy billing / handoff | `equipment-rental-billing`; `equipment-rental-billing-handoff-audit` | billing/event ID | compatibility import; append-only audit |
| Collections / invoices | `equipment-rental-collections`; invoice currently derived/embedded | collection ID; statement/invoice | shared/realtime Finance; financial and audit-sensitive |
| Maintenance / Daily Logs | `maintenance_records`; `equipment-daily-logs` | record ID; equipment/project/operator | shared; operational subscriptions as needed |
| Cost/activity/work masters | `equipment-rental-cost-codes`; `equipment-rental-activity-codes`; `equipment-rental-work-descriptions` | ID/code | shared reference data |
| Settings / approver configuration | manager approver key and app configuration | configuration key/user IDs | server-managed; restricted write |
| Number sequences | currently feature-specific generation | sequence scope/year | new server-only aggregate; transactional and monotonic |
| Import/export metadata | backup envelope; new migration package | `importId` | append-only import registry; sensitive payload excluded from logs |

Mutable business fields vary by aggregate and are validated by existing domain normalizers. Immutable remote fields are IDs, creation/audit identity, accepted activity event facts, DEUR revisions, consumed billing evidence, and frozen commercial snapshots. Every mutable table gains `version`, `created_at`, `created_by`, `updated_at`, and `updated_by`; soft-deletable masters gain `deleted_at` and `deleted_by`.

## 3. Target architecture and repository composition

Bootstrap selects exactly one `PersistenceMode` (`local`, `remote`, or `test`) and calls one repository factory. The factory returns the complete repository bundle plus authentication/session, transaction, change-feed, clock, and diagnostics ports. Contexts receive the bundle from `ApplicationDependencyProvider`; no feature reads environment variables or constructs an adapter.

Local mode retains current adapters. Test mode supplies deterministic in-memory adapters. Remote mode will supply provider adapters which translate provider responses into `CommandResult`; SDK types stop at the adapter. The existing `RepositoryResult` remains suitable for legacy adapters. Concurrent remote aggregates use `RemoteMutableRepository`, `CommandMetadata`, typed rejections, and `ChangeFeed`.

Phase A should finish moving shared singleton repositories into `RepositoryDependencies`. This is a construction refactor only and must be done feature-by-feature with parity tests.

## 4. Canonical remote data model

Common columns: UUID `id` PK, optional `company_id`, integer `version`, actor/timestamps, and optional soft-delete columns. Initially one company is supported, but `company_id` must be present on all business rows and included in access predicates and important unique indexes.

| Entity | Required relationships | Key indexes / constraints |
|---|---|---|
| `users` | optional `operator_id` | unique active canonical username; disabled timestamp |
| `roles`, `permissions`, `role_permissions`, `user_roles` | join FKs | unique codes and join pairs |
| `operators` | company | unique active operator code; unique active User linkage where policy requires |
| `customers`, `projects` | project → customer | customer search index; unique company/project code |
| `equipment` | category/type/status and other masters | unique company/asset number; status index |
| equipment master tables | company | unique active company/code |
| `assignments` | equipment/operator/project/rental line | partial unique active equipment; approved operator exclusivity |
| `rentals` | customer/project | unique company/rental number; status/date index |
| `rental_equipment_lines` | rental/equipment/operator/assignment | unique rental/equipment; active equipment commitment constraint |
| `deurs` | rental/line/equipment/operator | unique line/work-date/shift active identity; status index |
| `deur_activity_events` | DEUR, actor | unique DEUR/event sequence; ordered accepted-server-time index |
| `deur_revisions` | source DEUR | unique source/revision number; append-only |
| `customer_review_requests` | DEUR/revision | one active request per policy; unique token digest; expiry index |
| `billing_statements` | customer/rental | unique statement number |
| `billing_statement_lines` | statement/rental line | statement index; immutable priced evidence |
| `billing_line_deurs` | line/DEUR | unique DEUR consumption |
| `invoices`, `collections` | statement/invoice | unique invoice number; idempotent collection reference |
| `maintenance_records`, `daily_logs` | equipment and operational FKs | equipment/date and operator/date indexes |
| `audit_events` | actor/company/aggregate | append-only aggregate/version and occurred-time indexes |
| `number_sequences` | company/scope/year | unique company/scope/year; locked atomic increment |
| `migration_imports` | company/actor | unique source fingerprint/import ID |

Foreign keys use restrict by default. Historical/audit facts are never cascaded. Retention is policy-driven; auth/session/token data expires, financial and audit evidence follows statutory retention. Public tokens are stored only as a cryptographic digest.

## 5. Transaction boundaries

| Workflow | Atomic writes | Locks, idempotency, and compensation |
|---|---|---|
| Rental create | rental, lines, equipment commitments, assignments, audit, number | unique commitments + sequence lock; create command key; reject wholly |
| Rental activate | rental/line/equipment statuses, audit | expected aggregate versions; retry refresh on conflict |
| DEUR activity command | DEUR, activity event/projection, audit | DEUR version + unique command ID; server timestamp; never overwrite |
| Submit/revise DEUR | revision/status, review request, audit | source version + revision uniqueness; revoke newly issued token on compensation |
| Customer acknowledge | review consumption, DEUR eligibility, audit | token row lock/one-time consume; generic public failure |
| Line/full return | lines, equipment, assignments, rental, readiness, audit | lock rental and affected lines in stable ID order; all-or-nothing |
| Billing create | statement/lines, DEUR consumption, sequence, audit | unique DEUR consumption + idempotency; delete uncommitted statement if nontransactional |
| Invoice/collection | invoice/collection, balance/status, audit, sequence | amount/version validation; idempotent reference; reverse via compensating record, never erase |

If a provider cannot supply transactions and constraints for these boundaries, it is not eligible for command-side use. Compensation is a disaster fallback with explicit `MANUAL_RECONCILIATION`, never an ordinary substitute for atomicity. UI receives typed conflict, validation, forbidden, not-found, or retryable failure and refresh guidance.

## 6. Concurrency, uniqueness, and idempotency

Every mutable aggregate uses compare-and-swap `expectedVersion`; accepted writes atomically increment `currentVersion`. Idempotency records bind company, actor, command type, key, request hash, result, and expiry. Reuse with the same hash replays the result; reuse with another hash is rejected. Critical database constraints are: active username; asset number; project/rental/statement/invoice numbers; operator linkage; active assignment commitments; rental/equipment line; DEUR shift identity and revision sequence; active/one-time review token; DEUR billing consumption; command key; and sequence scope.

## 7. Authentication and authorization

Canonical User ID comes from the server session, never a client payload. Remote authentication supports local credential identity and future external identity links without changing AuthContext. Sessions require rotation, expiry, restoration, logout/revocation, disabled-user checks, and secure transport/cookie storage appropriate to the chosen provider. Role permissions and `operatorId` are loaded server-side. Every command independently enforces permission, company scope, Operator ownership, Rental Line access, and current linkage. Client permissions control presentation only.

Public review endpoints accept an expiring, revocable, single-purpose token; return only the targeted DEUR/revision and necessary evidence; and exclude unrelated lines, rates not intended for review, internal users, and other customers.

## 8. Realtime subscriptions

Operator scope: own canonical identity, active assigned lines, DEURs, and assignment/rental changes. Rental Workspace: one rental, all lines, DEUR/review/billing/return changes. Finance: billing-ready DEURs, statements, invoices and collections. Management: read-only summaries, metrics and exceptions.

Every event uses `AggregateChangeEvent`. Subscription authorization is evaluated server-side and rechecked after role/link changes. Clients persist the last event cursor, reconnect with backoff, catch up from the cursor, deduplicate by `eventId`, apply only higher aggregate versions, buffer short out-of-order gaps, and perform full aggregate refresh when retention has expired or gaps remain. Providers must document retention, payload/rate limits, backpressure, and disconnect semantics.

## 9. Offline commands and clock policy

Operator devices queue `OfflineCommandEnvelope` for shift/activity/submission/correction commands. Replay is ordered by device sequence but accepted server order is authoritative. Success removes or archives the command; duplicate returns its prior result; stale version, inactive line, changed ownership, submitted DEUR, or activity conflict pauses the dependent queue for user reconciliation; transient network errors back off; permanent authorization errors never retry silently.

Server acceptance time orders events. Client time is evidence for skew analysis only. The server rejects/flags excessive skew and overlapping transitions. Durations derive from accepted ordered events. A device may display a projected timer from the last accepted event, but reconnect replaces projection with server state. Offline proposed intervals are normalized against preceding accepted state and must be explicitly reconciled on overlap.

## 10. Number generation

UUIDs are generated independently from display numbers. Asset, project, rental, assignment/loading (if enabled), DEUR, statement, invoice, and collection references have explicit company/scope/year sequence rows. Reset policy is configuration per number type; gaps are tolerated after rollback; uniqueness is mandatory. The server locks/increments sequence and creates the record in one transaction. Record-count-plus-one is forbidden.

## 11. Local-to-remote migration

Export a read-only, versioned package and local backup. Dry-run normalizes through domain rules, inventories keys, fingerprints the dataset, validates IDs, uniqueness, references, snapshots, DEUR events/revisions and billing links, and emits errors/warnings/counts. Import order is masters → users/operators/customers/projects → equipment → assignments → rentals/contracts/lines → DEUR/events/revisions → reviews → billing/invoices/collections → maintenance/logs → audit/history. Each stage is one server transaction or an unpublished staging batch; final publish is atomic. `migration_imports` prevents replay. Stable IDs, display numbers, snapshots and evidence are preserved. Local Storage is never automatically deleted.

Rollback before publish discards staging. After publish, disable remote writes, restore the verified server backup or run audited inverse migrations, and return clients to the retained local build/export only after reconciliation; never attempt silent dual-authoritative rollback.

## 12. Security

Require server authentication/authorization, company isolation, ownership checks, schema/domain validation, least privilege, TLS, provider-supported encryption at rest, rate limits, replay protection, idempotency, safe errors, tamper-evident audit, backups and tested recovery. Minimize personal/financial data and define retention/deletion policy. Logs exclude credentials, session/public tokens, token digests, and raw sensitive payloads.

## 13. Observability

Structured operations include request/command/correlation ID, safe user/operator and aggregate IDs, expected/current version, failed stage, stable error code, retryability, server time, adapter name, latency, and compensation outcome. Metrics cover conflicts, retries, subscription lag/gaps, queue depth/age, token failures, transaction rollbacks, sequence contention, import failures, and authorization denials.

## 14. Provider selection criteria

Score candidates using transactional/constraint strength, optimistic concurrency, server-side authorization, identity federation, realtime authorization/catch-up, offline transport support, migration/export portability, local development/testing, observability, backup/PITR, regional availability/latency, data residency, operational skills, lock-in, predictable cost, and recovery objectives. A provider failing atomic command or server authorization requirements is eliminated regardless of convenience.

## 15. Phased roadmap and exit criteria

1. **A — readiness:** finish repository bundle coverage, remove guarded-layer storage access, finalize contracts/tests. Exit: architecture guards and parity suite green.
2. **B — provider/schema/read path:** select provider by scored decision, create schema and auth/session/read adapters. Exit: isolated test environment, server authorization tests, read parity.
3. **C — commands/realtime:** implement atomic command API, DEUR concurrency and feeds. Exit: conflict/idempotency/transaction/fault tests plus reconnect catch-up.
4. **D — migration/dual validation:** build dry-run/import, observability, compare local versus remote projections without dual writes. Exit: repeatable representative import with zero unexplained differences.
5. **E — offline/multi-device UAT:** implement encrypted queue and reconciliation. Exit: two physical devices pass disconnect, replay, conflict, ownership and clock-skew scenarios.
6. **F — cutover:** backup, migration freeze, import, verification and controlled enablement. Exit: recovery drill, monitoring, acceptance sign-off, explicit local fallback retention decision.

## 16. Physical-device UAT entry criteria

Use a nonproduction tenant with sanitized data; server authorization and ownership tests green; migrations repeatable; command atomicity/idempotency verified; subscriptions catch up after disconnect; offline queue encrypted and inspectable; clock-skew and conflict UX implemented; two distinct canonical users/operators; audit/metrics alerts active; backup restore rehearsed; rollback owner and decision window documented.

## 17. Local retest and rollback

For this architecture-only milestone: run architecture/contracts/composition/persistence tests, auth/RBAC, multi-equipment, DEUR lifecycle, billing compensation, typecheck, production build, full suite, and `git diff --check`. Locally confirm Equipment audit loads and appends after reload and sidebar preference remains unchanged. Runtime remains local; rollback consists of reverting the audit repository injection and contract/doc additions, with no data conversion required.

## 18. Phase C1 — server-authoritative Digital DEUR commands

Phase C1 introduces `DeurCommandRepository` beneath the Operator application flow. The composition root selects `LocalDeurCommandRepository` in Local Mode and `SupabaseDeurCommandRepository` in Remote Mode. UI and domain modules contain no Supabase imports, RPC names, provider errors, or environment selection. The Operator read model uses the provider-neutral read bundle and explicitly reloads the DEUR/line/shift projection after every accepted remote command; Realtime and polling are not used.

The transactional RPC boundaries are:

| RPC | Responsibility |
|---|---|
| `command_start_deur_shift` | Resolve session/User/Operator, validate Rental/Line/Assignment, reserve DEUR number, create DEUR and initial events, audit and store idempotent result |
| `command_transition_deur_activity` | Lock and compare version, close the open primary event, append ordered end/start events, increment version, audit and persist result |
| `command_complete_deur_shift` | Validate ownership/version/evidence, close open activity and shift, persist server completion evidence, audit and persist result |
| `command_submit_deur` | Require completed/no-open-event evidence, compare version, submit, audit and persist result |

All four functions derive the actor from `auth.uid()`, load the active application User, permissions and `operator_id`, and validate the complete Rental → Line → Equipment/Operator/Assignment ownership chain. Browser-supplied User IDs, roles and permissions are absent from command inputs. RLS limits direct reads; direct authenticated writes to DEUR/event tables are revoked. Complex authorization and lifecycle invariants are enforced again inside the command transaction.

Idempotency is scoped to authenticated actor and key. The stored command type and SHA-256 payload hash must also match. Exact retries return the committed response with `REPLAYED`; changed payloads return `IDEMPOTENCY_MISMATCH`. Only successful commands create reusable records. Retention defaults to 30 days and can be adjusted by operational policy.

DEUR `row_version` is the compare-and-swap token. Conflicts return aggregate ID, expected/current versions and `refreshRequired`. Events use `clock_timestamp()` as authoritative acceptance/order time and retain client time only as evidence. Open-event partial unique indexes prevent overlapping primary activities, and active DEUR indexes protect the Rental Line/work-date/shift and Equipment boundaries.

Remote authentication uses Supabase sessions and application User profiles. Remote login explicitly requests **Email** (Option A); Local Mode retains username credentials. No public username discovery is performed. Refresh restores canonical roles, permissions and Operator linkage. Existing authorized landing policy remains in the shared Login flow.

Detailed lifecycle calculations remain TypeScript domain responsibilities. SQL enforces minimum safety invariants: lifecycle state, ownership, open intervals, meter presence, completion and version. This avoids duplicating the complete calculation engine while preventing unsafe persisted states.

Known limitations and Phase C2 prerequisites:

- No Realtime, offline replay, customer acknowledgement, corrections, returns, closure, billing or collection writes.
- Tenant/company columns are not yet present. Current RLS is Operator/permission scoped; production is blocked until tenant scoping is added and tested.
- Remote Odometer checkpoint/location persistence needs a dedicated command before physical-device UAT for mileage Rentals.
- Live integration requires a disposable Supabase project, all migrations applied in order, seeded Auth/application Users with role/Operator links, two physical Operator identities, RLS/RPC verification, concurrent-device conflict tests, and audit/idempotency inspection.
- Rollback before production is code/config reversion to `VITE_PERSISTENCE_MODE=local`. Migration rollback in a disposable environment drops the Phase C1 functions/policies/indexes/table/columns only after export verification. Never remove accepted production events without an approved data migration.
## Phase C2: tenant-scoped operational commands

Phase C2 introduces `company_id` as the one canonical remote tenant identity. Existing
remote rows are assigned to `TENANT-LOCAL-001` during migration; Local Storage payloads
are not rewritten and continue to use their established single-company compatibility
model. A later live migration must replace the compatibility company with the approved
business company before multi-company access is enabled.

The application command composition now exposes provider-neutral repositories for
customer review, DEUR correction revisions, meter checkpoints, line/full return, and
closure/readiness. Supabase details remain isolated in the adapter. Existing Local Mode
UI paths still call their established domain services, so Phase C2 does not alter Local
runtime behavior.

Tenant isolation is enforced twice: RLS limits authenticated reads to
`current_company_id()`, and every security-definer command resolves the company from
`auth.uid()` and validates the target chain. The browser cannot select a company.
Controlled lifecycle tables revoke direct authenticated writes.

Customer-review requests store SHA-256 token hashes, expiry, revocation, consumption,
and the exact DEUR revision. The raw 256-bit token is returned once by request creation,
never written to audit data, and public access is limited to narrowly granted functions.
Invalid, expired, revoked, consumed, or superseded tokens share one generic response.

Corrections create a new immutable revision, revoke active review requests for the old
revision, and require a new review. Meter checkpoints reuse the DEUR evidence model,
enforce monotonic non-negative readings, and reject post-submission edits. Line return
locks and transitions only its equipment and assignment; Return All validates the
whole rental transaction before reporting success. Closure readiness is recalculated
server-side and closure ignores client readiness claims.

Authenticated commands carry command and idempotency identities plus expected versions
where applicable. Phase C1's stored-result model remains the canonical design. The C2
SQL lays down conflict checks and tenant-scoped idempotency uniqueness; completing
stored-result handling for every C2 function is required before live UAT.

The optional live test harness is Node-only and disabled by default. It requires
`RUN_SUPABASE_INTEGRATION_TESTS=true`, all `SUPABASE_TEST_*` values, and an explicitly
test-like URL and environment identifier. The service key is never a `VITE_*` value.

Recommended migration order is the existing foundation, Phase B, Phase C1, C2 tenant
schema, then C2 mutation functions. Rollback should revoke the new function grants
first, restore the prior read policies, and only remove new tables/columns after data
export. No down migration is generated because deleting tenant/review evidence is not
safe automatically.

Known limitations: migrations have not run against a live Supabase instance; the Local
command bundle is a compatibility boundary while existing Local services remain wired;
public delivery/email is not implemented; C2 RPCs are not yet called by production UI;
and full idempotent stored-result replay plus exhaustive composite tenant foreign keys
must be completed and integration-tested before enabling Remote writes.

Phase C3 prerequisites are an isolated Supabase project, successful migration validation,
the controlled multi-line fixture, completed C2 idempotency/tenant-integrity constraints,
UI command wiring with explicit read-after-write refresh, and security review. Realtime,
offline replay, and Billing/Invoice/Collection writes remain out of scope.
## Phase C2H: controlled Remote write hardening

### Enablement and kill switch

Remote operational writes are controlled centrally by
`VITE_REMOTE_OPERATIONAL_WRITES_ENABLED`. Its default is `false`; Local Mode ignores
the setting and retains its existing services. Remote reads remain available while
the write repositories return `NOT_ENABLED`. There is no Local Storage fallback from
a disabled or unavailable Remote command.

This build-time flag is the first gate. A production pilot also requires a server-side
runtime kill switch so commands can be disabled without rebuilding the browser. Until
that server control and isolated database acceptance are complete, Remote operational
writes remain **NOT READY**.

### Deterministic migration order

Apply migrations lexically from `20260722000100_foundation.sql` through
`20260729000400_phase_c2h_command_hardening.sql`. Migrations are transactional, but
they are not claimed to be rerunnable. The C2H migration removes permissive Phase B
RLS policies, adds tenant relationships, validates existing rows, replaces the DEUR
number function with tenant-scoped sequencing, and introduces stored-result command
records.

Composite constraints are installed `NOT VALID` and then explicitly validated in the
same transaction. A mismatch aborts the migration without silently rewriting a
historical company. Child structures where a composite foreign key is impractical use
a tenant-validation trigger.

### Compatibility tenant acceptance

`TENANT-LOCAL-001` is marked `compatibility`, not approved. Before Remote pilot:

1. Run `erp.compatibility_tenant_report()` through an administrator/service connection.
2. Snapshot every reported table and preserve stable business IDs.
3. Create the approved company.
4. Update parent records in dependency order, then children.
5. Validate missing-company, orphan, and cross-tenant counts are zero.
6. Validate all tenant constraints and RLS using authenticated users.

Remote pilot must not begin while active business rows remain assigned to the
compatibility company without written approval.

### Recovery classification

| Migration group | Recovery classification | Required action |
| --- | --- | --- |
| Base schema and business data | Backup-restore dependent | Restore isolated-project snapshot if partially replaced outside its transaction. |
| Phase B read/RLS | Corrective forward migration | Restore intended grants and policies, then verify each role. |
| Phase C1 command functions | Corrective forward migration | Recreate known-good functions; preserve DEUR and audit rows. |
| Phase C2 tenant backfill | Data migration requiring snapshot verification | Do not drop company columns; restore snapshot or repair company assignments forward. |
| Phase C2/C2H functions and constraints | Corrective forward migration | Revoke EXECUTE first, repair functions/constraints, validate, then regrant. |

No destructive down migration is supplied. Recovery must preserve token hashes,
idempotency results, audit evidence, UUIDs, and business numbers. A rollback rehearsal
requires an isolated Supabase project and has not been executed locally.

### C2H security matrix

Expected policy:

| Actor | Tenant SELECT | Direct lifecycle writes | Operational functions | Public review |
| --- | --- | --- | --- | --- |
| Anonymous | Denied | Denied | Denied | Target-token functions only |
| Rental Operations | Own tenant/owned operations | Denied | Frozen permitted commands | No broader access |
| Finance | Own-tenant supporting reads | Denied | Operational mutation denied | Denied |
| Management | Own-tenant policy reads | Denied | Operational mutation denied | Denied |
| System Administrator | Own-tenant administrative reads | Denied | Frozen permitted commands | No broader access |
| Inactive/unlinked User | Denied or ownership-limited | Denied | Denied | Denied |
| Other-tenant User | Other tenant denied | Denied | Cross-tenant denied | Only a valid target token |

This matrix is documented expectation, not a live result. It must be executed against
the isolated project before enablement.

### Stored-result idempotency

All C2 mutation functions now call the shared begin/finish boundary. The identity is
company plus authenticated actor, or company plus review-request identity for public
decisions. Payload hashing excludes command identity and raw review tokens. A replay
returns the stored safe response, and a mismatched payload returns
`IDEMPOTENCY_MISMATCH`. Review-request creation stores a response without `rawToken`,
so only the initial accepted response contains the token.

Live concurrency validation is still required to confirm advisory locks and unique
constraints behave as designed under competing transactions.

### Integration safety

Live mutation requires all test variables plus
`ALLOW_SUPABASE_TEST_MUTATION=true`. Both the URL and project reference must be
explicitly test-like. Cleanup code may accept only `TENANT-UAT-*` fixture identities;
global truncation and compatibility-tenant cleanup are prohibited. The service key is
Node-only and must never use a `VITE_*` name.

Rate limiting is not provided by these PostgreSQL functions. Public-review endpoints
need gateway-level throttling and abuse monitoring before any external pilot.
