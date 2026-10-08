import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { useAuth } from "@/features/auth/AuthContext";
import type { AssignmentRecord } from "@/features/assignment/types";
import { requestCanonicalAssignmentRefresh } from "@/features/assignment/remote/canonicalAssignmentRefresh";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";
import { loadRentalListPages } from "@/features/rental/hooks/useRentalListData";
import type { CanonicalReferenceCode } from "@/features/rental/remote/contracts";

export default function AssignmentActivityCodeRepair({ assignment }: { assignment: AssignmentRecord }) {
  const { commandRepositories, configuration, readRepositories } = useApplicationDependenciesCompatibility();
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [codes, setCodes] = useState<CanonicalReferenceCode[]>([]);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [rentalState, setRentalState] = useState<"loading" | "open" | "approved" | "error">("loading");
  const allowed = configuration.persistenceMode !== "local" && hasPermission("assignment.manage")
    && assignment.status === "Active" && !assignment.activityCodeId
    && typeof assignment.rowVersion === "number" && Boolean(commandRepositories.canonicalAssignmentActivityCode);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    void commandRepositories.canonicalRental?.readReferenceData().then(result => {
      if (current && result.success) setCodes(result.value.activityCodes.filter(code => code.active));
      else if (current) setMessage("Activity Code options could not be loaded. Refresh and try again.");
    }).catch(() => { if (current) setMessage("Activity Code options could not be loaded. Refresh and try again."); });
    return () => { current = false; };
  }, [allowed, commandRepositories.canonicalRental]);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    void Promise.all([loadRentalListPages(readRepositories.rentals), loadRentalListPages(readRepositories.rentalEquipmentLines)]).then(([rentals, lines]) => {
      if (!current) return;
      if (!rentals.success || !lines.success) { setRentalState("error"); return; }
      const relatedRentalIds = new Set([
        ...rentals.value.items.filter(rental => rental.assignmentId === assignment.id).map(rental => rental.id),
        ...lines.value.items.filter(line => line.assignmentId === assignment.id).map(line => line.rentalId),
      ]);
      setRentalState(rentals.value.items.some(rental => relatedRentalIds.has(rental.id) && rental.approvalStatus === "Approved") ? "approved" : "open");
    }).catch(() => { if (current) setRentalState("error"); });
    return () => { current = false; };
  }, [allowed, assignment.id, readRepositories]);

  if (!allowed) return null;
  if (rentalState === "loading") return <p className="text-sm text-slate-500" role="status">Checking Rental approval state…</p>;
  if (rentalState === "approved") return <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-950" role="status">This rental has already been approved. Preparation details can no longer be changed.</p>;
  if (rentalState === "error") return <p className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-950" role="status">Rental approval state could not be verified. Refresh before changing this Assignment.</p>;
  async function save() {
    if (!value || !commandRepositories.canonicalAssignmentActivityCode || typeof assignment.rowVersion !== "number") return;
    setSaving(true); setMessage("");
    const result = await commandRepositories.canonicalAssignmentActivityCode.amendActivityCode({
      commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), assignmentId: assignment.id,
      expectedVersion: assignment.rowVersion, activityCodeId: value,
      clientCreatedAt: new Date().toISOString(), deviceId: "erms-web",
    });
    setSaving(false);
    if (!result.success) { setMessage(result.message); return; }
    requestCanonicalAssignmentRefresh();
    requestCanonicalRentalRefresh();
    const returnTo = searchParams.get("returnTo");
    if (returnTo?.startsWith("/rentals/") && !returnTo.startsWith("//")) navigate(returnTo, { replace: true });
    else setMessage("Activity Code updated. Refresh the Assignment before continuing.");
  }
  return <section className="rounded-lg border border-amber-300 bg-amber-50 p-4" aria-label="Repair missing Activity Code">
    <h2 className="font-semibold">Activity Code missing</h2>
    <p className="mt-1 text-sm">Add the Activity Code required for Rental preparation. Other Assignment details will not change.</p>
    <div className="mt-3 flex flex-wrap items-end gap-3"><div className="min-w-64 flex-1"><Select label="Activity Code" value={value} onChange={event => setValue(event.target.value)} options={[{ label: "Select Activity Code", value: "" }, ...codes.map(code => ({ label: `${code.code} — ${code.name}`, value: code.id }))]} /></div><Button disabled={!value || saving} onClick={() => void save()}>{saving ? "Saving…" : "Update Activity Code"}</Button></div>
    {message && <p className="mt-2 text-sm" role="status">{message}</p>}
  </section>;
}
