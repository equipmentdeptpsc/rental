import { useState } from "react";
import Button from "@/components/ui/Button";
import { useRental } from "@/features/rental/context/RentalContext";
import type { DeurExpectationFrequency, DeurExpectationShiftCode, RentalRecord } from "@/features/rental/types";
import { normalizeRentalDeurExpectationPolicy } from "../expectation/normalizeRentalDeurExpectationPolicy";
import { expectationPolicyLabel } from "./RentalDeurComplianceSummary";
import { deurShiftWindowRepository } from "../shift-window/repository";

export default function RentalDeurExpectationPolicyCard({ rental }: { rental: RentalRecord }) {
  const { updateRental } = useRental();
  const editable = ["Draft", "Assigned", "Reserved"].includes(rental.status) && !rental.deurExpectationPolicyFrozenAt;
  const [frequency, setFrequency] = useState<DeurExpectationFrequency>(rental.deurExpectationPolicy?.frequency ?? "PER_WORKDAY");
  const [shifts, setShifts] = useState<DeurExpectationShiftCode[]>(rental.deurExpectationPolicy?.expectedShiftCodes ?? ["DAY"]);
  const [message, setMessage] = useState("");
  const displayedWindows = editable ? deurShiftWindowRepository.getAll().filter((window) => shifts.includes(window.code)) : rental.deurShiftWindowSnapshots ?? [];
  const windowList = displayedWindows.length > 0 && <ul className="mt-2 space-y-1 text-xs text-slate-600">{displayedWindows.map((window) => <li key={window.code}><strong>{window.label}</strong> · {window.startTime}–{window.endTime}{window.endTime <= window.startTime ? " next day" : ""}{window.capturedAt ? ` · captured ${new Date(window.capturedAt).toLocaleString()}` : ""}</li>)}</ul>;
  if (!editable) return <div className="mt-3 text-xs text-slate-500"><p>DEUR expectation policy: <strong>{expectationPolicyLabel(rental.deurExpectationPolicy)}</strong>. Locked after Rental release.</p>{windowList}</div>;
  const save = () => {
    const normalized = normalizeRentalDeurExpectationPolicy({ frequency, effectiveFrom: rental.dateOut, ...(frequency === "PER_SHIFT" ? { expectedShiftCodes: shifts } : {}), timezone: rental.deurExpectationPolicy?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, capturedAt: new Date().toISOString() });
    if (!normalized.valid) { setMessage(normalized.message); return; }
    updateRental({ ...rental, deurExpectationPolicyRequired: true, deurExpectationPolicy: normalized.value });
    setMessage("DEUR expectation policy saved.");
  };
  return <section className="mt-4 rounded border bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-end gap-3"><label>DEUR Reporting Frequency<select className="block rounded border p-2" value={frequency} onChange={(event) => setFrequency(event.target.value as DeurExpectationFrequency)}><option value="PER_WORKDAY">Per Workday</option><option value="PER_SHIFT">Per Shift</option><option value="ON_DEMAND">On Demand</option></select></label>
    {frequency === "PER_SHIFT" && <fieldset><legend>Expected Shifts</legend><div className="flex gap-3">{(["DAY", "NIGHT"] as const).map((shift) => <label key={shift}><input type="checkbox" checked={shifts.includes(shift)} onChange={(event) => setShifts(event.target.checked ? [...shifts, shift] : shifts.filter((item) => item !== shift))} /> {shift}</label>)}</div></fieldset>}
    <Button type="button" onClick={save}>Save Policy</Button></div>{frequency === "PER_SHIFT" && windowList}{message && <p className="mt-2 text-xs text-slate-600">{message}</p>}<p className="mt-2 text-xs text-slate-500">Editable until release; effective from the Rental start date. Shift windows lock at release.</p></section>;
}
