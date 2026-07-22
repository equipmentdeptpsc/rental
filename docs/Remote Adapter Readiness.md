# Remote Adapter Readiness

The next adapter requires asynchronous `load`, `save`, `query`, paging/filtering, compare-and-swap with `row_version`, server timestamps, structured PostgreSQL error mapping, transaction commands, idempotency keys, retry classification, abort signals, and offline/outbox compatibility.

Current `RepositoryOperation<T>` already admits `T | Promise<T>`, but `PersistenceAdapter` and `RepositoryStorage` are synchronous. Most feature repositories and Context initializers synchronously read arrays, so swapping the adapter alone is unsafe. A proof of concept should introduce a separate asynchronous read-only port for one low-risk repository, keep Local Storage authoritative, and adapt one Context loading state without converting the application wholesale.

Error mapping must preserve PostgreSQL SQLSTATE, constraint name, operation, aggregate identity, recoverability, and recommended action. `23505` maps to conflict, `23503` to invalid reference, `23514` to domain validation, serialization/deadlock/network failures to classified retry, and compare-and-swap zero-row updates to optimistic concurrency conflict. Writes requiring multiple aggregates must call trusted transaction commands rather than sequential client operations.

Abort/cancellation belongs on queries and synchronization requests. Idempotency keys belong on commands/outbox records, not ordinary reads. Server timestamps become authoritative while local timestamps remain source evidence during offline reconciliation.

Phase 11B validates this direction for Equipment Status only: a separate async read port, singleton browser client, explicit composition flag, cancellation, loading/error/retry states, row validation, and SQLSTATE mapping. It does not validate remote writes, transactions, authentication, tenant scoping, or operational aggregate performance.
