import { repositoryFailure, type RepositoryResult } from "@/core/persistence";
import { isRetryableRemoteError } from "./errorMapper";

export interface RemoteRetryPolicy { maximumRetries: number; initialDelayMs: number; multiplier: number; maximumDelayMs: number }
export const DEFAULT_REMOTE_READ_RETRY_POLICY: RemoteRetryPolicy = { maximumRetries: 2, initialDelayMs: 100, multiplier: 2, maximumDelayMs: 1_000 };

export async function executeRemoteReadWithRetry<T>(operation: (attempt: number) => Promise<RepositoryResult<T>>, options: { signal?: AbortSignal; policy?: RemoteRetryPolicy; onRetry?: (attempt: number, delayMs: number) => void; wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void> } = {}): Promise<RepositoryResult<T>> {
  const policy = options.policy ?? DEFAULT_REMOTE_READ_RETRY_POLICY;
  const wait = options.wait ?? cancellableDelay;
  for (let attempt = 0; ; attempt++) {
    const result = await operation(attempt);
    if (result.success || attempt >= policy.maximumRetries || !isRetryableRemoteError(result.error) || options.signal?.aborted) return result;
    const delay = Math.min(policy.maximumDelayMs, policy.initialDelayMs * policy.multiplier ** attempt);
    options.onRetry?.(attempt + 1, delay);
    try { await wait(delay, options.signal); } catch { return repositoryFailure("REPOSITORY_REQUEST_CANCELLED", "Remote request was cancelled.", { context: { failureKind: "Cancelled" }, recoverability: "RETRYABLE", recommendedAction: "Retry when the request is still needed." }); }
  }
}

function cancellableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => { if (signal?.aborted) return reject(signal.reason); const timer = setTimeout(resolve, milliseconds); signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); });
}
