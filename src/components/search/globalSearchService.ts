export interface GlobalSearchSourceRecord { type: string; id: string; title: string; subtitle: string; href: string; searchable: string; permission: string }
export interface GlobalSearchResult { type: string; id: string; title: string; subtitle: string; href: string }

export function searchGlobalRecords(records: readonly GlobalSearchSourceRecord[], query: string, canRead: (permission: string) => boolean, limitPerGroup = 5): GlobalSearchResult[] {
  const keyword = query.trim().toLowerCase();
  if (keyword.length < 2) return [];
  const counts = new Map<string, number>();
  return records.filter((record) => canRead(record.permission) && `${record.title} ${record.subtitle} ${record.searchable}`.toLowerCase().includes(keyword)).filter((record) => {
    const count = counts.get(record.type) ?? 0;
    if (count >= limitPerGroup) return false;
    counts.set(record.type, count + 1);
    return true;
  }).map(({ type, id, title, subtitle, href }) => ({ type, id, title, subtitle, href }));
}
