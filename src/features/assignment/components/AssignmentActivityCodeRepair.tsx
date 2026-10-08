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
  const [confirmed, setConfirmed] = useState<{ assignmentId: string; activityCodeId: string; rowVersion: number }>();
  const current = confirmed?.assignmentId === assignment.id && (assignment.rowVersion ?? -1) < confirmed.rowVersion
    ? confirmed : assignment;
  const allowed = configuration.persistenceMode !== "local" && hasPermission("assignment.update")
    && assignment.status === "Active"
    && (rentalState.kind === "none" || rentalState.kind === "draft")
    && typeof current.rowVersion === "number" && Boolean(commandRepositories.canonicalAssignmentActivityCode);

  useEffect(() => {
    let current = true;
    void commandRepositories.canonicalRental?.readReferenceData().then((result) => {
      if (current && result.success) setCodes(result.value.activityCodes);
      else if (current) setMessage("Activity Code options could not be loaded. Refresh and try again.");
    }).catch(() => { if (current) setMessage("Activity Code options could not be loaded. Refresh and try again."); });
    return () => { current = false; };
  }, [commandRepositories.canonicalRental]);

  const selected = codes.find((code) => code.id === current.activityCodeId);
  async function save() {
    if (!allowed || !value || value === current.activityCodeId || !commandRepositories.canonicalAssignmentActivityCode || typeof current.rowVersion !== "number") return;
    setSaving(true); setMessage("");
    const result = await commandRepositories.canonicalAssignmentActivityCode.amendActivityCode({
      commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), assignmentId: assignment.id,
      expectedVersion: current.rowVersion, activityCodeId: value,
      clientCreatedAt: new Date().toISOString(), deviceId: "erms-web",
    });
    setSaving(false);
    if (!result.success) { setMessage(result.message); return; }
    setEditing(false);
    setConfirmed({ assignmentId: assignment.id, activityCodeId: result.value.activityCodeId, rowVersion: result.value.rowVersion });
    requestCanonicalAssignmentRefresh();
    requestCanonicalRentalRefresh();
    const returnTo = searchParams.get("returnTo");
    if (returnTo?.startsWith("/rentals/") && !returnTo.startsWith("//")) navigate(returnTo, { replace: true });
    else setMessage("Activity Code updated.");
  }

  return <div>
    <div className="text-xs uppercase tracking-wide text-slate-500">Activity Code</div>
    <div className="mt-1 flex flex-wrap items-center gap-3">
      <span className={`font-medium ${current.activityCodeId ? "" : "text-amber-700"}`}>
        {current.activityCodeId ? selected ? `${selected.code} — ${selected.name}` : "Activity Code unavailable" : "Not assigned"}
      </span>
      {allowed && !editing && <Button size="sm" variant="secondary" onClick={() => { setValue(current.activityCodeId ?? ""); setEditing(true); }}>{current.activityCodeId ? "Change" : "Edit Activity Code"}</Button>}
    </div>
    {editing && allowed && <div role="group" aria-label="Edit Activity Code" className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <Select label="Activity Code" value={value} onChange={(event) => setValue(event.target.value)}
        options={[{ label: "Select Activity Code", value: "" }, ...codes.filter((code) => code.active).map((code) => ({ label: `${code.code} — ${code.name}`, value: code.id }))]} />
      <div className="mt-3 flex gap-2"><Button size="sm" disabled={!value || value === current.activityCodeId || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Activity Code"}</Button>
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button></div>
    </div>}
    {message && <p className="mt-2 text-sm" role="status">{message}</p>}
  </div>;
}
