# Remote Retry Strategy

Retries are restricted to idempotent reads and are invoked by `RemoteRepositoryBase.read`. Writes must never use this helper.

The default policy permits two retries with 100 ms initial delay, exponential multiplier 2, and 1 second maximum delay. Only transient network/connection failures, HTTP 429/503, serialization failures, and timeouts are retryable. Authorization, RLS denial, schema mismatch, validation, conflict, and unexpected failures are returned immediately.

Every delay observes `AbortSignal`. Cancellation stops the retry sequence and returns `REPOSITORY_REQUEST_CANCELLED`. Tests inject a wait function so retry behavior is deterministic and fast. Retry logs contain repository, operation, attempt, and delay only.
