import { useState, type ReactNode } from "react";
import type * as React from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, DollarSign, FileClock, Package, RefreshCw, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import EquipmentCategoryChart from "@/features/dashboard/components/equipment-category-chart";
import EquipmentStatusChart from "@/features/dashboard/components/equipment-status-chart";
import { useDashboardViewModel } from "@/features/dashboard/hooks/useDashboardViewModel";

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = new Intl.DateTimeFormat("en-PH", { dateStyle: "short", timeStyle: "short" });
const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" });

export default function Dashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const model = useDashboardViewModel(refreshKey);
  const { operational, financial } = model;
  const refresh = () => { setRefreshKey((value) => value + 1); setUpdatedAt(new Date()); };
  return <div className="space-y-4">
    <div className="flex justify-end"><button className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800" onClick={refresh}><span>Last updated: {dateTime.format(updatedAt)}</span><RefreshCw size={14} /></button></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Metric icon={<Package />} tone="blue" label="Total Equipment" value={operational.totalEquipment} caption="All equipment in system" />
      <Metric icon={<CheckCircle2 />} tone="green" label="Available Equipment" value={operational.availableEquipment} caption="Ready for assignment" />
      <Metric icon={<Wrench />} tone="orange" label="In Maintenance" value={operational.maintenanceEquipment} caption="Under maintenance" />
      <Metric icon={<ClipboardCheck />} tone="purple" label="Active Rentals" value={operational.activeRentals} caption="Currently active" />
      <Metric icon={<FileClock />} tone="pink" label="Pending DEUR" value={model.pendingDeur} caption="Awaiting completion" />
      <Metric icon={<DollarSign />} tone="green" label="Revenue (Billed)" value={currency.format(financial.revenue.billed)} caption="Total billed" />
    </div>

    <div className="grid gap-4 lg:grid-cols-[0.9fr_1fr_1.15fr]">
      <Panel title="Revenue"><MetricRows rows={[["Billed", currency.format(financial.revenue.billed)], ["Collected", currency.format(financial.revenue.collected)], ["Outstanding", currency.format(financial.revenue.outstanding)]]} /><Link className="mt-3 inline-flex text-xs font-medium text-blue-600 hover:underline" to="/billing">Open Billing →</Link></Panel>
      <Panel title="Upcoming"><div className="grid grid-cols-[1fr_auto] items-center gap-4"><MetricRows rows={[["Scheduled releases", financial.upcoming.scheduledRelease], ["Expected returns", financial.upcoming.expectedReturns], ["Manager approvals", financial.upcoming.pendingManagerApprovals], ["Customer acknowledgements", financial.upcoming.pendingCustomerAcknowledgements]]} /><div className="grid h-16 w-16 place-items-center rounded-lg bg-blue-50 text-blue-500 dark:bg-blue-950"><CalendarDays size={32} /></div></div></Panel>
      <Panel title="Collection Performance"><div className="grid grid-cols-[1fr_auto] items-center gap-5"><MetricRows rows={[["Collection rate", `${financial.collectionPerformance.collectionRate.toFixed(2)}%`], ["Collected", currency.format(financial.collectionPerformance.totalCollected)], ["Outstanding", currency.format(financial.collectionPerformance.outstanding)]]} /><div className="grid h-24 w-24 place-items-center rounded-full bg-[conic-gradient(#2563eb_var(--rate),#e2e8f0_0)]" style={{ "--rate": `${financial.collectionPerformance.collectionRate}%` } as React.CSSProperties}><div className="grid h-16 w-16 place-items-center rounded-full bg-white text-sm font-semibold dark:bg-slate-900">{Math.round(financial.collectionPerformance.collectionRate)}%</div></div></div></Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]"><EquipmentStatusChart data={model.statusData} /><EquipmentCategoryChart data={model.categoryData} /></div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Fleet Utilization"><MetricRows rows={[["Total Equipment", operational.totalEquipment], ["Available", operational.availableEquipment], ["Assigned", operational.assignedEquipment], ["Maintenance", operational.maintenanceEquipment]]} /><div className="mt-4 flex justify-between text-xs"><span>Fleet Utilization</span><strong className="text-green-600">{model.utilizationRate}%</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-blue-600" style={{ width: `${model.utilizationRate}%` }} /></div></Panel>
      <Panel title="Recent Activity" action={<Link to="/audit-trail">View all</Link>}><div className="space-y-3">{model.activity.length ? model.activity.map((item) => <div key={item.id} className="flex gap-3 text-xs"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.kind === "rental" ? "bg-purple-500" : "bg-blue-500"}`} /><div className="min-w-0 flex-1"><strong className="block truncate capitalize">{item.title}</strong><span className="block truncate text-slate-500">{item.description}</span></div><time className="shrink-0 text-slate-500">{time.format(new Date(item.timestamp))}</time></div>) : <Empty />}</div></Panel>
      <Panel title="Recent Equipment Activity" action={<Link to="/equipment">View all</Link>}><div className="overflow-x-auto"><table className="w-full min-w-[430px] text-left text-[11px]"><thead><tr className="border-b border-slate-200 dark:border-slate-700"><th className="py-2">Equipment</th><th>Activity</th><th>By</th><th>At</th></tr></thead><tbody>{model.recentEquipmentActivity.map((item) => <tr key={item.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800"><td className="py-2.5"><Link className="font-medium text-blue-600" to={`/equipment/${item.equipmentId}`}>{item.equipment?.assetNo ?? "Unknown"}</Link></td><td>{item.title}</td><td>{item.actor}</td><td>{time.format(new Date(item.timestamp))}</td></tr>)}</tbody></table>{!model.recentEquipmentActivity.length && <Empty />}</div></Panel>
    </div>
  </div>;
}

function Metric({ icon, tone, label, value, caption }: { icon: ReactNode; tone: "blue" | "green" | "orange" | "purple" | "pink"; label: string; value: ReactNode; caption: string }) {
  const tones = { blue: "bg-blue-50 text-blue-600 dark:bg-blue-950", green: "bg-green-50 text-green-600 dark:bg-green-950", orange: "bg-orange-50 text-orange-500 dark:bg-orange-950", purple: "bg-purple-50 text-purple-600 dark:bg-purple-950", pink: "bg-rose-50 text-rose-500 dark:bg-rose-950" };
  return <section className="dashboard-panel flex min-h-24 items-center gap-3 p-4"><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full [&_svg]:h-6 [&_svg]:w-6 ${tones[tone]}`}>{icon}</div><div className="min-w-0"><h2 className="truncate text-[11px] font-medium">{label}</h2><div className="mt-1 truncate text-xl font-semibold">{value}</div><p className="mt-1 truncate text-[10px] text-slate-500">{caption}</p></div></section>;
}
function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="dashboard-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="dashboard-panel-title">{title}</h2>{action && <div className="rounded bg-slate-50 px-2 py-1 text-[11px] text-blue-600 dark:bg-slate-800">{action}</div>}</div>{children}</section>; }
function MetricRows({ rows }: { rows: [string, ReactNode][] }) { return <div>{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs last:border-0 dark:border-slate-800"><span className="text-slate-600 dark:text-slate-300">{label}</span><strong>{value}</strong></div>)}</div>; }
function Empty() { return <p className="py-7 text-center text-xs text-slate-500">No recent activity.</p>; }
