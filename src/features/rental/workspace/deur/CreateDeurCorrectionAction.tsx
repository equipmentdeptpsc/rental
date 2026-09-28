import { useState } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { useToast } from "@/components/ui/toast/ToastContext";
import Button from "@/components/ui/Button";
import type { DeurCorrectionReasonCode, DeurRecord } from "@/features/rental/deur/types";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import { PersistenceMode, useApplicationDependenciesCompatibility } from "@/app/composition";
import type { ManualDeurCommandRepository } from "@/features/rental/deur/commands/contracts";

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
  const { user, hasPermission } = useAuth();
  const { showToast } = useToast();
  const dependencies = useApplicationDependenciesCompatibility();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [diagnostic, setDiagnostic] = useState<{ code: string; details?: unknown }>();
  const [reasonCode, setReasonCode] = useState<DeurCorrectionReasonCode>("INCORRECT_TIME_ENTRY");
  const [reasonDetails, setReasonDetails] = useState("");
  if (!user || !hasPermission("deur.correct") || !["Acknowledged","Rejected"].includes(deur.status) || deur.billingLocked || deur.revision?.supersededByRevisionId) return null;
  if (!open) return <Button type="button" onClick={() => setOpen(true)}>CREATE CORRECTION</Button>;
  const save = async () => {
    if (busy) return;
    const remote = dependencies.configuration.persistenceMode === PersistenceMode.Remote;
    if (remote) {
      if (dependencies.configuration.remoteDeurCorrectionEnabled !== true || !dependencies.commandRepositories.deurRevisionCommands) return;
      const reason = reasonDetails.trim();
      if (!reason) { setMessage("Correction details are required."); showToast("Correction details are required.", "error"); return; }
      setBusy(true);
      setMessage("");
      setDiagnostic(undefined);
      const fresh = await dependencies.readRepositories.deurs.getById(deur.id);
      const expectedVersion = fresh.success && fresh.value
        ? Number((fresh.value as unknown as { rowVersion?: number }).rowVersion)
        : Number.NaN;
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        setBusy(false);
        setMessage("The current DEUR version could not be read. Refresh before retrying.");
        showToast("The current DEUR version could not be read. Refresh before retrying.", "error");
        return;
      }
      const correction = await dependencies.commandRepositories.deurRevisionCommands.createCorrection({
        commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), deurId: deur.id,
        sourceRevisionId: deur.id, expectedVersion, changes: {}, reasonCode, reasonDetails: reason,
      });
      if (!correction.success) { setBusy(false); setMessage(correction.message); setDiagnostic({ code: correction.code, details: correction.details }); showToast(correction.message, "error"); return; }
      const manual = dependencies.commandRepositories.deurCommands as unknown as ManualDeurCommandRepository;
      const submission = await manual.submitManualDeur({ commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), deurId: correction.value.revisionId, expectedVersion: correction.value.version });
      setBusy(false);
      if (!submission.success) { setMessage(submission.message); showToast(submission.message, "error"); return; }
      showToast(`Correction revision ${correction.value.revisionNumber} submitted for customer review.`, "success");
      window.location.reload();
      return;
    }
    const result = deurRepository.createCorrection({ sourceId: deur.id, reasonCode, reasonDetails, actor: user, authenticatedUser: user });
    if (!result.success) { setMessage(result.message); showToast(result.message, "error"); return; }
    showToast(`Correction revision ${result.revision.revision?.revisionNumber} created as Draft.`, "success");
    setOpen(false);
  };
  return <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
    <h3 className="font-semibold">Create controlled correction</h3>
    <p className="mt-1 text-xs text-slate-600">The prior DEUR and Customer decision remain unchanged while this replacement is reviewed.</p>
    <div className="mt-3 grid gap-3">
      <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as DeurCorrectionReasonCode)}>
        {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <textarea placeholder={reasonCode === "OTHER" ? "Correction details (required)" : "Correction details"} value={reasonDetails} onChange={(event) => setReasonDetails(event.target.value)} />
      <div className="flex gap-2"><Button type="button" disabled={busy} onClick={() => void save()}>{dependencies.configuration.persistenceMode === PersistenceMode.Remote ? "Create and Submit Corrected Revision" : "Create Draft Revision"}</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></div>
      {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
      {diagnostic && <details className="text-xs text-red-800"><summary>Diagnostic: {diagnostic.code}</summary>{diagnostic.details !== undefined && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-red-100 p-2">{JSON.stringify(diagnostic.details, null, 2)}</pre>}</details>}
    </div>
  </section>;
}
