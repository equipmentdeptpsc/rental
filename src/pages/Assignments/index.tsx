import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import PageHeader from "@/components/ui/PageHeader";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useCanonicalAssignmentData, type CanonicalAssignmentData } from "@/features/assignment/hooks/useCanonicalAssignmentData";
import { getAssignmentRuntimeCapability, REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/assignment/services/assignmentRuntimeCapability";
import type { AssignmentRecord } from "@/features/assignment/types";
import { displayAssignmentExpectedReturn, getAssignmentNumber } from "@/features/assignment/utils/assignmentDisplay";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useAuth } from "@/features/auth/AuthContext";

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
  return <div className="app-page"><PageHeader title="Assignment Operations" description="Monitor canonical Assignment bookings and history." actions={canCreate ? <Link to="/assignments/new"><Button>New Assignment</Button></Link> : undefined} />{!canCreate && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">{REMOTE_ASSIGNMENT_MUTATION_UNAVAILABLE_MESSAGE}</p>}{state.status === "empty" ? <div className="app-card p-10 text-center text-slate-500">No canonical Assignments found.</div> : <RemoteAssignmentSections data={state.data} />}</div>;
}

function RemoteAssignmentSections({ data }: { data: CanonicalAssignmentData }) {
  const [query, setQuery] = useState("");
  const current = data.assignments.filter((item) => item.status === "Active");
  const history = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return data.assignments.filter((item) => item.status !== "Active").filter((item) => remoteSearchText(item, data).includes(normalized));
  }, [data, query]);
  return <><section className="space-y-3"><h2 className="text-lg font-semibold">Current Assignments ({current.length})</h2>{remoteTable(current, data, "No current Assignments.")}</section><section className="space-y-3"><div><h2 className="text-lg font-semibold">Completed Assignments / History ({history.length})</h2><p className="text-sm text-slate-500">Completed and cancelled canonical records remain available for audit.</p></div><input aria-label="Search completed assignments" className="app-control w-full" onChange={(event) => setQuery(event.target.value)} placeholder="Search assignment number, equipment, operator, or project" value={query} />{remoteTable(history, data, "No completed or cancelled Assignments match.")}</section></>;
}

function remoteSearchText(assignment: AssignmentRecord, data: CanonicalAssignmentData) {
  const equipment = data.equipment.find((item) => item.id === assignment.equipmentId), operator = data.operators.find((item) => item.id === assignment.operatorId), project = data.projects.find((item) => item.id === assignment.projectId);
  return `${getAssignmentNumber(assignment.id, data.assignments)} ${equipment?.assetNo ?? ""} ${equipment?.equipmentName ?? ""} ${operator?.name ?? ""} ${project?.name ?? ""}`.toLowerCase();
}

function remoteTable(records: AssignmentRecord[], data: CanonicalAssignmentData, empty: string) {
  return <ResponsiveTable><div className="app-card min-w-max overflow-hidden"><table className="app-table min-w-full text-sm"><thead><tr>{["Assignment", "Equipment", "Operator", "Project", "Assigned", "Expected Return", "Completed / Returned", "Status", "Action"].map((label) => <th className="px-4 py-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{records.length === 0 ? <tr><td className="py-10 text-center text-slate-500" colSpan={9}>{empty}</td></tr> : records.map((assignment) => {
    const equipment = data.equipment.find((item) => item.id === assignment.equipmentId), operator = data.operators.find((item) => item.id === assignment.operatorId), project = data.projects.find((item) => item.id === assignment.projectId);
    return <tr key={assignment.id}><td className="px-4 py-3 font-semibold text-blue-600">{getAssignmentNumber(assignment.id, data.assignments)}</td><td className="px-4 py-3">{equipment ? `${equipment.assetNo} — ${equipment.equipmentName}` : "Unknown canonical Equipment"}</td><td className="px-4 py-3">{operator?.name || "Unknown canonical Operator"}</td><td className="px-4 py-3">{project?.name || "Unknown canonical Project"}</td><td className="px-4 py-3">{assignment.assignedDate}</td><td className="px-4 py-3">{displayAssignmentExpectedReturn(assignment.expectedReturn)}</td><td className="px-4 py-3">{assignment.returnedDate ?? "—"}</td><td className="px-4 py-3"><span className={`status-badge ${assignment.status === "Active" ? "status-success" : "status-neutral"}`}>{assignment.status}</span></td><td className="px-4 py-3"><Link className="font-medium text-blue-600 hover:underline" to={`/assignments/${assignment.id}`}>View Details</Link></td></tr>;
  })}</tbody></table></div></ResponsiveTable>;
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
    return <tr key={assignment.id}><td className="px-4 py-3 font-semibold text-blue-600">{getAssignmentNumber(assignment.id, assignments)}</td><td className="px-4 py-3">{equipment ? `${equipment.assetNo} — ${equipment.equipmentName}` : "Unknown equipment"}</td><td className="px-4 py-3">{operator?.name ?? "Unknown operator"}</td><td className="px-4 py-3">{project?.projectName ?? "Unknown project"}</td><td className="px-4 py-3">{assignment.assignedDate}</td><td className="px-4 py-3">{displayAssignmentExpectedReturn(assignment.expectedReturn)}</td><td className="px-4 py-3">{assignment.returnedDate ?? "—"}</td><td className="px-4 py-3"><span className={`status-badge ${assignment.status === "Active" ? "status-success" : "status-neutral"}`}>{assignment.status}</span></td><td className="px-4 py-3"><Link className="font-medium text-blue-600 hover:underline" to={`/assignments/${assignment.id}`}>View Details</Link></td></tr>;
  })}</tbody></table></div></ResponsiveTable>;
  return <div className="app-page"><PageHeader title="Assignment Operations" description="Monitor current bookings and preserved assignment history." actions={<Link to="/assignments/new"><Button>New Assignment</Button></Link>} /><section className="space-y-3"><h2 className="text-lg font-semibold">Current Assignments ({current.length})</h2>{table(current, "No current assignments.")}</section><section className="space-y-3"><div><h2 className="text-lg font-semibold">Completed Assignments / History ({history.length})</h2><p className="text-sm text-slate-500">Completed and cancelled records remain available for audit.</p></div><input aria-label="Search completed assignments" className="app-control w-full" onChange={(event) => setQuery(event.target.value)} placeholder="Search assignment number, equipment, operator, or project" value={query} />{table(history, "No completed or cancelled assignments match.")}</section></div>;
}
