import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/features/auth/AuthContext";
import { useRemoteDailyLogs } from "../hooks/useRemoteDailyLogs";

export default function RemoteDailyLogsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const { hasPermission } = useAuth();
  const state = useRemoteDailyLogs(refreshKey);
  const rows = useMemo(() => state.status !== "loaded" ? [] : state.model.rows.filter((row) =>
    (!search.trim() || row.searchText.includes(search.trim().toLowerCase())) &&
    (!date || row.workDate === date) && (!status || row.status === status),
  ), [state, search, date, status]);

  return <div className="app-page space-y-4">
    <PageHeader title="Daily Logs" description="Daily equipment activity recorded through DEUR." actions={<button className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium dark:border-slate-600 dark:bg-slate-900" onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button>} />
    {state.status === "loading" && <div className="dashboard-panel p-4 text-sm" role="status">Loading Daily Logs…</div>}
    {state.status === "error" && <div className="dashboard-panel p-4 text-sm" role="alert">Daily Logs could not be loaded. <button className="app-link" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button></div>}
    {state.status === "loaded" && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Effective DEURs", state.model.total], ["Today's DEURs", state.model.today], ["Equipment logged", state.model.equipmentLogged], ["Submitted / awaiting review", state.model.awaitingReview]].map(([label, value]) => <div key={label} className="dashboard-panel p-3"><span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span><strong className="text-xl">{value}</strong></div>)}
      </div>
      <div className="dashboard-panel flex flex-wrap gap-3 p-3">
        <label className="min-w-52 flex-1 text-xs text-slate-600 dark:text-slate-300">Search DEUR, equipment, operator, project or rental<input aria-label="Search Daily Logs" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="text-xs text-slate-600 dark:text-slate-300">Work date<input aria-label="Filter work date" type="date" className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="text-xs text-slate-600 dark:text-slate-300">Status<select aria-label="Filter status" className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["Draft", "In Progress", "Submitted", "Pending Acknowledgement", "Acknowledged", "Rejected", "Billed"].map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      {state.model.total === 0 ? <EmptyState title="No Daily Logs yet" description="DEUR field activity will appear here when it is recorded." /> : rows.length === 0 ? <EmptyState title="No matching Daily Logs" description="Try a different search, date, or status." /> : <ResponsiveTable><table className="min-w-[1100px] w-full text-left text-xs"><thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{["Work Date", "DEUR", "Equipment", "Operator", "Project", "Rental", "Shift", "Activity", "Meter", "Status", "Revision", "Action"].map((heading) => <th key={heading} scope="col" className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-slate-200 align-top dark:border-slate-700"><td className="px-3 py-3 whitespace-nowrap">{row.workDate}</td><td className="px-3 py-3 font-semibold">{row.deurNumber}</td><td className="px-3 py-3">{row.equipment}</td><td className="px-3 py-3">{row.operator}</td><td className="px-3 py-3">{row.project}</td><td className="px-3 py-3">{row.rental}<span className="block text-slate-500">{row.rentalEquipmentLine}</span></td><td className="px-3 py-3">{row.shift}</td><td className="px-3 py-3 min-w-48">{row.activity}</td><td className="px-3 py-3 min-w-36">{row.meter}</td><td className="px-3 py-3">{row.status}</td><td className="px-3 py-3">{row.revision}</td><td className="px-3 py-3">{hasPermission("rental.read") ? <Link aria-label={`Open Rental workspace for ${row.deurNumber}`} className="app-link whitespace-nowrap" to={`/rentals/${encodeURIComponent(row.rentalId)}/workspace`}>Open Rental</Link> : <span className="text-slate-500">Rental access required</span>}</td></tr>)}</tbody></table></ResponsiveTable>}
    </>}
  </div>;
}
