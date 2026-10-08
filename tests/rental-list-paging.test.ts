import { describe, expect, it, vi } from "vitest";
import { repositorySuccess } from "@/core/persistence";
import type { ReadOnlyRepository } from "@/core/remote";
import { loadRentalListPages } from "@/features/rental/hooks/useRentalListData";

describe("Rental list remote paging", () => {
  it("loads every page so shared filters are not limited to the first server page", async () => {
    const records = Array.from({ length: 1101 }, (_, index) => ({ id: `rental-${index}` }));
    const list = vi.fn(async (options: { paging?: { offset?: number; limit?: number } }) => {
      const offset = options.paging?.offset ?? 0, limit = options.paging?.limit ?? 500;
      const items = records.slice(offset, offset + limit);
      return repositorySuccess({ items, nextCursor: items.length === limit ? String(offset + limit) : undefined });
    });
    const result = await loadRentalListPages({ list } as unknown as ReadOnlyRepository<{ id: string }>);
    expect(result.success && result.value.items).toHaveLength(1101);
    expect(list).toHaveBeenCalledTimes(3);
    expect(list).toHaveBeenNthCalledWith(2, { paging: { offset: 500, limit: 500 } });
  });
});
