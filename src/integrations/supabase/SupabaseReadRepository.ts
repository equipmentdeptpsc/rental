import type { SupabaseClient } from "@supabase/supabase-js";
import { repositoryFailure, repositorySuccess, type Page, type RepositoryResult } from "@/core/persistence";
import { normalizeRemoteQueryOptions, RemoteRepositoryBase, type ReadOnlyRepository, type RemoteCore, type RemoteReadFilter, type RemoteSearchOptions } from "@/core/remote";

export interface SupabaseReadRepositoryDefinition<T> {
  repositoryName: string; table: string; columns?: string; searchColumns?: readonly string[];
  mapRow?: (row: Record<string, unknown>) => RepositoryResult<T>;
}
export class SupabaseReadRepository<T, TFilter extends RemoteReadFilter = RemoteReadFilter> extends RemoteRepositoryBase implements ReadOnlyRepository<T, TFilter> {
  constructor(private readonly client: SupabaseClient, private readonly definition: SupabaseReadRepositoryDefinition<T>, remoteCore: RemoteCore) {
    super(definition.repositoryName, ["ReadOnly", "SupportsPaging", "SupportsFiltering", "SupportsOrdering"], remoteCore);
  }
  async getById(id: string, options: { signal?: AbortSignal } = {}): Promise<RepositoryResult<T | null>> {
    const result = await this.read<unknown>("getById", options.signal, (signal) => this.client.schema("erp").from(this.definition.table).select(this.definition.columns ?? "*").eq("id", id).abortSignal(signal).maybeSingle());
    if (!result.success) return result;
    if (result.value === null) return repositoryFailure("REPOSITORY_NOT_FOUND", `${this.definition.repositoryName} was not found.`, {
      context: { repository: this.definition.repositoryName, id }, recoverability: "USER_ACTION_REQUIRED",
      recommendedAction: "Refresh the list and select an existing record.",
    });
    return this.map(result.value);
  }
  list(options: RemoteSearchOptions<TFilter> = {}): Promise<RepositoryResult<Page<T>>> { return this.executeList(options); }
  search(query: string, options: RemoteSearchOptions<TFilter> = {}): Promise<RepositoryResult<Page<T>>> { return this.executeList({ ...options, query }); }
  private async executeList(options: RemoteSearchOptions<TFilter>): Promise<RepositoryResult<Page<T>>> {
    const normalized = normalizeRemoteQueryOptions(options);
    const searchQuery = options.query?.trim();
    const result = await this.read<unknown[]>("list", normalized.signal, (signal) => {
      let query = this.client.schema("erp").from(this.definition.table).select(this.definition.columns ?? "*");
      for (const [field, value] of Object.entries(normalized.filters ?? {})) {
        if (value === undefined) continue;
        query = value === null ? query.is(field, null) : query.eq(field, value);
      }
      if (searchQuery && this.definition.searchColumns?.length) {
        const escaped = searchQuery.replaceAll("%", "\\%").replaceAll(",", "\\,");
        query = query.or(this.definition.searchColumns.map((field) => `${field}.ilike.%${escaped}%`).join(","));
      }
      for (const order of normalized.ordering ?? []) query = query.order(order.field, { ascending: order.ascending });
      if (normalized.paging?.limit !== undefined) { const offset = normalized.paging.offset ?? 0; query = query.range(offset, offset + normalized.paging.limit - 1); }
      return query.abortSignal(signal);
    });
    if (!result.success) return result;
    const items: T[] = [];
    for (const row of result.value ?? []) { const mapped = this.map(row); if (!mapped.success) return mapped; items.push(mapped.value); }
    const offset = normalized.paging?.offset ?? 0, limit = normalized.paging?.limit;
    return repositorySuccess({ items, nextCursor: limit !== undefined && items.length === limit ? String(offset + limit) : undefined });
  }
  private map(value: unknown): RepositoryResult<T> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return malformed<T>(this.definition.repositoryName);
    return this.definition.mapRow ? this.definition.mapRow(value as Record<string, unknown>) : mapCanonicalRow<T>(value);
  }
}
export function mapCanonicalRow<T>(value: unknown): RepositoryResult<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return malformed<T>("Remote");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) return repositoryFailure("REMOTE_ROW_MALFORMED", "Remote row requires a stable string ID.", { context: { field: "id" }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Repair the remote identity before reading this record." });
  const legacy = row.legacy_payload && typeof row.legacy_payload === "object" && !Array.isArray(row.legacy_payload) ? row.legacy_payload as Record<string, unknown> : {};
  const mapped: Record<string, unknown> = { ...legacy };
  for (const [key, fieldValue] of Object.entries(row)) if (key !== "legacy_payload") mapped[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = fieldValue;
  return repositorySuccess(mapped as T);
}
function malformed<T>(repository: string): RepositoryResult<T> { return repositoryFailure("REMOTE_ROW_MALFORMED", "Remote row must be an object.", { context: { repository }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Reconcile the remote row with the canonical schema." }); }
