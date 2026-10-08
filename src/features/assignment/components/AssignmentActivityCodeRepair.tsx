import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useAuth } from "@/features/auth/AuthContext";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { AssignmentRentalPreparation } from "@/features/assignment/hooks/useAssignmentRentalPreparation";
import { requestCanonicalAssignmentRefresh } from "@/features/assignment/remote/canonicalAssignmentRefresh";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";
import type { CanonicalReferenceCode } from "@/features/rental/remote/contracts";

export default function AssignmentActivityCodeRepair({ assignment, rentalState }: {
  assignment: AssignmentRecord;
  rentalState: AssignmentRentalPreparation;
}) {
  const { commandRepositories, configuration } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [codes, setCodes] = useState<CanonicalReferenceCode[]>([]);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const allowed = configuration.persistenceMode !== "local" && hasPermission("assignment.manage")
    && assignment.status === "Active" && !assignment.activityCodeId
    && (rentalState.kind === "none" || rentalState.kind === "draft")
    && typeof assignment.rowVersion === "number" && Boolean(commandRepositories.canonicalAssignmentActivityCode);

  useEffect(() => {
    let current = true;
    void commandRepositories.canonicalRental?.readReferenceData().then((result) => {
      if (current && result.success) setCodes(result.value.activityCodes);
      else if (current) setMessage("Activity Code options could not be loaded. Refresh and try again.");
    }).catch(() => { if (current) setMessage("Activity Code options could not be loaded. Refresh and try again."); });
    return () => { current = false; };
  }, [commandRepositories.canonicalRental]);

  const selected = codes.find((code) => code.id === assignment.activityCodeId);
  async function save() {
    if (!allowed || !value || !commandRepositories.canonicalAssignmentActivityCode || typeof assignment.rowVersion !== "number") return;
    setSaving(true); setMessage("");
    const result = await commandRepositories.canonicalAssignmentActivityCode.amendActivityCode({
      commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), assignmentId: assignment.id,
      expectedVersion: assignment.rowVersion, activityCodeId: value,
      clientCreatedAt: new Date().toISOString(), deviceId: "erms-web",
    });
    setSaving(false);
    if (!result.success) { setMessage(result.message); return; }
    setEditing(false);
    requestCanonicalAssignmentRefresh();
    requestCanonicalRentalRefresh();
    const returnTo = searchParams.get("returnTo");
    if (returnTo?.startsWith("/rentals/") && !returnTo.startsWith("//")) navigate(returnTo, { replace: true });
    else setMessage("Activity Code updated.");
  }

  return <div>
    <div className="text-xs uppercase tracking-wide text-slate-500">Activity Code</div>
    <div className="mt-1 flex flex-wrap items-center gap-3">
      <span className={`font-medium ${assignment.activityCodeId ? "" : "text-amber-700"}`}>
        {assignment.activityCodeId ? selected ? `${selected.code} — ${selected.name}` : "Activity Code unavailable" : "Not assigned"}
      </span>
      {allowed && !editing && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit Activity Code</Button>}
    </div>
    {editing && allowed && <div role="group" aria-label="Edit Activity Code" className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <Select label="Activity Code" value={value} onChange={(event) => setValue(event.target.value)}
        options={[{ label: "Select Activity Code", value: "" }, ...codes.filter((code) => code.active).map((code) => ({ label: `${code.code} — ${code.name}`, value: code.id }))]} />
      <div className="mt-3 flex gap-2"><Button size="sm" disabled={!value || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Activity Code"}</Button>
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button></div>
    </div>}
    {message && <p className="mt-2 text-sm" role="status">{message}</p>}
  </div>;
}
