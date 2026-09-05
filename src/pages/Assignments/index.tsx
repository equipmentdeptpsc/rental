import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, Columns3, List, Rows3 } from "lucide-react";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useCanonicalAssignmentData, type CanonicalAssignmentData } from "@/features/assignment/hooks/useCanonicalAssignmentData";
import { getAssignmentRuntimeCapability, REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/assignment/services/assignmentRuntimeCapability";
import type { AssignmentRecord } from "@/features/assignment/types";
import { displayAssignmentDate, displayAssignmentExpectedReturn, getAssignmentNumber } from "@/features/assignment/utils/assignmentDisplay";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useAuth } from "@/features/auth/AuthContext";
import FilterBar from "@/components/ui/FilterBar";
import StatusBadge from "@/components/ui/StatusBadge";
import { canonicalBookingStatuses, type CanonicalBookingListItem, type CanonicalBookingPage, type CanonicalBookingSearchInput, type CanonicalBookingSort } from "@/features/booking/canonical";

export default function Assignments() {
  const { configuration } = useApplicationDependenciesCompatibility();
  return getAssignmentRuntimeCapability(configuration).canonicalReads ? <RemoteAssignments /> : <LocalAssignments />;
}

function RemoteAssignments() {
  const { configuration, commandRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const state = useCanonicalAssignmentData();
  if (state.status === "loading") return <div className="p-8 text-slate-500">Loading canonical Assignments…</div>;
  if (state.status === "error") return <div className="p-8" role="alert">{state.message}<button className="ml-3 underline" onClick={state.retry}>Retry</button></div>;
  const canCreate = getAssignmentRuntimeCapability(configuration, Boolean(commandRepositories.canonicalAssignment)).canonicalMutations && hasPermission("assignment.manage");
  return <div className="app-page"><PageHeader title="Bookings" description="Coordinate equipment, operators, and projects across assignments and rental lines." actions={canCreate ? <Link to="/assignments/new"><Button className="bg-[#f0a93a] text-[#071a33] hover:bg-[#d99a2f]">New Booking</Button></Link> : undefined} />{!canCreate && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">{REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE}</p>}{state.status === "empty" ? <div className="app-card p-10 text-center text-slate-500">No canonical Bookings found.</div> : <RemoteBookingTabs data={state.data} />}</div>;
}

function RemoteBookingTabs({ data }: { data: CanonicalAssignmentData }) {
  const [tab, setTab] = useState<"assignments" | "rentals">("assignments");
  return <div className="space-y-4"><div className="app-card flex flex-wrap gap-1 p-2" role="tablist" aria-label="Booking views"><button type="button" role="tab" aria-selected={tab === "assignments"} className={`rounded-md px-4 py-2 text-sm font-medium ${tab === "assignments" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`} onClick={() => setTab("assignments")}>Assignments</button><button type="button" role="tab" aria-selected={tab === "rentals"} className={`rounded-md px-4 py-2 text-sm font-medium ${tab === "rentals" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`} onClick={() => setTab("rentals")}>Rental Bookings</button></div>{tab === "assignments" ? <RemoteAssignmentSections data={data} /> : <RentalBookingsView />}</div>;
}

function RentalBookingsView() {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const canReadCustomer = hasPermission("customer.read"), canReadProject = hasPermission("project.read"), canReadEquipment = hasPermission("equipment.read");
  const [filters, setFilters] = useState<CanonicalBookingSearchInput>({ limit: 25, sort: "createdAt" });
  const [page, setPage] = useState<CanonicalBookingPage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [optionState, setOptionState] = useState<{ customers: Array<[string, string]>; projects: Array<[string, string]>; equipment: Array<[string, string]> }>({ customers: [], projects: [], equipment: [] });
  const load = async (input: CanonicalBookingSearchInput) => { setStatus("loading"); const response = await readRepositories.canonicalBookings.searchCanonicalBookingRows(input); if (response.success) { setPage(response.value); setError(""); setStatus("ready"); } else { setPage(null); setError(response.error.message); setStatus("error"); } };
  useEffect(() => { void load(filters); }, [filters]);
  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      const [customers, projects, equipment] = await Promise.all([
        canReadCustomer ? readRepositories.customers.list({ paging: { limit: 100 }, ordering: [{ field: "name", ascending: true }] }) : Promise.resolve(null),
        canReadProject ? readRepositories.projects.list({ paging: { limit: 100 }, ordering: [{ field: "name", ascending: true }] }) : Promise.resolve(null),
        canReadEquipment ? readRepositories.equipment.list({ paging: { limit: 100 }, ordering: [{ field: "equipmentName", ascending: true }] }) : Promise.resolve(null),
      ]);
      if (!active) return;
      setOptionState({
        customers: customers?.success ? customers.value.items.flatMap((item) => item.id && item.companyName ? [[item.id, item.companyName] as [string, string]] : []) : [],
        projects: projects?.success ? projects.value.items.flatMap((item) => item.id && item.projectName ? [[item.id, `${item.projectCode} · ${item.projectName}`] as [string, string]] : []) : [],
        equipment: equipment?.success ? equipment.value.items.flatMap((item) => item.id && item.equipmentName ? [[item.id, `${item.assetNo ? `${item.assetNo} · ` : ""}${item.equipmentName}`] as [string, string]] : []) : [],
      });
    };
    void loadOptions();
    return () => { active = false; };
  }, [canReadCustomer, canReadProject, canReadEquipment, readRepositories]);
  const setFilter = (key: keyof CanonicalBookingSearchInput, value: string) => { setPage(null); setFilters((current) => ({ ...current, [key]: value || undefined, offset: 0 })); };
  const customers = optionState.customers, projects = optionState.projects, equipment = optionState.equipment;
  const reset = () => setFilters({ limit: 25, sort: "createdAt", offset: 0 });
  const totalPages = page ? Math.max(1, Math.ceil(page.totalCount / page.limit)) : 1;
  const currentPage = page ? Math.floor(page.offset / page.limit) + 1 : 1;
  return <section aria-label="Rental Bookings" className="space-y-4"><div><h2 className="font-display text-lg font-semibold">Rental Bookings</h2><p className="text-sm text-slate-500">One row per Rental Equipment Line, read from the canonical projection.</p></div><div className="app-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Search Rental Number<input aria-label="Search Rental Number" className="app-control mt-1 w-full" value={filters.rentalNumberSearch ?? ""} onChange={(event) => setFilter("rentalNumberSearch", event.target.value)} placeholder="Search Rental Number" /></label><label className="text-xs font-medium text-slate-600 dark:text-slate-300">Status<select aria-label="Rental status" className="app-control mt-1 w-full" value={filters.status ?? ""} onChange={(event) => setFilter("status", event.target.value)}><option value="">All statuses</option>{canonicalBookingStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>{hasPermission("customer.read") && <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Customer<select aria-label="Rental customer" className="app-control mt-1 w-full" value={filters.customerId ?? ""} onChange={(event) => setFilter("customerId", event.target.value)}><option value="">All customers</option>{customers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}{hasPermission("project.read") && <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Project<select aria-label="Rental project" className="app-control mt-1 w-full" value={filters.projectId ?? ""} onChange={(event) => setFilter("projectId", event.target.value)}><option value="">All projects</option>{projects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}{hasPermission("equipment.read") && <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Equipment<select aria-label="Rental equipment" className="app-control mt-1 w-full" value={filters.equipmentId ?? ""} onChange={(event) => setFilter("equipmentId", event.target.value)}><option value="">All equipment</option>{equipment.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}<label className="text-xs font-medium text-slate-600 dark:text-slate-300">Sort<select aria-label="Rental booking sort" className="app-control mt-1 w-full" value={filters.sort ?? "createdAt"} onChange={(event) => setFilter("sort", event.target.value)}><option value="createdAt">Newest</option><option value="dateOut">Date Out</option><option value="expectedReturn">Expected Return</option><option value="rentalStatus">Status</option></select></label><Button variant="secondary" className="self-end" onClick={reset}>Reset</Button></div>{status === "loading" && <div className="app-card p-6 text-sm text-slate-500" role="status">Loading rental bookings…</div>}{status === "error" && <div className="app-card p-6 text-sm text-rose-700" role="alert">{error}<button className="ml-3 underline" onClick={() => void load(filters)}>Retry</button></div>}{status === "ready" && <><RentalBookingTable rows={page?.rows ?? []} /><div className="flex items-center justify-center gap-3"><Button variant="secondary" disabled={currentPage <= 1} onClick={() => setFilters((current) => ({ ...current, offset: Math.max(0, (current.offset ?? 0) - (current.limit ?? 25)) }))}>Previous</Button><span className="text-sm">Page {currentPage} of {totalPages} · {page?.totalCount ?? 0} bookings</span><Button variant="secondary" disabled={!page?.hasMore} onClick={() => setFilters((current) => ({ ...current, offset: (current.offset ?? 0) + (current.limit ?? 25) }))}>Next</Button></div></>}</section>;
}

function RentalBookingTable({ rows }: { rows: readonly CanonicalBookingListItem[] }) {
  if (!rows.length) return <div className="app-card p-8 text-center text-slate-500">No rental bookings found.</div>;
  return <ResponsiveTable><div className="app-card min-w-[760px] overflow-hidden"><table className="app-table w-full text-left text-sm"><thead><tr>{["Rental #", "Equipment", "Customer", "Project", "Status", "Date Out", "Expected Return", "Action"].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.rentalEquipmentLineId} className="align-top"><td className="p-3 font-semibold text-blue-600">{row.rentalNumber ?? "—"}</td><td className="p-3"><span className="block font-medium">{row.equipmentName ?? "—"}</span><span className="block text-xs text-slate-500">{row.equipmentAssetNumber ?? "—"}</span></td><td className="p-3">{row.customerName ?? "—"}</td><td className="p-3">{row.projectName ?? "—"}</td><td className="p-3"><StatusBadge tone="neutral">{row.rentalStatus}</StatusBadge></td><td className="p-3">{row.dateOut.slice(0, 10)}</td><td className="p-3">{row.expectedReturn?.slice(0, 10) ?? "—"}</td><td className="p-3"><Link className="text-blue-600 hover:underline" to={`/rentals/${row.rentalId}`}>Open Rental</Link></td></tr>)}</tbody></table></div></ResponsiveTable>;
}

function RemoteAssignmentSections({ data }: { data: CanonicalAssignmentData }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<AssignmentView>("list");
  const current = data.assignments.filter((item) => item.status === "Active");
  const overdue = current.filter((item) => assignmentViewStatus(item) === "Overdue");
  const history = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.assignments.filter((item) => item.status !== "Active").filter((item) => remoteSearchText(item, data).includes(normalized));
  }, [data, query]);
  return <><AssignmentToolbar view={view} setView={setView} /><section className="space-y-3"><h2 className="font-display text-lg font-semibold">Current Bookings ({current.length})</h2>{overdue.length > 0 && <div className="flex items-start gap-3 rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 p-3 text-sm text-amber-900"><span>⚠</span><p><strong>{overdue.length} {overdue.length === 1 ? "booking is" : "bookings are"} overdue for return.</strong> Review the highlighted records below.</p></div>}{view === "list" ? remoteTable(current, data, "No current Bookings.") : <AssignmentBoard records={current} data={data} view={view} />}</section><section className="space-y-3"><div><h2 className="font-display text-lg font-semibold">Completed / History ({history.length})</h2><p className="text-sm text-slate-500">Completed and cancelled canonical records remain available for audit.</p></div><FilterBar onClear={()=>setQuery("")} canClear={Boolean(query)}><label className="min-w-[16rem] flex-1 text-xs font-medium text-slate-600 dark:text-slate-300"><span className="block">Search history</span><input aria-label="Search completed assignments" className="app-control mt-1 w-full" onChange={(event) => setQuery(event.target.value)} placeholder="Assignment, equipment, operator, or project" value={query} /></label></FilterBar>{remoteTable(history, data, "No completed or cancelled Bookings match.")}</section></>;
}

function remoteSearchText(assignment: AssignmentRecord, data: CanonicalAssignmentData) {
  const equipment = data.equipment.find((item) => item.id === assignment.equipmentId), operator = data.operators.find((item) => item.id === assignment.operatorId), project = data.projects.find((item) => item.id === assignment.projectId);
  return `${getAssignmentNumber(assignment.id, data.assignments)} ${equipment?.assetNo ?? ""} ${equipment?.equipmentName ?? ""} ${operator?.name ?? ""} ${project?.name ?? ""}`.toLowerCase();
}

function remoteTable(records: AssignmentRecord[], data: CanonicalAssignmentData, empty: string) {
  return <ResponsiveTable><div className="app-card min-w-max overflow-hidden"><table className="app-table min-w-full text-sm"><thead><tr>{["Assignment", "Equipment", "Operator", "Project", "Assigned", "Expected Return", "Completed / Returned", "Status", "Action"].map((label) => <th className="px-4 py-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{records.length === 0 ? <tr><td className="py-10 text-center text-slate-500" colSpan={9}>{empty}</td></tr> : records.map((assignment) => {
    const equipment = data.equipment.find((item) => item.id === assignment.equipmentId), operator = data.operators.find((item) => item.id === assignment.operatorId), project = data.projects.find((item) => item.id === assignment.projectId);
    const state = assignmentViewStatus(assignment);
    return <tr key={assignment.id} className="hover:bg-amber-50/60 dark:hover:bg-amber-950/20"><td className="px-4 py-3 font-semibold text-blue-600">{getAssignmentNumber(assignment.id, data.assignments)}</td><td className="px-4 py-3"><span className="block font-medium">{equipment?.equipmentName ?? "—"}</span><span className="block text-xs text-slate-500">{equipment?.assetNo ?? "—"}</span></td><td className="px-4 py-3">{operator?.name || "—"}</td><td className="px-4 py-3">{project?.name || "—"}</td><td className="px-4 py-3">{displayAssignmentDate(assignment.assignedDate)}</td><td className="px-4 py-3">{displayAssignmentExpectedReturn(assignment.expectedReturn)}</td><td className="px-4 py-3">{displayAssignmentDate(assignment.returnedDate)}</td><td className="px-4 py-3"><StatusBadge className={state === "Overdue" ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300" : state === "Active" ? "bg-[#f0a93a] text-[#071a33]" : ""} tone={state === "Completed" ? "success" : "neutral"}>{state}</StatusBadge></td><td className="px-4 py-3"><Link aria-label={`View ${getAssignmentNumber(assignment.id, data.assignments)}`} className="inline-flex rounded p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800" to={`/assignments/${assignment.id}`}><ChevronRight size={17} aria-hidden="true" /></Link></td></tr>;
  })}</tbody></table></div></ResponsiveTable>;
}

type AssignmentView = "timeline" | "kanban" | "calendar" | "list";

function assignmentViewStatus(assignment: AssignmentRecord): "Active" | "Overdue" | "Completed" | "Cancelled" {
  if (assignment.status === "Completed" || assignment.status === "Cancelled") return assignment.status;
  const expected = assignment.expectedReturn && !assignment.expectedReturn.startsWith("1970-01-01") ? assignment.expectedReturn.slice(0, 10) : "";
  const today = new Date().toISOString().slice(0, 10);
  return expected && expected < today && !assignment.returnedDate ? "Overdue" : "Active";
}

function AssignmentToolbar({ view, setView }: { view: AssignmentView; setView: (view: AssignmentView) => void }) {
  const options: Array<[AssignmentView, string, typeof Rows3]> = [["timeline", "Timeline", Rows3], ["kanban", "Kanban", Columns3], ["calendar", "Calendar", CalendarDays], ["list", "List", List]];
  return <div className="app-card flex flex-wrap items-center justify-between gap-3 p-3"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">View</span><div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">{options.map(([key, label, Icon]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${view === key ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}`}><Icon size={15} aria-hidden="true" />{label}</button>)}</div></div>;
}

function AssignmentBoard({ records, data, view }: { records: AssignmentRecord[]; data: CanonicalAssignmentData; view: Exclude<AssignmentView, "list"> }) {
  return <div className={`grid gap-3 ${view === "kanban" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>{records.length === 0 ? <div className="app-card p-6 text-sm text-slate-500">No current Bookings.</div> : records.map((assignment) => { const equipment = data.equipment.find((item) => item.id === assignment.equipmentId); const operator = data.operators.find((item) => item.id === assignment.operatorId); const project = data.projects.find((item) => item.id === assignment.projectId); const state = assignmentViewStatus(assignment); return <article key={assignment.id} className="app-card space-y-2 p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-display font-semibold">{getAssignmentNumber(assignment.id, data.assignments)}</h3><StatusBadge tone={state === "Completed" ? "success" : "neutral"} className={state === "Overdue" ? "bg-rose-100 text-rose-800" : state === "Active" ? "bg-[#f0a93a] text-[#071a33]" : ""}>{state}</StatusBadge></div><p className="font-medium">{equipment?.equipmentName ?? "—"}</p><p className="text-sm text-slate-500">{operator?.name ?? "—"} · {project?.name ?? "—"}</p><p className="text-xs text-slate-500">{displayAssignmentDate(assignment.assignedDate)} → {displayAssignmentExpectedReturn(assignment.expectedReturn)}</p></article>; })}</div>;
}

function LocalAssignments() {
  const { assignments } = useAssignment();
  const { getEquipment } = useEquipment();
  const { operators } = useOperator();
  const { projects } = useProject();
  const [query, setQuery] = useState("");
  const current = assignments.filter((item) => item.status === "Active");
  const history = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return assignments.filter((item) => item.status !== "Active").filter((item) => {
      const equipment = getEquipment(item.equipmentId), operator = operators.find((record) => record.id === item.operatorId), project = projects.find((record) => record.id === item.projectId);
      return `${getAssignmentNumber(item.id, assignments)} ${equipment?.assetNo ?? ""} ${equipment?.equipmentName ?? ""} ${operator?.name ?? ""} ${project?.projectName ?? ""}`.toLowerCase().includes(normalized);
    });
  }, [assignments, getEquipment, operators, projects, query]);
  const table = (records: AssignmentRecord[], empty: string) => <ResponsiveTable><div className="app-card min-w-max overflow-hidden"><table className="app-table min-w-full text-sm"><thead><tr>{["Assignment", "Equipment", "Operator", "Project", "Assigned", "Expected Return", "Completed / Returned", "Status", "Action"].map((label) => <th className="px-4 py-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{records.length === 0 ? <tr><td className="py-10 text-center text-slate-500" colSpan={9}>{empty}</td></tr> : records.map((assignment) => {
    const equipment = getEquipment(assignment.equipmentId), operator = operators.find((item) => item.id === assignment.operatorId), project = projects.find((item) => item.id === assignment.projectId);
    const state = assignmentViewStatus(assignment); return <tr key={assignment.id} className="hover:bg-amber-50/60 dark:hover:bg-amber-950/20"><td className="px-4 py-3 font-semibold text-blue-600">{getAssignmentNumber(assignment.id, assignments)}</td><td className="px-4 py-3"><span className="block font-medium">{equipment?.equipmentName ?? "—"}</span><span className="block text-xs text-slate-500">{equipment?.assetNo ?? "—"}</span></td><td className="px-4 py-3">{operator?.name ?? "—"}</td><td className="px-4 py-3">{project?.projectName ?? "—"}</td><td className="px-4 py-3">{displayAssignmentDate(assignment.assignedDate)}</td><td className="px-4 py-3">{displayAssignmentExpectedReturn(assignment.expectedReturn)}</td><td className="px-4 py-3">{displayAssignmentDate(assignment.returnedDate)}</td><td className="px-4 py-3"><StatusBadge tone={state === "Completed" ? "success" : "neutral"} className={state === "Overdue" ? "bg-rose-100 text-rose-800" : state === "Active" ? "bg-[#f0a93a] text-[#071a33]" : ""}>{state}</StatusBadge></td><td className="px-4 py-3"><Link aria-label={`View ${getAssignmentNumber(assignment.id, assignments)}`} className="inline-flex rounded p-1 text-blue-600 hover:bg-blue-50" to={`/assignments/${assignment.id}`}><ChevronRight size={17} aria-hidden="true" /></Link></td></tr>;
  })}</tbody></table></div></ResponsiveTable>;
  return <div className="app-page"><PageHeader title="Bookings" description="Coordinate equipment, operators, and projects across every booking." actions={<Link to="/assignments/new"><Button className="bg-[#f0a93a] text-[#071a33] hover:bg-[#d99a2f]">New Booking</Button></Link>} /><section className="space-y-3"><h2 className="font-display text-lg font-semibold">Current Bookings ({current.length})</h2>{table(current, "No current Bookings.")}</section><section className="space-y-3"><div><h2 className="font-display text-lg font-semibold">Completed / History ({history.length})</h2><p className="text-sm text-slate-500">Completed and cancelled records remain available for audit.</p></div><FilterBar onClear={() => setQuery("")} canClear={Boolean(query)}><label className="min-w-[16rem] flex-1 text-xs font-medium text-slate-600"><span className="block">Search history</span><input aria-label="Search completed assignments" className="app-control mt-1 w-full" onChange={(event) => setQuery(event.target.value)} placeholder="Assignment, equipment, operator, or project" value={query} /></label></FilterBar>{table(history, "No completed or cancelled Bookings match.")}</section></div>;
}
