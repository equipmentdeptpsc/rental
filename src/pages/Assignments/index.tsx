import { useMemo, useState } from "react";
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
  return <div className="app-page"><PageHeader title="Bookings" description="Coordinate equipment, operators, and projects across every assignment." actions={canCreate ? <Link to="/assignments/new"><Button className="bg-[#f0a93a] text-[#071a33] hover:bg-[#d99a2f]">New Booking</Button></Link> : undefined} />{!canCreate && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">{REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE}</p>}{state.status === "empty" ? <div className="app-card p-10 text-center text-slate-500">No canonical Bookings found.</div> : <RemoteAssignmentSections data={state.data} />}</div>;
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
