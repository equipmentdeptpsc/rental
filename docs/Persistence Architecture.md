# Persistence Architecture

## Boundary

Business code depends on repository capabilities, never on a storage engine. The intended flow is:

```text
UI → Context / application service → domain repository contract
→ persistence adapter → Local Storage today / server or IndexedDB later
```

`src/core/persistence` defines shared contracts for results, errors, paging, version metadata, schema envelopes, migrations, transaction preparation, and adapter I/O. Existing repositories remain synchronous local adapters; `RepositoryOperation<T>` permits a future asynchronous adapter without encoding a vendor into domain types.

## Repository categories

- Entity repositories expose read/write CRUD and domain lookups.
- Soft-delete repositories add deleted queries, restore, and permanent removal.
- Append/audit repositories expose ordered reads and append operations.
- Synchronization repositories store cursors, conflicts, locks, health, and applied-operation identities.

Specialized methods remain on their domain contracts. Capability composition avoids forcing audit logs or sync cursors into inappropriate entity CRUD semantics.

## Errors and metadata

Adapter boundaries return structured errors with `code`, `message`, `context`, `recoverability`, and `recommendedAction`. Successful remote operations may carry source, server timestamp, version/etag, and correlation identity. Domain validation errors remain domain results and must not be replaced by transport errors.

## Transactions

Transaction preparation is storage-neutral and has no side effects. Local Storage continues using established compensation. A future database adapter must implement atomic commit/rollback while preserving the same prepared mutation intent.
