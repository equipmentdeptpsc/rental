import type { Page, RepositoryOperation, RepositoryResult } from "@/core/persistence";
import type { RemoteQueryOptions } from "./types";

export interface RemoteReadFilter {
  readonly [field: string]: string | number | boolean | null | undefined;
}
export interface RemoteSearchOptions<TFilter extends RemoteReadFilter = RemoteReadFilter> extends RemoteQueryOptions<TFilter> { query?: string }
export interface ReadOnlyRepository<T, TFilter extends RemoteReadFilter = RemoteReadFilter> {
  getById(id: string, options?: Pick<RemoteQueryOptions<TFilter>, "signal">): RepositoryOperation<RepositoryResult<T | null>>;
  list(options?: RemoteSearchOptions<TFilter>): RepositoryOperation<RepositoryResult<Page<T>>>;
  search(query: string, options?: RemoteSearchOptions<TFilter>): RepositoryOperation<RepositoryResult<Page<T>>>;
}
