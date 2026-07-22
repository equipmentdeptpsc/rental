import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";
import { mapRemoteError } from "./errorMapper";
import type { RemoteLogger } from "./logger";
import { silentRemoteLogger } from "./logger";
import { executeRemoteReadWithRetry, type RemoteRetryPolicy } from "./retry";
import { createRemoteCapabilities, type RemoteCapabilities, type RemoteCapability, type RemoteErrorDescriptor, type RemoteMetrics } from "./types";

export interface RemoteCore { logger: RemoteLogger; retryPolicy?: RemoteRetryPolicy; now?: () => number; wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void> }
export function createRemoteCore(overrides: Partial<RemoteCore> = {}): RemoteCore { return { logger: overrides.logger ?? silentRemoteLogger, retryPolicy: overrides.retryPolicy, now: overrides.now ?? (() => performance.now()), wait: overrides.wait }; }

export abstract class RemoteRepositoryBase {
  readonly capabilities: RemoteCapabilities;
  protected readonly metrics: RemoteMetrics = { requestCount: 0, retryCount: 0, executionMs: 0, mappingMs: 0 };
  protected constructor(protected readonly repositoryName: string, capabilities: readonly RemoteCapability[], protected readonly remoteCore: RemoteCore) { this.capabilities = createRemoteCapabilities(...capabilities); }
  getMetrics(): RemoteMetrics { return { ...this.metrics }; }

  protected async read<T>(operation: string, signal: AbortSignal | undefined, query: (signal: AbortSignal) => PromiseLike<{ data: T | null; error: RemoteErrorDescriptor | null }>): Promise<RepositoryResult<T | null>> {
    if (signal?.aborted) return repositoryFailure("REPOSITORY_REQUEST_CANCELLED", "Remote request was cancelled.", { context: { repository: this.repositoryName, operation, failureKind: "Cancelled" }, recoverability: "RETRYABLE", recommendedAction: "Retry when the request is still needed." });
    const controller = signal ? undefined : new AbortController(); const activeSignal = signal ?? controller!.signal;
    const started = this.remoteCore.now!();
    const result = await executeRemoteReadWithRetry(async () => { this.metrics.requestCount++; try { const response = await query(activeSignal); return response.error ? { success: false as const, error: mapRemoteError(response.error, { repository: this.repositoryName, operation, aborted: activeSignal.aborted }) } : repositorySuccess(response.data); } catch (cause) { return { success: false as const, error: mapRemoteError({ message: cause instanceof Error ? cause.message : "Unexpected remote failure" }, { repository: this.repositoryName, operation, aborted: activeSignal.aborted }) }; } }, { signal: activeSignal, policy: this.remoteCore.retryPolicy, wait: this.remoteCore.wait, onRetry: (attempt, delayMs) => { this.metrics.retryCount++; this.remoteCore.logger.log({ category: "retry", message: "Retrying safe remote read.", context: { repository: this.repositoryName, operation, attempt, delayMs } }); } });
    this.metrics.executionMs += this.remoteCore.now!() - started;
    this.remoteCore.logger.log({ category: "performance", message: "Remote read completed.", context: { repository: this.repositoryName, operation, executionMs: this.metrics.executionMs, requestCount: this.metrics.requestCount, retryCount: this.metrics.retryCount } });
    return result;
  }

  protected mapTimed<T>(mapper: () => RepositoryResult<T>): RepositoryResult<T> { const started = this.remoteCore.now!(); const result = mapper(); this.metrics.mappingMs += this.remoteCore.now!() - started; return result; }
}
