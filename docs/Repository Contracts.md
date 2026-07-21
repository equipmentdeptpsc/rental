# Repository Contracts

## Core interfaces

- `ReadRepository<T>`: `getAll`, `getById`.
- `WriteRepository<T>`: `create`, `update`, `delete` with optional expected-version metadata.
- `CrudRepository<T>`: composed read/write contract.
- `PagingRepository<T>`: cursor or offset paging.
- `SoftDeleteRepository<T>`: deleted lookup, restore, permanent delete.
- `RepositoryMigration<T>`: explicit from/to schema migration.
- `RepositoryTransactionPort`: prepare, commit, rollback.

Operations use `RepositoryOperation<T>` so current synchronous adapters and future asynchronous adapters share a vocabulary. Existing application services remain unchanged until adapter injection is introduced at composition roots.

## Behavioral requirements

Repositories must return defensive copies, keep stable identities, preserve immutable snapshots/audit fields, reject stale expected versions, expose deterministic paging, normalize legacy storage without silent data loss, and distinguish transport failures from domain rejection.

Deletes remain domain-specific: repositories with existing soft delete retain it; accounting and immutable audit records must not gain destructive behavior merely to satisfy CRUD naming.

## Schema envelopes

The preferred envelope is `{ schemaVersion, records, metadata }`. Legacy arrays remain readable as source schema version zero. Migration must be explicit, idempotent, tested, and backed up before write-back. Ordinary reads must not fabricate historical relationships or monetary data.

## Catalog

`repositoryCatalog` records each application storage repository, key, current schema version, and supported future capabilities. It is metadata for migration planning—not a service locator and not a replacement for dependency injection.
