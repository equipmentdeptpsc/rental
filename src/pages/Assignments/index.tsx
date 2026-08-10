import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import type { AssignmentRecord } from "@/features/assignment/types";
import { displayAssignmentExpectedReturn } from "@/features/assignment/utils/assignmentDisplay";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";

export default function Assignments() {
  const { assignments } = useAssignment();
  const { getEquipment } = useEquipment();
  const { operators } = useOperator();
  const { projects } = useProject();
  const [query, setQuery] = useState("");
  const current = assignments.filter((item) => item.status === "Active");
  const history = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return assignments.filter((item) => item.status !== "Active").filter((item) => {
      const equipment = getEquipment(item.equipmentId);
      const operator = operators.find((record) => record.id === item.operatorId);
      const project = projects.find((record) => record.id === item.projectId);
      return `${item.id} ${equipment?.assetNo ?? ""} ${equipment?.equipmentName ?? ""} ${operator?.name ?? ""} ${project?.projectName ?? ""}`.toLowerCase().includes(normalized);
    });
  }, [assignments, getEquipment, operators, projects, query]);

  const table = (records: AssignmentRecord[], empty: string) => <ResponsiveTable><div className="min-w-max rounded-xl border bg-white shadow-sm"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr>{["Assignment", "Equipment", "Operator", "Project", "Assigned", "Expected Return", "Completed / Returned", "Status", "Action"].map((label) => <th className="px-4 py-3 text-left" key={label}>{label}</th>)}</tr></thead><tbody>{records.length === 0 ? <tr><td className="py-10 text-center text-slate-500" colSpan={9}>{empty}</td></tr> : records.map((assignment) => { const equipment=getEquipment(assignment.equipmentId),operator=operators.find(item=>item.id===assignment.operatorId),project=projects.find(item=>item.id===assignment.projectId); return <tr className="border-t" key={assignment.id}><td className="px-4 py-3 font-mono text-xs">{assignment.id}</td><td className="px-4 py-3">{equipment?`${equipment.assetNo} — ${equipment.equipmentName}`:"Unknown equipment"}</td><td className="px-4 py-3">{operator?.name??"Unknown operator"}</td><td className="px-4 py-3">{project?.projectName??"Unknown project"}</td><td className="px-4 py-3">{assignment.assignedDate}</td><td className="px-4 py-3">{displayAssignmentExpectedReturn(assignment.expectedReturn)}</td><td className="px-4 py-3">{assignment.returnedDate??"—"}</td><td className="px-4 py-3">{assignment.status}</td><td className="px-4 py-3"><Link className="text-blue-600 hover:underline" to={`/assignments/${assignment.id}`}>View Details</Link></td></tr>; })}</tbody></table></div></ResponsiveTable>;

  return <div className="space-y-8 p-8"><header className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">Assignment Operations</h1><p className="text-slate-500">Monitor current bookings and preserved assignment history.</p></div><Link to="/assignments/new"><Button>New Assignment</Button></Link></header><section className="space-y-3"><h2 className="text-xl font-semibold">Current Assignments ({current.length})</h2>{table(current,"No current assignments.")}</section><section className="space-y-3"><div><h2 className="text-xl font-semibold">Completed Assignments / History ({history.length})</h2><p className="text-sm text-slate-500">Completed and cancelled records remain available for audit.</p></div><input aria-label="Search completed assignments" className="w-full rounded border bg-white p-3" onChange={(event)=>setQuery(event.target.value)} placeholder="Search assignment, equipment, operator, or project" value={query}/>{table(history,"No completed or cancelled assignments match.")}</section></div>;
}
