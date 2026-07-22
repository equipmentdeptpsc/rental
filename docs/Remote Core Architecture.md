# Remote Core Architecture

`src/core/remote` contains persistence-provider-neutral infrastructure shared by future remote repositories. It does not contain feature types, table names, business rules, React state, or Supabase client construction.

The composition root creates configuration, the singleton browser client, a `RemoteCore`, and feature repositories. A repository extends `RemoteRepositoryBase`, declares capabilities, builds its provider query, and maps rows into its domain type. Contexts consume only feature repository contracts.

```text
Vite environment -> remote configuration validation
                            |
Composition root -> RemoteCore -> Supabase client -> feature repository
                                                   -> Context -> UI
```

The base records request count, retry count, total execution time, and mapping time. Timing is observable through `getMetrics()` and optionally emitted by the redacted logger. It is diagnostic only and does not add analytics or persistence.

Shared modules provide standardized repository results, SQLSTATE/PostgREST errors, safe-read retry, cancellation, paging, ordering, capabilities, row readers, logging, and configuration validation. Local Storage repositories remain unchanged and authoritative.
