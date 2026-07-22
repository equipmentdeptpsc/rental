# Remote Repository Development Guide

New remote repositories should normally require fewer than 100 lines:

1. Define an asynchronous feature read contract using `RemoteQueryOptions` and `RepositoryResult`.
2. Extend `RemoteRepositoryBase` and inject the provider client plus `RemoteCore` from the composition root.
3. Declare only supported capabilities.
4. Select explicit columns and apply normalized ordering/paging.
5. Call `read()` for safe reads; never duplicate error or retry logic.
6. Map each row with `createRemoteRowReader`, then construct the existing domain type.
7. Return defensive copies.
8. Register the repository in the composition root behind an explicit source flag.
9. Add query, mapping, cancellation, capability, Context, and Local Storage compatibility tests.

Repositories must not read environment variables, create Supabase clients, log credentials, depend on React, silently fall back, retry writes, or move business validation out of existing services.

Filtering is reserved in `RemoteQueryOptions.filters`; a feature must define a typed filter shape before using it. Paging uses non-negative `offset` and positive `limit`. Ordering is an ordered list of `{ field, ascending }` entries. Repositories must allowlist provider column names rather than accepting arbitrary UI strings.
