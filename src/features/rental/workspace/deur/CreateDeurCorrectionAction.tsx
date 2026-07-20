import { useState } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { useToast } from "@/components/ui/toast/ToastContext";
import Button from "@/components/ui/Button";
import type { DeurCorrectionReasonCode, DeurRecord } from "@/features/rental/deur/types";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";

const reasons: Array<[DeurCorrectionReasonCode, string]> = [
  ["INCORRECT_TIME_ENTRY", "Incorrect time entry"], ["MISSING_TIME_ENTRY", "Missing time entry"],
  ["INCORRECT_ACTIVITY", "Incorrect activity"], ["INCORRECT_WORK_DESCRIPTION", "Incorrect work description"],
  ["INCORRECT_COST_CODE", "Incorrect cost code"], ["INCORRECT_ODOMETER", "Incorrect odometer"],
  ["INCORRECT_TRIP_CHECKPOINT", "Incorrect trip checkpoint"], ["INCORRECT_QUANTITY", "Incorrect quantity"],
  ["INCORRECT_OPERATOR", "Incorrect operator"], ["INCORRECT_PROJECT", "Incorrect project"],
  ["INCORRECT_EQUIPMENT", "Incorrect equipment"], ["INCORRECT_COMMERCIAL_REFERENCE", "Incorrect commercial reference"],
  ["CUSTOMER_REQUESTED_CORRECTION", "Customer-requested correction"], ["DATA_ENCODING_ERROR", "Data encoding error"], ["OTHER", "Other"],
];

export default function CreateDeurCorrectionAction({ deur }: { deur: DeurRecord }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<DeurCorrectionReasonCode>("INCORRECT_TIME_ENTRY");
  const [reasonDetails, setReasonDetails] = useState("");
  if (user?.role !== "Admin" || deur.status !== "Acknowledged" || deur.billingLocked || deur.revision?.supersededByRevisionId) return null;
  if (!open) return <Button type="button" onClick={() => setOpen(true)}>CREATE CORRECTION</Button>;
  const save = () => {
    const result = deurRepository.createCorrection({ sourceId: deur.id, reasonCode, reasonDetails, actor: user });
    if (!result.success) { showToast(result.message, "error"); return; }
    showToast(`Correction revision ${result.revision.revision?.revisionNumber} created as Draft.`, "success");
    setOpen(false);
  };
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
    <h3 className="font-semibold">Create controlled correction</h3>
    <p className="mt-1 text-xs text-slate-600">The acknowledged DEUR remains unchanged until this replacement is acknowledged.</p>
    <div className="mt-3 grid gap-3">
      <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as DeurCorrectionReasonCode)}>
        {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <textarea placeholder={reasonCode === "OTHER" ? "Correction details (required)" : "Correction details"} value={reasonDetails} onChange={(event) => setReasonDetails(event.target.value)} />
      <div className="flex gap-2"><Button type="button" onClick={save}>Create Draft Revision</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>
  </section>;
}
