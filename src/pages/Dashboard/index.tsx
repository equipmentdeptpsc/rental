import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Info, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import DashboardActionQueue from "@/features/dashboard/components/DashboardActionQueue";
import CanonicalBillingVisibilityPanel from "@/features/dashboard/components/CanonicalBillingVisibilityPanel";
import { useDashboardViewModel } from "@/features/dashboard/hooks/useDashboardViewModel";
import { useCanonicalDashboardViewModel } from "@/features/dashboard/hooks/useCanonicalDashboardViewModel";
import type { CanonicalDashboardModel } from "@/features/dashboard/services/canonicalDashboardRead";
import { buildManagementAnalytics, type RankedAmount } from "@/features/dashboard/services/managementAnalytics";
import { dashboardPeriod, rangeDays, type DashboardComparison, type DashboardPeriodPreset } from "@/features/dashboard/services/managementPeriods";
import { useAuth } from "@/features/auth/AuthContext";
import { useApplicationDependenciesCompatibility, PersistenceMode } from "@/app/composition";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const updatedDateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" });
const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" });
const TrendChart = lazy(() => import("@/features/dashboard/components/ManagementTrendChart"));
const compactMoney = (value: number) => `₱${new Intl.NumberFormat("en-PH", { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;
const dateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function Dashboard() {
  const { configuration } = useApplicationDependenciesCompatibility();
  return configuration.persistenceMode === PersistenceMode.Remote ? <RemoteDashboard /> : <LocalDashboard />;
}

function LocalDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const model = useDashboardViewModel(refreshKey);
  const { hasPermission } = useAuth();
  return <DashboardContent model={model} updatedAt={updatedAt} refresh={() => { setRefreshKey((value) => value + 1); setUpdatedAt(new Date()); }} hasPermission={hasPermission} remote={false} />;
}

function RemoteDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { hasPermission } = useAuth();
  const state = useCanonicalDashboardViewModel(refreshKey, hasPermission("users.manage"), hasPermission("billing.read") && hasPermission("collections.read"));
  if (state.status === "loading") return <div className="app-page" role="status">Loading dashboard…</div>;
  if (state.status === "error") return <div className="app-page"><PageHeader title="Operations Dashboard" description="Dashboard data is unavailable." /><div role="alert" className="dashboard-panel p-4">{state.message} <button className="app-link" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></div></div>;
  return <DashboardContent model={state.model} updatedAt={state.loadedAt} refresh={() => setRefreshKey((value) => value + 1)} hasPermission={hasPermission} remote />;
}

function DashboardContent({ model, updatedAt, refresh, hasPermission, remote }: {
  model: ReturnType<typeof useDashboardViewModel> | CanonicalDashboardModel;
  updatedAt: Date;
  refresh(): void;
  hasPermission(permission: Parameters<ReturnType<typeof useAuth>["hasPermission"]>[0]): boolean;
  remote: boolean;
}) {
  const [preset, setPreset] = useState<DashboardPeriodPreset>("this-month");
  const [comparison, setComparison] = useState<DashboardComparison>("previous");
  const [customFrom, setCustomFrom] = useState(() => dateValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => dateValue(new Date()));
  const period = dashboardPeriod(preset, updatedAt, { from: customFrom, to: customTo });
  const validPeriod = period.from <= period.to && rangeDays(period) <= 366 && period.to <= dateValue(updatedAt);
  const analytics = useMemo(() => validPeriod ? buildManagementAnalytics(model.managementSource, period, comparison, updatedAt) : null, [model.managementSource, period.from, period.to, comparison, updatedAt, validPeriod]);
  const showFinancial = !remote || ("financialAvailable" in model && model.financialAvailable);
  const recentActivity = [
    ...model.activity.map((item) => ({ id: `activity-${item.id}`, title: item.title, description: item.description, timestamp: item.timestamp, kind: item.kind })),
    ...model.recentEquipmentActivity.map((item) => ({ id: `equipment-${item.id}`, title: item.title, description: `${item.equipment?.assetNo ?? "Equipment"} · ${item.actor}`, timestamp: item.timestamp, kind: "equipment" as const })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8);

  return (
    <div className="app-page">
      <PageHeader title="Dashboard" description="Fleet performance and commercial activity" actions={<><span className="text-xs text-slate-500 dark:text-slate-400">Updated {updatedDateTime.format(updatedAt)}</span><button aria-label="Refresh dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" onClick={refresh}>
          <RefreshCw size={15} /> <span>Refresh</span>
        </button></>} />

      <div className="dashboard-panel flex flex-wrap items-end gap-3 p-3"><label className="min-w-40 flex-1 text-xs font-medium">Analysis period<select aria-label="Analysis period" className="app-control mt-1 w-full" value={preset} onChange={(event) => setPreset(event.target.value as DashboardPeriodPreset)}><option value="this-month">This Month</option><option value="last-month">Last Month</option><option value="this-quarter">This Quarter</option><option value="last-quarter">Last Quarter</option><option value="this-year">This Year</option><option value="custom">Custom Range</option></select></label>{preset === "custom" && <><label className="text-xs font-medium">From<input aria-label="Period from" className="app-control mt-1 block" type="date" value={customFrom} max={dateValue(updatedAt)} onChange={(event) => setCustomFrom(event.target.value)} /></label><label className="text-xs font-medium">To<input aria-label="Period to" className="app-control mt-1 block" type="date" value={customTo} max={dateValue(updatedAt)} onChange={(event) => setCustomTo(event.target.value)} /></label></>}<label className="min-w-44 flex-1 text-xs font-medium">Compare with<select aria-label="Comparison period" className="app-control mt-1 w-full" value={comparison} onChange={(event) => setComparison(event.target.value as DashboardComparison)}><option value="previous">Previous Period</option><option value="last-year">Same Period Last Year</option></select></label><span className="pb-2 text-xs text-slate-500">{period.from} to {period.to}</span></div>
      {!validPeriod && <div role="alert" className="dashboard-panel p-4 text-sm text-rose-700">Choose a range ending today or earlier, up to 366 days.</div>}
      {analytics && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"><Kpi title="Fleet utilization" value={`${analytics.fleet.rate.toFixed(1)}%`} detail={`${analytics.fleet.assigned + analytics.fleet.deployed} deployed / ${analytics.fleet.total} active`} definition="Current Assigned or Rented equipment divided by active equipment; counted once per asset. Current snapshot." href="/equipment" /><Kpi title="Deployed equipment" value={String(analytics.fleet.assigned + analytics.fleet.deployed)} detail={`${analytics.fleet.assigned} assigned · ${analytics.fleet.deployed} rented`} href="/equipment" /><Kpi title="Active rentals" value={String(analytics.activeRentals)} detail="Current rental snapshot" href="/rentals?r_status=Active" />{showFinancial && <><Kpi title="Invoiced amount" value={compactMoney(analytics.revenue)} detail={`${analytics.revenueChange.label} vs ${comparison === "previous" ? "previous period" : "last year"}`} definition="Invoiced statement total attributed to its billing-period end date, not accounting revenue." href="/billing" exact={currency.format(analytics.revenue)} tone={analytics.revenueChange.percent} /><Kpi title="Collections" value={compactMoney(analytics.collections)} detail={`${analytics.collectionsChange.label} vs ${comparison === "previous" ? "previous period" : "last year"}`} definition="Rental-linked payments received in the selected period." href="/billing" exact={currency.format(analytics.collections)} tone={analytics.collectionsChange.percent} /><Kpi title="Outstanding" value={compactMoney(analytics.outstanding)} detail="Current balance · all periods" definition="Current invoiced balance after matched collections; this snapshot is independent of the period selector." href="/billing" exact={currency.format(analytics.outstanding)} /></>}</div>}

      {analytics && <div className="dashboard-panel flex flex-wrap gap-x-5 gap-y-2 p-3 text-xs"><span>Fleet: <strong>{analytics.fleet.total}</strong></span><span>Available: <strong>{analytics.fleet.available}</strong></span><span>Assigned: <strong>{analytics.fleet.assigned}</strong></span><span>Rented: <strong>{analytics.fleet.deployed}</strong></span><span>Maintenance: <strong>{analytics.fleet.maintenance}</strong></span><span>Pending DEUR: <strong>{model.pendingDeur}</strong></span><span>Expected returns: <strong>{model.financial.upcoming.expectedReturns}</strong></span><span>Manager approvals: <strong>{model.financial.upcoming.pendingManagerApprovals}</strong></span><span>Customer acknowledgements: <strong>{model.financial.upcoming.pendingCustomerAcknowledgements}</strong></span></div>}

      {analytics && <>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">{showFinancial && <Panel title="Invoiced amount & collections"><p className="mb-2 text-xs text-slate-500">Billing period end for invoices · payment date for collections</p><LazyTrend data={analytics.trend} /><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>Invoiced {currency.format(analytics.revenue)}</span><span>Collected {currency.format(analytics.collections)}</span><span title="Collections received in the selected period divided by invoiced amount for billing periods ending in the period. This can exceed 100% when older invoices are paid.">Collection realization: {analytics.collectionRealization === null ? "No invoiced amount" : `${analytics.collectionRealization.toFixed(1)}%`} <Info size={12} className="inline" /></span></div></Panel>}<Panel title="Rental pipeline"><p className="mb-2 text-xs text-slate-500">Current lifecycle counts</p>{analytics.pipeline.map((item) => <div key={item.status} className="flex justify-between border-b border-slate-100 py-1 text-xs last:border-0 dark:border-slate-800"><Link className="app-link" to={`/rentals?r_status=${encodeURIComponent(item.status)}`}>{item.status}</Link><strong>{item.count}</strong></div>)}</Panel></div>
        {showFinancial && <div className="grid min-w-0 gap-4 lg:grid-cols-3"><Panel title="Top revenue equipment">{analytics.equipmentAttributionComplete ? <Ranking items={analytics.topRevenueEquipment} /> : <Note>Equipment attribution is unavailable because invoice lines do not fully reconcile to statement totals.</Note>}</Panel><Panel title="Top customers"><Ranking items={analytics.topCustomers} /></Panel><Panel title="Top projects"><Ranking items={analytics.topProjects} /></Panel></div>}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2"><Panel title="Top deployed equipment"><p className="mb-2 text-xs text-slate-500">Distinct assignment or rental days in the selected period, not operating hours</p>{analytics.topUtilizedEquipment.length ? analytics.topUtilizedEquipment.map((item) => <Link key={item.id} to={item.href} className="block rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800"><div className="flex justify-between gap-2 text-xs"><span className="truncate font-medium">{item.label}</span><strong className="shrink-0">{item.days} d · {item.percent.toFixed(1)}%</strong></div><div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, item.percent)}%` }} /></div></Link>) : <Note>No deployment days recorded for this period.</Note>}</Panel><Panel title="Idle-heavy equipment"><p className="mb-2 text-xs text-slate-500">Acknowledged DEUR · idle / (operation + idle) · 40% display threshold</p>{analytics.idleHeavyEquipment.length ? analytics.idleHeavyEquipment.map((item) => <Link key={item.id} to={item.href} className="flex flex-wrap justify-between gap-2 rounded-lg p-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"><span className="font-medium">{item.label}</span><span>{item.operationHours.toFixed(1)} h operation · {item.idleHours.toFixed(1)} h idle · <strong>{item.percent.toFixed(1)}%</strong></span></Link>) : <Note>No equipment meets the measured idle threshold.</Note>}</Panel></div>
        <Panel title="Equipment requiring attention"><p className="mb-2 text-xs text-slate-500">Current overdue returns and missing operators; selected-period measured idle</p>{analytics.attention.length ? analytics.attention.map((item) => <Link key={item.key} to={item.href} className="grid gap-1 rounded-lg border border-slate-100 p-2 text-xs hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]"><span className={item.severity === "high" ? "font-semibold text-rose-700" : "font-semibold text-amber-700"}>{item.severity === "high" ? "High" : "Review"}</span><span className="font-medium">{item.equipment}</span><span>{item.issue}</span><span className="text-slate-500">{item.context} →</span></Link>) : <Note>No supported equipment exceptions found.</Note>}</Panel>
      </>}

      <DashboardActionQueue items={model.actionQueue} hasPermission={hasPermission} />
      {remote && showFinancial && "billingVisibility" in model && <CanonicalBillingVisibilityPanel state={{ status: "loaded", data: model.billingVisibility, retry: refresh }} />}

      <Panel title="Recent activity" action={hasPermission("users.manage") ? <Link to="/audit-trail">View all</Link> : undefined}>
        <div className="space-y-3">{remote && "activityAvailable" in model && !model.activityAvailable ? <p className="text-xs text-slate-500">Recent activity is unavailable for this account.</p> : recentActivity.length ? recentActivity.map((item) => <div key={item.id} className="flex gap-3 text-xs"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.kind === "rental" ? "bg-[#f0a93a]" : "bg-emerald-500"}`} /><div className="min-w-0 flex-1"><strong className="block truncate capitalize">{item.title}</strong><span className="block truncate text-slate-500">{item.description}</span></div><time className="shrink-0 text-slate-500">{time.format(new Date(item.timestamp))}</time></div>) : <EmptyState className="!px-4 !py-6" title="No recent activity" description="Equipment updates, rentals, and assignments will appear here as your team starts working." />}</div>
      </Panel>

    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="dashboard-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="dashboard-panel-title font-display">{title}</h2>{action && <div className="rounded bg-slate-50 px-2 py-1 text-[11px] text-blue-600 dark:bg-slate-800">{action}</div>}</div>{children}</section>; }
function Kpi({ title, value, detail, definition, href, exact, tone }: { title: string; value: string; detail: string; definition?: string; href: string; exact?: string; tone?: number | null }) { return <Link to={href} title={exact ?? definition} className="dashboard-panel min-w-0 p-4 transition hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="flex items-center gap-1 text-xs font-medium text-slate-500">{title}{definition && <span title={definition} aria-label={definition}><Info size={13} /></span>}</span><strong className="mt-2 block truncate text-2xl font-semibold tabular-nums" title={exact}>{value}</strong><span className={`mt-1 block text-xs ${tone === undefined || tone === null || tone === 0 ? "text-slate-500" : tone > 0 ? "text-emerald-700" : "text-rose-700"}`}>{detail}</span></Link>; }
function Note({ children }: { children: ReactNode }) { return <p className="py-4 text-xs text-slate-500">{children}</p>; }
function Ranking({ items }: { items: RankedAmount[] }) { return <div className="space-y-1">{items.length ? items.map((item, index) => <Link key={item.key} to={item.href} className="flex min-w-0 items-center gap-2 rounded-lg p-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"><span className="w-4 shrink-0 text-slate-400">{index + 1}</span><span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span><strong className="shrink-0 tabular-nums" title={currency.format(item.amount)}>{compactMoney(item.amount)}</strong></Link>) : <Note>No invoiced activity for this period.</Note>}</div>; }
function LazyTrend({ data }: { data: Array<{ label: string; revenue: number; collections: number }> }) { const ref = useRef<HTMLDivElement>(null); const [visible, setVisible] = useState(false); useEffect(() => { if (!ref.current) return; if (typeof IntersectionObserver === "undefined") { setVisible(true); return; } const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "200px" }); observer.observe(ref.current); return () => observer.disconnect(); }, []); return <div ref={ref} className="h-56 min-w-0">{visible ? <Suspense fallback={<div role="status" className="py-8 text-xs text-slate-500">Loading trend…</div>}><TrendChart data={data} /></Suspense> : <div className="py-8 text-xs text-slate-500">Trend will load when visible.</div>}</div>; }
