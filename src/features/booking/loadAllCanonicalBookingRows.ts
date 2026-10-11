import type { CanonicalBookingCalendarSearchInput, CanonicalBookingListItem, CanonicalBookingReadRepository } from "./canonical";

/** The canonical RPC pages after authorization; never filter just its first page. */
export async function loadAllCanonicalBookingRows(repository: CanonicalBookingReadRepository, window?: Pick<CanonicalBookingCalendarSearchInput, "windowStart" | "windowEnd">): Promise<CanonicalBookingListItem[]> {
  const rows: CanonicalBookingListItem[] = [];
  let offset = 0;
  for (;;) {
    const options = { limit: 100, offset, sort: "dateOut" as const, ascending: true };
    const result = window
      ? await repository.searchCanonicalBookingCalendarRows({ ...options, ...window })
      : await repository.searchCanonicalBookingRows(options);
    if (!result.success) throw new Error(result.error.message);
    rows.push(...result.value.rows);
    if (!result.value.hasMore) return rows;
    const next = result.value.offset + result.value.rows.length;
    if (next <= offset) throw new Error("Canonical Booking paging did not advance.");
    offset = next;
  }
}
