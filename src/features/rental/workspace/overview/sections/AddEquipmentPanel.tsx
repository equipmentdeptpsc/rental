import { useEffect, useMemo, useState } from "react";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { useAuth } from "@/features/auth/AuthContext";
import { EquipmentAvailabilityController, type EquipmentAvailabilityState } from "@/features/equipment/availability/controller";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";
import { notifyRentalWorkspaceChange } from "@/features/rental/workspace/workspaceRefresh";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";

interface Props { rental: RentalRecord; lines: RentalEquipmentLine[]; equipment: EquipmentRecord[]; assignments: AssignmentRecord[] }

const editableStatuses = new Set(["Draft", "Reserved", "Released", "Active"]);
const readOnlyStatuses = new Set(["Cancelled", "Closed", "Returned"]);

export default function AddEquipmentPanel({ rental, lines, equipment, assignments }: Props) {
  const dependencies = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const repository = dependencies.commandRepositories.canonicalRentalEquipment ?? dependencies.commandRepositories.canonicalRental;
  const canAdd = hasPermission("rental.update") && editableStatuses.has(rental.status) && !readOnlyStatuses.has(rental.status) && Boolean(repository?.addEquipment);
  const [open, setOpen] = useState(false);
  const [equipmentId, setEquipmentId] = useState("");
  const [effectiveStart, setEffectiveStart] = useState(rental.dateOut);
  const [sourceAssignmentId, setSourceAssignmentId] = useState("");
  const [availability, setAvailability] = useState<EquipmentAvailabilityState>({ status: "not_checked" });
  const [message, setMessage] = useState("");
  const controller = useMemo(() => new EquipmentAvailabilityController(dependencies.repositories.equipmentAvailability), [dependencies.repositories.equipmentAvailability]);
  const requestKey = `${rental.id}:add-equipment`;
  const selectedAssignments = useMemo(() => assignments.filter((assignment) => assignment.status === "Active" && !assignment.deleted && assignment.equipmentId === equipmentId && assignment.projectId === rental.projectId), [assignments, equipmentId, rental.projectId]);
  const selectedEquipmentIds = useMemo(() => new Set(lines.map((line) => line.equipmentId)), [lines]);
  const candidates = equipment.filter((item) => item.active !== false && !item.deleted);

  useEffect(() => {
    if (!open || !equipmentId || !effectiveStart) { setAvailability({ status: "not_checked" }); return; }
    let active = true;
    void controller.check({ key: requestKey, equipmentId, windowStart: effectiveStart, windowEnd: rental.expectedReturn ?? null, ...(sourceAssignmentId ? { sourceAssignmentId } : {}) }).then((state) => { if (active) setAvailability(state); });
    return () => { active = false; };
  }, [controller, effectiveStart, equipmentId, open, rental.expectedReturn, requestKey, sourceAssignmentId]);

  if (!canAdd) return null;

  const reset = (clearMessage = true) => { setOpen(false); setEquipmentId(""); setSourceAssignmentId(""); setEffectiveStart(rental.dateOut); setAvailability({ status: "not_checked" }); if (clearMessage) setMessage(""); };
  const submit = async () => {
    if (!repository?.addEquipment || availability.status !== "available" || !equipmentId || !effectiveStart) return;
    setMessage("");
    const result = await repository.addEquipment({ commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), rentalId: rental.id, equipmentId, proposedEffectiveStartDate: effectiveStart, ...(sourceAssignmentId ? { sourceAssignmentId } : {}) });
    if (!result.success) {
      setAvailability(result.code === "EQUIPMENT_INTERVAL_CONFLICT" ? { status: "conflict", message: result.message } : availability);
      setMessage(result.code === "DUPLICATE_EQUIPMENT_LINE" ? "This equipment is already included in this Rental." : result.message);
      return;
    }
    notifyRentalWorkspaceChange(rental.id, { rentalLineId: result.value.rentalLineId, equipmentId: result.value.equipmentId });
    requestCanonicalRentalRefresh();
    reset(false);
    setMessage("Equipment added to the Rental as Draft.");
  };

  return <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Add Equipment">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Equipment</h2><p className="text-sm text-slate-600">Add one equipment line without changing the Rental status.</p></div>
      <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={() => { setOpen(true); setMessage(""); }} aria-expanded={open}>Add Equipment</button>
    </div>
    {message && <p className="mt-3 text-sm text-slate-700" role="status">{message}</p>}
    {open && <div className="mt-4 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnly label="Rental" value={rental.rentalNumber ?? rental.id} />
        <ReadOnly label="Customer / Project" value={`${rental.customer || "-"} / ${rental.project || "-"}`} />
        <ReadOnly label="Parent status" value={rental.status} />
        <ReadOnly label="Expected return" value={rental.expectedReturn ?? "Open-ended"} />
      </div>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Equipment
        <select className="rounded border bg-white p-2" value={equipmentId} onChange={(event) => { setEquipmentId(event.target.value); setSourceAssignmentId(""); }}>
          <option value="">Select equipment</option>
          {candidates.map((item) => <option key={item.id} value={item.id} disabled={selectedEquipmentIds.has(item.id)}>{item.assetNo} — {item.equipmentName}{selectedEquipmentIds.has(item.id) ? " (already included)" : ""}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">Effective start
        <input className="rounded border bg-white p-2" type="date" min={rental.dateOut} max={rental.expectedReturn} value={effectiveStart} onChange={(event) => setEffectiveStart(event.target.value)} />
      </label>
      {selectedAssignments.length > 0 && <label className="grid gap-1 text-sm font-medium text-slate-700">Source Assignment <span className="font-normal text-slate-500">Optional; choose only the legitimate matching Assignment.</span>
        <select className="rounded border bg-white p-2" value={sourceAssignmentId} onChange={(event) => setSourceAssignmentId(event.target.value)}>
          <option value="">Ordinary equipment (no source Assignment)</option>
          {selectedAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.id} · {assignment.assignedDate}–{assignment.expectedReturn ?? "Open-ended"}</option>)}
        </select>
      </label>}
      <AvailabilityState state={availability} />
       <div className="flex flex-wrap justify-end gap-2"><button type="button" className="rounded border bg-white px-3 py-2 text-sm" onClick={() => reset()}>Cancel</button><button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={availability.status !== "available"} onClick={() => void submit()}>Add as Draft</button></div>
    </div>}
  </section>;
}

function ReadOnly({ label, value }: { label: string; value: string }) { return <div><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div><div className="font-semibold text-slate-800">{value}</div></div>; }

function AvailabilityState({ state }: { state: EquipmentAvailabilityState }) {
  if (state.status === "checking") return <p className="rounded border border-slate-200 bg-white p-3 text-sm" role="status" aria-live="polite">Checking equipment availability…</p>;
  if (state.status === "available") return <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800" role="status" aria-live="polite">Available for the selected interval.</p>;
  if (state.status === "conflict") { const conflict = state.result?.conflicts[0]; return <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert"><p className="font-semibold">Conflict</p><p>{state.message ?? "Equipment is committed for the selected interval."}</p>{conflict && <p className="mt-1">{conflict.sourceType ?? "Commitment"}{conflict.rentalNumber ? ` · ${conflict.rentalNumber}` : ""}: {conflict.commitmentStart ?? "-"} → {conflict.commitmentEnd ?? "Open-ended"}</p>}</div>; }
  if (state.status === "error") return <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">Unable to verify availability: {state.message}</p>;
  return <p className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-600" role="status">Select equipment and an effective start to check availability.</p>;
}
