# Remote Error Handling

`mapRemoteError` is the only PostgreSQL/PostgREST classification boundary for remote repositories. It returns the established structured repository error with `code`, `message`, `context`, `recoverability`, `recommendedAction`, and a sanitized cause.

| Source | Classification |
| --- | --- |
| `42501`, HTTP 403 | Forbidden/RLS denial |
| HTTP 401, `PGRST301` | Unauthorized |
| `23505` | Conflict |
| `23503`, `23514`, `22xxx` | Validation error |
| `40001`, HTTP 429/503, network failure | Transient failure |
| `57014`, aborted signal | Cancelled |
| timeout message | Timeout |
| `42P01`, `42703`, `PGRST106`, `PGRST205` | Schema mismatch |
| anything else | Unexpected failure |

Raw provider errors never escape into React. Causes retain only diagnostic code, message, and status. Credentials, URLs, query payloads, and row data must not be placed in error context.
