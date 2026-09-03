import { useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, FileClock, Package, RefreshCw, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import EquipmentCategoryChart from "@/features/dashboard/components/equipment-category-chart";
import DashboardActionQueue from "@/features/dashboard/components/DashboardActionQueue";
import KpiCard from "@/components/ui/KpiCard";
import { useDashboardViewModel } from "@/features/dashboard/hooks/useDashboardViewModel";
import { useAuth } from "@/features/auth/AuthContext";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "short", timeStyle: "short" });
const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" });

export default function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const model = useDashboardViewModel(refreshKey);
  const { hasPermission } = useAuth();
  const { operational, financial } = model;
  const recentActivity = [
    ...model.activity.map((item) => ({ id: `activity-${item.id}`, title: item.title, description: item.description, timestamp: item.timestamp, kind: item.kind })),
    ...model.recentEquipmentActivity.map((item) => ({ id: `equipment-${item.id}`, title: item.title, description: `${item.equipment?.assetNo ?? "Equipment"} · ${item.actor}`, timestamp: item.timestamp, kind: "equipment" as const })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8);
  const refresh = () => { setRefreshKey((value) => value + 1); setUpdatedAt(new Date()); };

  return (
    <div className="app-page">
      <PageHeader title="Operations Dashboard" description="Exception-first visibility across equipment, rentals, assignments, and DEUR work." actions={<button aria-label="Refresh dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" onClick={refresh}>
          <RefreshCw size={15} /> <span>Refresh · {dateTime.format(updatedAt)}</span>
        </button>
      } />

      <DashboardActionQueue items={model.actionQueue} hasPermission={hasPermission} />

      <div className="flex flex-wrap items-stretch gap-3">
        <KpiCard icon={<Package />} tone="blue" label="Total Equipment" value={operational.totalEquipment} caption="All equipment in system" />
        <KpiCard icon={<CheckCircle2 />} tone="green" label="Available Equipment" value={operational.availableEquipment} caption="Ready for assignment" />
        <KpiCard icon={<Wrench />} tone="orange" label="In Maintenance" value={operational.maintenanceEquipment} caption="Under maintenance" />
        <KpiCard icon={<ClipboardCheck />} tone="purple" label="Active Rentals" value={operational.activeRentals} caption="Currently active" />
        <KpiCard icon={<FileClock />} tone="pink" label="Pending DEUR" value={model.pendingDeur} caption="Awaiting completion" />
        <KpiCard icon={<span aria-hidden="true" className="text-2xl font-semibold">₱</span>} tone="green" label="Revenue (Billed)" value={currency.format(financial.revenue.billed)} caption="Total billed" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]">
        <Panel title="Revenue">
          <MetricRows rows={[["Billed", currency.format(financial.revenue.billed)], ["Collected", currency.format(financial.revenue.collected)], ["Outstanding", currency.format(financial.revenue.outstanding)], ["Collection rate", `${financial.collectionPerformance.collectionRate.toFixed(2)}%`]]} />
          {hasPermission("billing.read") && <Link className="mt-3 inline-flex text-xs font-medium text-blue-600 hover:underline" to="/billing">Open Billing →</Link>}
        </Panel>
        <Panel title="Upcoming">
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <MetricRows rows={[["Scheduled releases", financial.upcoming.scheduledRelease], ["Expected returns", financial.upcoming.expectedReturns], ["Manager approvals", financial.upcoming.pendingManagerApprovals], ["Customer acknowledgements", financial.upcoming.pendingCustomerAcknowledgements]]} />
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-blue-50 text-blue-500 dark:bg-blue-950"><CalendarDays size={24} /></div>
          </div>
        </Panel>
        <Panel title="Recent activity" action={hasPermission("users.manage") ? <Link to="/audit-trail">View all</Link> : undefined}>
          <div className="space-y-3">{recentActivity.length ? recentActivity.map((item) => <div key={item.id} className="flex gap-3 text-xs"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.kind === "rental" ? "bg-purple-500" : "bg-[#f0a93a]"}`} /><div className="min-w-0 flex-1"><strong className="block truncate capitalize">{item.title}</strong><span className="block truncate text-slate-500">{item.description}</span></div><time className="shrink-0 text-slate-500">{time.format(new Date(item.timestamp))}</time></div>) : <EmptyState className="px-3 py-6" title="No recent activity" description="Equipment updates, rentals, and assignments will appear here as your team starts working." />}</div>
        </Panel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel title="Fleet">
          {operational.totalEquipment === 0 ? <EmptyState className="px-4 py-6" title="No equipment in the system yet" description="Add your fleet to start tracking availability, assignments, and maintenance from this dashboard." action={hasPermission("equipment.create") ? <Link className="app-link" to="/equipment/new">Add equipment</Link> : undefined} /> : <><MetricRows rows={[["Total equipment tracked", model.fleetUtilization.total], ["Available", model.fleetUtilization.available], ["Assigned", model.fleetUtilization.assigned], ["Maintenance", model.fleetUtilization.maintenance]]} /><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label="Fleet utilization" aria-valuemin={0} aria-valuemax={100} aria-valuenow={model.utilizationRate}><div className="h-full rounded-full bg-[#f0a93a]" style={{ width: `${model.utilizationRate}%` }} /></div></>}
        </Panel>
        {model.categoryData.length ? <EquipmentCategoryChart data={model.categoryData} /> : <Panel title="Equipment by Category"><EmptyState className="px-4 py-6" title="No equipment category data yet" description="Category insights will appear once equipment is added." /></Panel>}
      </div>

    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="dashboard-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="dashboard-panel-title">{title}</h2>{action && <div className="rounded bg-slate-50 px-2 py-1 text-[11px] text-blue-600 dark:bg-slate-800">{action}</div>}</div>{children}</section>; }
function MetricRows({ rows }: { rows: [string, ReactNode][] }) { return <div>{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs last:border-0 dark:border-slate-800"><span className="text-slate-600 dark:text-slate-300">{label}</span><strong>{value}</strong></div>)}</div>; }
