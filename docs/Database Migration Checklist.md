# Database Migration Checklist

- [ ] Disposable PostgreSQL version matches the intended hosted version.
- [ ] Migrations 001–006 execute in order with `ON_ERROR_STOP`.
- [ ] Deliberate transaction failure leaves no partial schema.
- [ ] Clean reset and full reinstall pass.
- [ ] Catalog validation and deterministic seeds pass.
- [ ] Export manifest checksums and counts pass.
- [ ] Malformed repositories are resolved or explicitly rejected.
- [x] Maintenance and Daily Log normalized target design executed in migration 007.
- [x] PostgreSQL 17.10 clean install, rollback, reinstall, seed, fixture, and restore rehearsals passed.
- [ ] Parent-first transformations report no unresolved foreign keys.
- [ ] Snapshot hashes match exported evidence.
- [ ] Billing and invoice projections match persisted historical values.
- [ ] All reconciliation queries return no unapproved exceptions.
- [ ] Constraint and representative workflow tests pass on PostgreSQL.
- [ ] Backup/restore and adapter rollback rehearsals pass.
- [ ] Supabase project, credentials, RLS, authentication, and remote adapter are separately approved.
