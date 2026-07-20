import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

const actionLabels: Record<DeurOperatorAction, string> = { START_OPERATION: "Start Operation", RESUME_OPERATION: "Resume Operation", START_IDLE: "Idle", START_MEAL_BREAK: "Meal Break", START_BREAKDOWN: "Breakdown", END_SHIFT: "End Shift" };
const formatElapsed = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");

export default function OperatorDeurPage() {
  const { rentalId = "" } = useParams(); const { user } = useAuth(); const { rentals } = useRental(); const { assignments } = useAssignment(); const { operators } = useOperator(); const { equipment } = useEquipment(); const { projects } = useProject(); const { records: workDescriptions } = useWorkDescriptions();
  const rental = rentals.find((item) => item.id === rentalId), assignment = assignments.find((item) => item.id === rental?.assignmentId), operator = operators.find((item) => item.id === assignment?.operatorId), machine = equipment.find((item) => item.id === rental?.equipmentId), project = projects.find((item) => item.id === rental?.projectId);
  const [version, setVersion] = useState(0), [clock, setClock] = useState(() => new Date().toISOString()), [message, setMessage] = useState(""), [remarks, setRemarks] = useState("");
  const [shift, setShift] = useState<DeurRecord["shift"]>(() => rental?.deurExpectationPolicy?.expectedShiftCodes?.[0] === "NIGHT" ? "Night" : "Day");
  const selectable = workDescriptions.filter((item) => item.active && !item.deleted), [workDescriptionId, setWorkDescriptionId] = useState(() => selectable[0]?.id ?? "");
  useEffect(() => subscribeDeurChanges((record) => { if (record.rentalId === rentalId) { setVersion((value) => value + 1); setMessage("Latest DEUR change received."); } }), [rentalId]);
  const deurs = useMemo(() => deurRepository.getByRentalId(rentalId), [rentalId, version]);
  const resolved = resolveActiveOperatorDeur({ rentalId, operatorId: operator?.id ?? "", deurs }); const active = resolved.status === "RESOLVED" ? resolved.record : undefined;
  const projection = active ? projectDigitalDeurRunningState({ deur: active, evaluationTimestamp: clock }) : undefined;
  useEffect(() => { if (!projection?.valid || !projection.value.isRunning) return; const timer = window.setInterval(() => setClock(new Date().toISOString()), 1_000); return () => window.clearInterval(timer); }, [active?.id, active?.updatedAt, projection?.valid && projection.value.isRunning]);
  const access = evaluateOperatorDigitalDeurAccess({ actor: user ?? undefined, operator, assignment, rental, deurs, evaluationTimestamp: clock, shift });
  const windowSnapshot = rental?.deurShiftWindowSnapshots?.find((item) => item.code === (shift === "Night" ? "NIGHT" : "DAY"));
  function startDigitalDeur() {
    if (!access.allowed || !rental || !assignment || !operator) return setMessage(access.issues[0]?.message ?? "Digital DEUR access is unavailable.");
    const selected = selectable.find((item) => item.id === workDescriptionId); if (!selected) return setMessage("Select a Work Description.");
    const result = createDeur({ rentalId: rental.id, rentalStatus: rental.status, rental, assignmentId: assignment.id, equipmentId: rental.equipmentId, operatorId: operator.id, projectId: rental.projectId, customerId: rental.customerId, selectedWorkDescription: selected, remarks, shift });
    setMessage(result.success ? "Digital DEUR created and saved locally." : result.message); if (result.success) setVersion((value) => value + 1);
  }
  function applyAction(action: DeurOperatorAction) {
    if (!active || !user) return; if (action === "END_SHIFT" && !window.confirm("End the current shift and close its active activity?")) return;
    const result = deurRepository.applyOperatorAction({ deurId: active.id, expectedUpdatedAt: active.updatedAt, action, actionTimestamp: new Date().toISOString(), actor: user });
    setMessage(result.success ? `${actionLabels[action]} saved locally.` : result.message); setVersion((value) => value + 1);
  }
  function submit() { if (!active || !user || !window.confirm("Submit this DEUR for acknowledgement? It will no longer be editable.")) return; const result = deurRepository.submit(active.id, user); setMessage(result.success ? "DEUR submitted for acknowledgement." : result.message); setVersion((value) => value + 1); }
  if (!rental) return <main className="p-6">Rental not found.</main>;
  return <main className="mx-auto max-w-xl space-y-4 p-4 sm:p-6">
    <header><Link className="text-sm text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link><h1 className="mt-2 text-2xl font-bold">Operator Digital DEUR</h1><p className="text-sm text-slate-600">Local real-time sync active</p><p className="text-xs text-slate-500">Changes update across open tabs and windows in this browser. Remote physical-device synchronization requires a future server-connected deployment.</p></header>
    <section className="grid grid-cols-2 gap-3 rounded-xl border bg-white p-4 text-sm"><p><span className="block text-slate-500">Rental</span>{rental.rentalNumber ?? rental.id}</p><p><span className="block text-slate-500">Equipment</span>{machine ? `${machine.assetNo} · ${machine.equipmentName}` : rental.equipmentId}</p><p><span className="block text-slate-500">Project</span>{project?.projectName ?? rental.project}</p><p><span className="block text-slate-500">Operator</span>{operator?.name ?? "Not assigned"}</p><p><span className="block text-slate-500">Work Date</span>{active?.workDate ?? new Date().toISOString().slice(0, 10)}</p><p><span className="block text-slate-500">Shift Window</span>{windowSnapshot ? `${windowSnapshot.label} ${windowSnapshot.startTime}–${windowSnapshot.endTime}${windowSnapshot.endTime <= windowSnapshot.startTime ? " next day" : ""}` : "Not configured"}</p></section>
    {!active && <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-semibold">Start Digital DEUR</h2><label className="block text-sm">Shift<select className="mt-1 min-h-12 w-full rounded border p-3" value={shift} onChange={(event) => setShift(event.target.value as DeurRecord["shift"])}>{rental.deurExpectationPolicy?.expectedShiftCodes?.map((code) => <option key={code} value={code === "DAY" ? "Day" : "Night"}>{code === "DAY" ? "Day" : "Night"}</option>)}</select></label><label className="block text-sm">Work Description<select className="mt-1 min-h-12 w-full rounded border p-3" value={workDescriptionId} onChange={(event) => setWorkDescriptionId(event.target.value)}>{selectable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm">Remarks<textarea className="mt-1 w-full rounded border p-3" value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label><button className="min-h-12 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white disabled:bg-slate-400" disabled={!access.allowed || resolved.status === "AMBIGUOUS"} onClick={startDigitalDeur}>Start Digital DEUR</button></section>}
    {active && <section className="space-y-4 rounded-xl border bg-white p-4"><div><span className="text-sm text-slate-500">Current Activity</span><p className="text-xl font-semibold">{projection?.valid ? projection.value.activeEventType ?? "Ready" : "Unavailable"}</p></div><div className="grid grid-cols-2 gap-3"><p><span className="block text-sm text-slate-500">Elapsed</span><strong className="text-2xl tabular-nums">{projection?.valid ? formatElapsed(projection.value.activeEventElapsedSeconds) : "00:00:00"}</strong></p><p><span className="block text-sm text-slate-500">Live / Projected Operation</span><strong>{projection?.valid ? (projection.value.projectedOperationMinutes / 60).toFixed(2) : "0.00"} hours</strong></p></div><div className="grid gap-3 sm:grid-cols-2">{access.allowedActions.map((action) => <button key={action} className={`min-h-12 rounded-lg px-4 py-3 font-semibold ${action === "END_SHIFT" ? "border border-red-500 text-red-700" : "bg-blue-700 text-white"}`} onClick={() => applyAction(action)}>{actionLabels[action]}</button>)}</div>{active.events?.some((event) => event.activityType === "shift" && event.action === "end") && <button className="min-h-12 w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white" onClick={submit}>Submit DEUR</button>}</section>}
    {(!access.allowed || message) && <p role="status" className={`rounded-lg p-3 text-sm ${access.allowed ? "bg-blue-50 text-blue-900" : "bg-red-50 text-red-800"}`}>{message || access.issues[0]?.message}</p>}
    <p className="text-xs text-slate-500">Local changes saved. Timer display is reconstructed from persisted event timestamps; timer ticks are never stored.</p>
  </main>;
}
