import { Link } from "react-router-dom";

import type { CanonicalBillingVisibilityState } from "../hooks/useCanonicalBillingVisibility";

export default function CanonicalBillingVisibilityPanel({ state }: { state: CanonicalBillingVisibilityState }) {
  if (state.status === "unavailable") return null;
  if (state.status === "loading") return <section className="dashboard-panel p-4" role="status">Loading billing status…</section>;
  if (state.status === "error") return <section className="dashboard-panel p-4" role="alert">Billing status is unavailable. <button className="underline" onClick={state.retry}>Retry</button></section>;
  const data = state.data!;
  const categories = Object.entries(data.blockers).filter(([, count]) => count > 0);
  return <section className="dashboard-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="dashboard-panel-title font-display">Billing operations</h2><Link className="text-xs font-medium text-blue-600 hover:underline" to="/billing">Open Billing →</Link></div><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/30"><span className="block text-slate-600 dark:text-slate-300">Billing ready</span><strong className="text-base">{data.readyForBilling}</strong></div><div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-950/30"><span className="block text-slate-600 dark:text-slate-300">Billing blockers</span><strong className="text-base">{data.blockerCount}</strong></div></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{categories.map(([category, count]) => <span key={category} className="text-slate-600 dark:text-slate-300">{category === "Other canonical blocking state" ? "Other billing blockers" : category} <strong>{count}</strong></span>)}</div></section>;
}
