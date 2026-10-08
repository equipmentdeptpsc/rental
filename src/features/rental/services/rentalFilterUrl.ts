import { emptyRentalListFilters, type RentalListFilters } from "./filterRentalList";

export function readRentalFilters(params: URLSearchParams): RentalListFilters {
  const filters = { ...emptyRentalListFilters };
  for (const key of Object.keys(filters) as Array<keyof RentalListFilters>) filters[key] = params.get(`r_${key}`) ?? "";
  return filters;
}

export function updateRentalFilterParams(current: URLSearchParams, key: keyof RentalListFilters, value: string): URLSearchParams {
  const next = new URLSearchParams(current);
  value ? next.set(`r_${key}`, value) : next.delete(`r_${key}`);
  if (key === "customer") next.delete("r_project");
  next.delete("r_page");
  return next;
}

export function clearRentalFilterParams(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of [...next.keys()]) if (key.startsWith("r_") && !["r_sort", "r_dir"].includes(key)) next.delete(key);
  return next;
}
