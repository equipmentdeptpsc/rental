import { paginate, repositorySuccess, type Page, type RepositoryResult } from "@/core/persistence";
import type { ReadOnlyRepository, RemoteReadFilter, RemoteSearchOptions } from "./ReadOnlyRepository";

export class LocalReadRepository<T extends { id: string }, TFilter extends RemoteReadFilter = RemoteReadFilter> implements ReadOnlyRepository<T, TFilter> {
  constructor(private readonly load: () => readonly T[], private readonly searchableText: (record: T) => string = (record) => JSON.stringify(record)) {}
  getById(id: string): RepositoryResult<T | null> { return repositorySuccess(structuredClone(this.load().find((record) => record.id === id) ?? null)); }
  list(options: RemoteSearchOptions<TFilter> = {}): RepositoryResult<Page<T>> { return repositorySuccess(this.select(options)); }
  search(query: string, options: RemoteSearchOptions<TFilter> = {}): RepositoryResult<Page<T>> { return repositorySuccess(this.select({ ...options, query })); }
  private select(options: RemoteSearchOptions<TFilter>): Page<T> {
    const query = options.query?.trim().toLocaleLowerCase();
    let records = this.load().filter((record) => !query || this.searchableText(record).toLocaleLowerCase().includes(query));
    for (const [field, expected] of Object.entries(options.filters ?? {})) if (expected !== undefined) records = records.filter((record) => (record as Record<string, unknown>)[field] === expected);
    for (const order of [...(options.ordering ?? [])].reverse()) records = [...records].sort((left, right) => {
      const compared = String((left as Record<string, unknown>)[order.field] ?? "").localeCompare(String((right as Record<string, unknown>)[order.field] ?? ""), undefined, { numeric: true });
      return order.ascending === false ? -compared : compared;
    });
    const offset = options.paging?.offset ?? 0, limit = options.paging?.limit ?? Math.max(records.length, 1);
    return { ...paginate(records.map((record) => structuredClone(record)), { offset, limit }), total: records.length };
  }
}
