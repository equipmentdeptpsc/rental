import { Link } from "react-router-dom";

import type { CanonicalBillingVisibilityState } from "../hooks/useCanonicalBillingVisibility";

export default function CanonicalBillingVisibilityPanel({ state }: { state: CanonicalBillingVisibilityState }) {
  if (state.status === "unavailable") return null;
  if (state.status === "loading") return <section className="dashboard-panel p-4" role="status">Loading canonical billing visibility…</section>;
  if (state.status === "error") return <section className="dashboard-panel p-4" role="alert">Canonical billing visibility is unavailable. <button className="underline" onClick={state.retry}>Retry</button></section>;
  const data = state.data!;
  const categories = Object.entries(data.blockers).filter(([, count]) => count > 0);
  return <section className="dashboard-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="dashboard-panel-title font-display">Billing operations</h2><Link className="text-xs font-medium text-blue-600 hover:underline" to="/billing">Open Billing →</Link></div><div className="space-y-2 text-xs"><div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800"><span className="text-slate-600 dark:text-slate-300">Billing ready</span><strong>{data.readyForBilling}</strong></div><div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800"><span className="text-slate-600 dark:text-slate-300">Billing blockers</span><strong>{data.blockerCount}</strong></div>{categories.map(([category, count]) => <div key={category} className="flex items-center justify-between py-1 text-slate-600 dark:text-slate-300"><span>{category}</span><strong>{count}</strong></div>)}<p className="pt-2 text-slate-500">Receivables and aging are unavailable until canonical collection and due-date reads are provided.</p></div></section>;
}
