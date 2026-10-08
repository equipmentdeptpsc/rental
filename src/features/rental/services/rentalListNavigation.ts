export function rentalWorkspaceFromListPath(rentalId: string, listSearch: string): string {
  const path = `/rentals/${encodeURIComponent(rentalId)}/workspace`;
  return listSearch ? `${path}?listQuery=${encodeURIComponent(listSearch)}` : path;
}

export function rentalListReturnPath(workspaceSearch: string): string {
  const search = new URLSearchParams(workspaceSearch).get("listQuery");
  return `/rentals${search?.startsWith("?") ? search : ""}`;
}
