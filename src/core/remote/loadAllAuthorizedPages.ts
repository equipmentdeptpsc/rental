import { repositorySuccess, type RepositoryResult } from "@/core/persistence";
import type { ReadOnlyRepository } from "./ReadOnlyRepository";

/** Fetch every authorized page before client-side cross-reference filtering. */
export async function loadAllAuthorizedPages<T>(repository: Pick<ReadOnlyRepository<T>, "list">): Promise<RepositoryResult<T[]>> {
  const items: T[] = [];
  let offset = 0;
  for (;;) {
    const result = await repository.list({ paging: { offset, limit: 500 } });
    if (!result.success) return result;
    items.push(...result.value.items);
    if (!result.value.nextCursor) return repositorySuccess(items);
    const next = Number(result.value.nextCursor);
    if (!Number.isSafeInteger(next) || next <= offset) throw new Error("Canonical paging did not advance.");
    offset = next;
  }
}
