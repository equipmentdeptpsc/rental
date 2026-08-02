import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useWorkDescriptions } from "@/features/masters/work-description/context/WorkDescriptionContext";
import { useRental } from "../context/RentalContext";

const labels: Record<string, string> = { rentalLineIdentity: "rental-line identity", equipment: "equipment", assignment: "active assignment", operator: "assigned operator", project: "active project", customer: "customer reference", deurPolicy: "DEUR policy", requiredShift: "required shift", shiftWindow: "valid shift window", workDescription: "work description", workDate: "work date", meterConfiguration: "applicable meter configuration", billingTerms: "billing terms", operationalMetadata: "operational metadata snapshot", snapshot: "persisted release snapshot", snapshotFreshness: "regenerated release snapshot" };

export default function DeurReleaseReadinessPanel({ rentalId }: { rentalId: string }) {
  const { getReleaseReadiness, configureLineDeurExpectation, rentalEquipmentLines } = useRental();
  const { equipment } = useEquipment(); const { operators } = useOperator(); const { records } = useWorkDescriptions();
  const readiness = getReleaseReadiness(rentalId);
  const lines = rentalEquipmentLines.filter((line) => line.rentalId === rentalId && line.status !== "Cancelled");
  const [selected, setSelected] = useState<Record<string, string>>({}); const [remarks, setRemarks] = useState<Record<string, string>>({}); const [message, setMessage] = useState("");
  const workOptions = useMemo(() => records.filter((item) => item.active && !item.deleted && item.operatorSelectable !== false), [records]);
  return <section className={`mt-4 rounded border p-3 ${readiness.eligible ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"}`} aria-label="DEUR Release Readiness">
    <div className="flex items-center justify-between"><h3 className="font-semibold">DEUR Release Readiness</h3><strong className={readiness.eligible ? "text-green-700" : "text-amber-800"}>{readiness.eligible ? "Ready" : "Incomplete"}</strong></div>
    <div className="mt-3 space-y-3">{lines.map((line) => { const state = readiness.lines.find((item) => item.rentalEquipmentLineId === line.id); const machine = equipment.find((item) => item.id === line.equipmentId); const operator = operators.find((item) => item.id === line.operatorId); const currentWork = records.find((item) => item.id === line.deurWorkDescriptionId); return <article key={line.id} className="rounded border bg-white p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><span><strong>{machine?.equipmentName ?? line.equipmentId}</strong> · {operator?.name ?? "Operator unavailable"} · {line.assignmentId ?? "Assignment unavailable"}</span><strong className={state?.eligible ? "text-green-700" : "text-amber-800"}>{state?.eligible ? "Ready" : "Incomplete"}</strong></div>
      <p className="mt-1 text-xs text-slate-600">Policy: {state?.snapshot?.policy.frequency ?? "Not configured"} · Shifts: {state?.snapshot?.policy.expectedShiftCodes?.join(", ") || "Not applicable"} · Meter: {state?.snapshot?.meterRequirement ?? "Unknown"} · Work: {state?.snapshot?.workDescription.name ?? currentWork?.name ?? "Not configured"} · Snapshot: {line.deurExpectationSnapshot ? (state?.missingFields.includes("snapshotFreshness") ? "Stale" : "Persisted") : "Missing"}</p>
      {!state?.eligible && <p className="mt-2 text-xs text-amber-900">Complete: {state?.missingFields.map((item) => labels[item] ?? item).join(", ")}{state?.invalidValues.length ? `. ${state.invalidValues.join(" ")}` : ""}</p>}
      <div className="mt-2 flex flex-wrap items-end gap-2"><label className="text-xs">Work description<select className="ml-2 rounded border p-2" value={selected[line.id] ?? line.deurWorkDescriptionId ?? ""} onChange={(event) => setSelected((value) => ({ ...value, [line.id]: event.target.value }))}><option value="">Select…</option>{workOptions.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} — ` : ""}{item.name}</option>)}</select></label>{workOptions.find((item) => item.id === (selected[line.id] ?? line.deurWorkDescriptionId))?.requiresRemarks && <label className="text-xs">Operational scope<input className="ml-2 rounded border p-2" value={remarks[line.id] ?? line.deurOperationalRemarks ?? ""} onChange={(event) => setRemarks((value) => ({ ...value, [line.id]: event.target.value }))} /></label>}<Button type="button" variant="secondary" onClick={() => { const result = configureLineDeurExpectation(rentalId, line.id, selected[line.id] ?? line.deurWorkDescriptionId ?? "", remarks[line.id] ?? line.deurOperationalRemarks); setMessage(result.success ? "DEUR release snapshot saved." : result.message ?? "Unable to save DEUR expectation."); }}>Validate &amp; save snapshot</Button></div>
    </article>; })}</div>{message && <p className="mt-2 text-xs text-slate-700">{message}</p>}
  </section>;
}
