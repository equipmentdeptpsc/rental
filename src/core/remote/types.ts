import type { RepositoryError, RepositoryResult } from "@/core/persistence";

export type RemoteResult<T> = RepositoryResult<T>;
export type RemoteFailureKind = "Cancelled" | "Timeout" | "Unauthorized" | "Forbidden" | "ValidationError" | "SchemaMismatch" | "Conflict" | "TransientFailure" | "UnexpectedFailure";

export interface RemoteOrdering { field: string; ascending?: boolean }
export interface RemotePaging { limit?: number; offset?: number }
export interface RemoteQueryOptions<TFilter = Record<string, unknown>> {
  ordering?: readonly RemoteOrdering[];
  paging?: RemotePaging;
  signal?: AbortSignal;
  filters?: TFilter;
}

export type RemoteCapability = "ReadOnly" | "SupportsPaging" | "SupportsFiltering" | "SupportsOrdering" | "SupportsRealtime" | "SupportsMutation" | "SupportsOffline";
export interface RemoteCapabilities { readonly capabilities: ReadonlySet<RemoteCapability>; supports(capability: RemoteCapability): boolean }
export interface RemoteMetrics { requestCount: number; retryCount: number; executionMs: number; mappingMs: number }
export interface RemoteErrorDescriptor { code?: string; message?: string; status?: number; details?: string; hint?: string }
export interface RemoteFailure extends RepositoryError { context: RepositoryError["context"] & { failureKind?: RemoteFailureKind } }

export function createRemoteCapabilities(...capabilities: RemoteCapability[]): RemoteCapabilities {
  const values = new Set(capabilities);
  return { capabilities: values, supports: capability => values.has(capability) };
}

export function normalizeRemoteQueryOptions<T>(options: RemoteQueryOptions<T> = {}): RemoteQueryOptions<T> {
  const limit = options.paging?.limit === undefined ? undefined : Math.max(1, Math.trunc(options.paging.limit));
  const offset = options.paging?.offset === undefined ? undefined : Math.max(0, Math.trunc(options.paging.offset));
  return { ...options, ordering: options.ordering?.map(order => ({ field: order.field, ascending: order.ascending ?? true })), paging: limit === undefined && offset === undefined ? undefined : { limit, offset } };
}
