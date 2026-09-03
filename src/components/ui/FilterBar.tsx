import type { ReactNode } from "react";

export default function FilterBar({ children, onClear, canClear = true }: { children: ReactNode; onClear?: () => void; canClear?: boolean }) {
  return <section aria-label="Filters" className="app-card flex flex-wrap items-end gap-3 p-4">
    <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>
    {onClear && canClear ? <button type="button" className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onClick={onClear}>Clear filters</button> : null}
  </section>;
}
