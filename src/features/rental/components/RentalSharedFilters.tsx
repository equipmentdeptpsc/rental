import { useEffect, useState } from "react";
import FilterBar from "@/components/ui/FilterBar";
import type { RentalFilterOption, RentalListFilters } from "../services/filterRentalList";

type FilterKey = keyof RentalListFilters;
type Options = { customers: RentalFilterOption[]; projects: RentalFilterOption[]; equipment: RentalFilterOption[]; operators: RentalFilterOption[]; statuses: RentalFilterOption[] };

export default function RentalSharedFilters({ filters, options, unavailableCatalogs = [], onChange, onClear }: {
  filters: RentalListFilters;
  options: Options;
  unavailableCatalogs?: readonly string[];
  onChange: (key: FilterKey, value: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState(filters.query);
  useEffect(() => { setQuery(filters.query); }, [filters.query]);
  useEffect(() => {
    if (query === filters.query) return;
    const timer = window.setTimeout(() => onChange("query", query), 250);
    return () => window.clearTimeout(timer);
  }, [query, filters.query, onChange]);
  const allSelects: Array<[FilterKey, string, RentalFilterOption[]]> = [
    ["customer", "Customer", options.customers], ["project", "Project", options.projects],
    ["equipment", "Equipment", options.equipment], ["operator", "Operator", options.operators],
    ["status", "Status", options.statuses],
  ];
  const selects = allSelects.filter(([key]) => !unavailableCatalogs.includes(key === "operator" ? "operators" : key));
  const chips = (["query", "customer", "project", "equipment", "operator", "status", "from", "to"] as FilterKey[])
    .filter((key) => filters[key]).map((key) => {
      const labels: Record<FilterKey, string> = { query: "Search", customer: "Customer", project: "Project", equipment: "Equipment", operator: "Operator", status: "Status", from: "Start from", to: "Start to" };
      const option = selects.find(([name]) => name === key)?.[2].find((item) => item.value === filters[key]);
      return { key, label: `${labels[key]}: ${option?.label ?? (key === "query" || key === "from" || key === "to" || key === "status" ? filters[key] : "Selected")}` };
    });
  return <div className="space-y-2">
    <FilterBar canClear={chips.length > 0} onClear={() => { setQuery(""); onClear(); }}>
      <label className="min-w-[220px] flex-[2] text-xs font-medium text-slate-600 dark:text-slate-300">Search rentals
        <input className="app-control mt-1 w-full" aria-label="Search rentals" placeholder="Rental, customer, project, equipment, operator…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {selects.map(([key, label, values]) => <label className="min-w-[150px] flex-1 text-xs font-medium text-slate-600 dark:text-slate-300" key={key}>{label}
        <select className="app-control mt-1 w-full" aria-label={`${label} filter`} value={filters[key]} onChange={(event) => onChange(key, event.target.value)}>
          <option value="">All {label.toLowerCase()}</option>
          {values.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>)}
      <label className="min-w-[135px] flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">Start from<input className="app-control mt-1 w-full" aria-label="Start from" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => onChange("from", event.target.value)} /></label>
      <label className="min-w-[135px] flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">Start to<input className="app-control mt-1 w-full" aria-label="Start to" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => onChange("to", event.target.value)} /></label>
    </FilterBar>
    {chips.length > 0 && <div className="flex flex-wrap gap-2 px-1" aria-label="Active rental filters">{chips.map(({ key, label }) => <button key={key} type="button" className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200" onClick={() => { if (key === "query") setQuery(""); onChange(key, ""); }} aria-label={`Remove ${key} filter`}>{label} ×</button>)}</div>}
  </div>;
}
