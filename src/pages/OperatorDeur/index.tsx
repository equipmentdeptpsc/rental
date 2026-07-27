import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useWorkDescriptions } from "@/features/masters/work-description";
import { createDeur } from "@/features/rental/deur/services/CreateDeurService";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { subscribeDeurChanges } from "@/features/rental/deur/synchronization/deurChangeNotifications";
import { evaluateOperatorDigitalDeurAccess } from "@/features/rental/deur/operator/evaluateOperatorDigitalDeurAccess";
import { resolveActiveOperatorDeur } from "@/features/rental/deur/operator/resolveActiveOperatorDeur";
import { projectDigitalDeurRunningState } from "@/features/rental/deur/operator/projectDigitalDeurRunningState";
import type { DeurOperatorAction } from "@/features/rental/deur/operator/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import { resolveAuthenticatedOperator } from "@/features/rental/deur/operator/resolveAuthenticatedOperator";

const actionLabels: Record<DeurOperatorAction, string> = { START_OPERATION: "Start Operation", RESUME_OPERATION: "Resume Operation", START_IDLE: "Idle", START_MEAL_BREAK: "Meal Break", START_BREAKDOWN: "Breakdown", END_ACTIVITY:"End Activity", END_SHIFT: "End Shift" };
const formatElapsed = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
export const operatorActionSuccessMessage = (action: DeurOperatorAction) => `${actionLabels[action]} saved locally.`;

export default function OperatorDeurPage() {
  const { rentalId = "" } = useParams(); const [searchParams,setSearchParams]=useSearchParams(); const { user } = useAuth(); const { rentals, rentalEquipmentLines } = useRental(); const { assignments } = useAssignment(); const { operators } = useOperator(); const { equipment } = useEquipment(); const { projects } = useProject(); const { records: workDescriptions } = useWorkDescriptions();
  const rental = rentals.find((item) => item.id === rentalId); const operatorLines = rentalEquipmentLines.filter((line) => line.rentalId === rentalId && ["Released", "Active"].includes(line.status));
  const requestedLineId=searchParams.get("lineId")??""; const [selectedLineId, setSelectedLineId] = useState(() => operatorLines.some(line=>line.id===requestedLineId)?requestedLineId:operatorLines.length === 1 ? operatorLines[0].id : ""); const selectedLine = operatorLines.find((line) => line.id === selectedLineId); const assignment = assignments.find((item) => item.id === selectedLine?.assignmentId), linkedIdentity=resolveAuthenticatedOperator(user??undefined,operators), operator = operators.find(item=>item.id===assignment?.operatorId), machine = equipment.find((item) => item.id === selectedLine?.equipmentId), project = projects.find((item) => item.id === rental?.projectId);
  const [version, setVersion] = useState(0), [clock, setClock] = useState(() => new Date().toISOString()), [message, setMessage] = useState(""), [remarks, setRemarks] = useState("");
  const [shift, setShift] = useState<DeurRecord["shift"]>(() => rental?.deurExpectationPolicy?.expectedShiftCodes?.[0] === "NIGHT" ? "Night" : "Day");
  const selectable = workDescriptions.filter((item) => item.active && !item.deleted), [workDescriptionId, setWorkDescriptionId] = useState(() => selectable[0]?.id ?? "");
  useEffect(() => subscribeDeurChanges((record) => { if (record.rentalId === rentalId) { setVersion((value) => value + 1); setMessage("Latest DEUR change received."); } }), [rentalId]);
  const deurs = useMemo(() => deurRepository.getByRentalId(rentalId), [rentalId, version]);
  const resolved = resolveActiveOperatorDeur({ rentalId, rentalEquipmentLineId: selectedLine?.id, equipmentId: selectedLine?.equipmentId, operatorId: operator?.id ?? "", deurs }); const active = resolved.status === "RESOLVED" ? resolved.record : undefined;
  const projection = active ? projectDigitalDeurRunningState({ deur: active, evaluationTimestamp: clock }) : undefined;
  useEffect(() => { if (!projection?.valid || !projection.value.isRunning) return; const timer = window.setInterval(() => setClock(new Date().toISOString()), 1_000); return () => window.clearInterval(timer); }, [active?.id, active?.updatedAt, projection?.valid && projection.value.isRunning]);
  const access = linkedIdentity.status === "RESOLVED"
    ? evaluateOperatorDigitalDeurAccess({ actor: user ?? undefined, authenticatedOperatorId: linkedIdentity.operator.id, operator: linkedIdentity.operator, assignment, rental, rentalEquipmentLine: selectedLine, deurs, evaluationTimestamp: clock, shift })
    : { allowed: false as const, allowedActions: [] as DeurOperatorAction[], issues: [{ code: linkedIdentity.status, message: "message" in linkedIdentity ? linkedIdentity.message : "Operator access requires an Operator login." }] };
  const policyCodes=rental?.deurExpectationPolicy?.expectedShiftCodes??[]; const configuredWindows=(rental?.deurShiftWindowSnapshots?.length?rental.deurShiftWindowSnapshots:deurShiftWindowRepository.getAll()).filter(item=>!policyCodes.length||policyCodes.includes(item.code)); const windowSnapshot = configuredWindows.find((item) => item.code === (shift === "Night" ? "NIGHT" : "DAY"));
  function startDigitalDeur() {
    if (!access.allowed || !rental || !selectedLine || !assignment || !operator) return setMessage(access.issues[0]?.message ?? "Select an eligible equipment line.");
    const selected = selectable.find((item) => item.id === workDescriptionId); if (!selected) return setMessage("Select a Work Description.");
    const result = createDeur({ authenticatedUser: user, rentalId: rental.id, rentalEquipmentLineId: selectedLine.id, rentalStatus: rental.status, rental, assignmentId: selectedLine.assignmentId, equipmentId: selectedLine.equipmentId, operatorId: selectedLine.operatorId, projectId: rental.projectId, customerId: rental.customerId, selectedWorkDescription: selected, remarks, shift });
    setMessage(result.success ? "Digital DEUR created and saved locally." : result.message); if (result.success) setVersion((value) => value + 1);
  }
  function applyAction(action: DeurOperatorAction) {
    if (!active || !user) return; if (action === "END_SHIFT" && !window.confirm("End the current shift and close its active activity?")) return;
    const actionTimestamp = new Date().toISOString();
    const result = deurRepository.applyOperatorAction({ deurId: active.id, expectedUpdatedAt: active.updatedAt, action, actionTimestamp, actor: user, authenticatedUser: user });
    setMessage(result.success ? operatorActionSuccessMessage(action) : result.message);
    if (result.success) setClock(actionTimestamp);
    setVersion((value) => value + 1);
  }
  function submit() { if (!active || !user || !window.confirm("Submit this DEUR for acknowledgement? It will no longer be editable.")) return; const result = deurRepository.submit(active.id, user, user); setMessage(result.success ? "DEUR submitted for acknowledgement." : result.message); setVersion((value) => value + 1); }
  if (!rental) return <main className="p-6">Rental not found.</main>;
  if (rental.status === "Closed") return <main className="p-6"><Link className="text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link><p className="mt-4 rounded bg-slate-100 p-4">This Rental has been closed. Historical records are read-only.</p></main>;
  return <main className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
    <header><Link className="text-sm text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link><h1 className="mt-2 text-2xl font-bold">Operator Digital DEUR</h1><p className="text-sm text-slate-600">Local real-time sync active</p><p className="text-xs text-slate-500">Changes update across open tabs and windows in this browser. Remote physical-device synchronization requires a future server-connected deployment.</p></header>
    {operatorLines.length > 1 && <label className="block rounded-xl border bg-white p-4 text-sm">Equipment Line<select className="mt-2 w-full rounded border p-3" value={selectedLineId} onChange={(event) => {const value=event.target.value;setSelectedLineId(value);setSearchParams(value?{lineId:value}:{},{replace:true});}}><option value="">Select equipment</option>{operatorLines.map((line,index) => { const item = equipment.find((machine) => machine.id === line.equipmentId); return <option key={line.id} value={line.id}>{item ? `${item.equipmentName} (${item.assetNo}) / Rental Line ${index+1}` : `Rental Line ${index+1}`}</option>; })}</select></label>}
    <section className="grid grid-cols-2 gap-3 rounded-xl border bg-white p-4 text-sm"><p><span className="block text-slate-500">Rental</span>{rental.rentalNumber ?? "Number unavailable"}</p><p><span className="block text-slate-500">Equipment</span>{machine ? `${machine.equipmentName} (${machine.assetNo})` : "Select a line"}</p><p><span className="block text-slate-500">Project</span>{project?.projectName ?? rental.project}</p><p><span className="block text-slate-500">Operator</span>{operator?.name ?? "Operator not assigned"}</p><p><span className="block text-slate-500">Line</span>{selectedLine?`${machine?.equipmentName??"Equipment"} / Rental Line ${operatorLines.findIndex(line=>line.id===selectedLine.id)+1}`:"Not selected"}</p><p><span className="block text-slate-500">Work Date</span>{active?.workDate ?? new Date().toISOString().slice(0, 10)}</p><p><span className="block text-slate-500">Shift Window</span>{windowSnapshot ? `${windowSnapshot.label} ${windowSnapshot.startTime}–${windowSnapshot.endTime}${windowSnapshot.endTime <= windowSnapshot.startTime ? " next day" : ""}` : "DEUR Shift Window is not configured."}</p></section>
    {!active && <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-semibold">Start Digital DEUR</h2><label className="block text-sm">Shift<select className="mt-1 min-h-12 w-full rounded border p-3" value={shift} onChange={(event) => setShift(event.target.value as DeurRecord["shift"])}>{configuredWindows.map((item) => <option key={item.code} value={item.code === "DAY" ? "Day" : "Night"}>{item.label}</option>)}</select></label><label className="block text-sm">Work Description<select className="mt-1 min-h-12 w-full rounded border p-3" value={workDescriptionId} onChange={(event) => setWorkDescriptionId(event.target.value)}>{selectable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm">Remarks<textarea className="mt-1 w-full rounded border p-3" value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label><button className="min-h-12 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:bg-slate-400" disabled={!access.allowed || resolved.status === "AMBIGUOUS"||!windowSnapshot} onClick={startDigitalDeur}>Start Digital DEUR</button></section>}
    {active && <section className="space-y-4 rounded-xl border bg-white p-4"><div><span className="text-sm text-slate-500">Current Activity</span><p className="text-xl font-semibold">{projection?.valid ? projection.value.activeEventType ?? "Ready" : "Unavailable"}</p></div><div className="grid grid-cols-2 gap-3"><p><span className="block text-sm text-slate-500">Elapsed</span><strong className="text-2xl tabular-nums">{projection?.valid ? formatElapsed(projection.value.activeEventElapsedSeconds) : "00:00:00"}</strong></p><p><span className="block text-sm text-slate-500">Live / Projected Operation</span><strong>{projection?.valid ? (projection.value.projectedOperationMinutes / 60).toFixed(2) : "0.00"} hours</strong></p></div><div className="grid gap-3 sm:grid-cols-2">{access.allowedActions.map((action) => <button key={action} className={`min-h-12 rounded-lg px-4 py-3 font-semibold ${action === "END_SHIFT" ? "border border-red-500 text-red-700" : "bg-blue-700 text-white"}`} onClick={() => applyAction(action)}>{actionLabels[action]}</button>)}</div>{active.events?.some((event) => event.activityType === "shift" && event.action === "end") && <button className="min-h-12 w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white" onClick={submit}>Submit DEUR</button>}</section>}
    {(!access.allowed || message) && <p role="status" className={`rounded-lg p-3 text-sm ${access.allowed ? "bg-blue-50 text-blue-900" : "bg-red-50 text-red-800"}`}>{message || access.issues[0]?.message}</p>}
    <p className="text-xs text-slate-500">Local changes saved. Timer display is reconstructed from persisted event timestamps; timer ticks are never stored.</p>
  </main>;
}
