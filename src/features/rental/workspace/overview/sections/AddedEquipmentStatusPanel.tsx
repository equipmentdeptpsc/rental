import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import { getRentalApprovalStatus } from "@/features/rental/approval/rentalApproval";
import { useAuth } from "@/features/auth/AuthContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { canUseCanonicalRemoteRentalCommercialTermsMutation, canUseCanonicalRemoteRentalLineAssignmentMutation } from "@/features/rental/services/rentalRuntimeCapability";
import type { CanonicalReferenceCode } from "@/features/rental/remote/contracts";
import RemoteCommercialTermsPage from "@/features/rental/remote/RemoteCommercialTermsPage";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";
import { requestCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";
import type { CanonicalOperatorAssignmentConflictDetails } from "@/features/rental/remote/contracts";
import { rentalLineMeterPolicy } from "./rentalLineMeterPolicy";

interface Props {
  rental: RentalRecord;
  lines: RentalEquipmentLine[];
  equipment: EquipmentRecord[];
  assignments: AssignmentRecord[];
  operators: Operator[];
  contracts: RentalContractRecord[];
}

interface RentalWorkspaceNavigationState {
  rentalWorkspace?: {
    returnTo: string;
    rentalId: string;
    configuringLineId?: string;
    configuredOperatorId?: string;
    configuredActivityCodeId?: string;
    configuredStartDate?: string;
  };
}

function restoredWorkspaceState(value: unknown, rentalId: string): RentalWorkspaceNavigationState["rentalWorkspace"] {
  if (!value || typeof value !== "object" || !("rentalWorkspace" in value)) return undefined;
  const candidate = (value as RentalWorkspaceNavigationState).rentalWorkspace;
  return candidate?.rentalId === rentalId && candidate.returnTo.startsWith(`/rentals/${rentalId}/workspace`) ? candidate : undefined;
}

function operatorConflictDetails(value: unknown): CanonicalOperatorAssignmentConflictDetails | undefined {
  if (!value || typeof value !== "object" || !("assignmentId" in value) || typeof value.assignmentId !== "string" || !value.assignmentId) return undefined;
  return value as CanonicalOperatorAssignmentConflictDetails;
}

export function equipmentPreparationBlockers(
  rental: RentalRecord,
  line: RentalEquipmentLine,
  contractPresent: boolean,
): string[] {
  if (["Returned", "Cancelled", "Closed"].includes(line.canonicalLineStatus ?? line.status)) return [];
  const draft = line.operationalMetadata?.draftPreparation;
  const blockers: string[] = [];
  if (rental.rentalType === "Operated Rental" && !line.operatorId) blockers.push("Operator not assigned");
  if (!contractPresent && !line.commercialSnapshot) blockers.push("Commercial terms incomplete");
  if (!line.operationalMetadata?.costCode && !draft?.costCodeId) blockers.push("Cost code missing");
  if (!line.operationalMetadata?.activityCode && !draft?.activityCodeId) blockers.push("Activity code missing");
  if (!line.deurWorkDescriptionId && !draft?.workDescriptionId && !line.deurExpectationSnapshot?.workDescription) blockers.push("Work description missing");
  return blockers;
}

export default function AddedEquipmentStatusPanel({ rental, lines, equipment, assignments, operators, contracts }: Props) {
  const location = useLocation();
  const restored = restoredWorkspaceState(location.state, rental.id);
  const [open, setOpen] = useState(Boolean(restored));
  const [preparing, setPreparing] = useState(false);
  const [configuringLineId, setConfiguringLineId] = useState<string | undefined>(restored?.configuringLineId);
  const [configuredOperatorId, setConfiguredOperatorId] = useState(restored?.configuredOperatorId ?? "");
  const [configuredActivityCodeId, setConfiguredActivityCodeId] = useState(restored?.configuredActivityCodeId ?? "");
  const [configuredStartDate, setConfiguredStartDate] = useState(restored?.configuredStartDate ?? "");
  const [activityCodes, setActivityCodes] = useState<CanonicalReferenceCode[]>([]);
  const [configurationMessage, setConfigurationMessage] = useState("");
  const [operatorConflict, setOperatorConflict] = useState<CanonicalOperatorAssignmentConflictDetails>();
  const [savingConfiguration, setSavingConfiguration] = useState(false);
  const { hasPermission } = useAuth();
  const dependencies = useApplicationDependenciesCompatibility();
  const canPrepare = rental.status === "Draft" && hasPermission("rental.commercialTerms.update")
    && canUseCanonicalRemoteRentalCommercialTermsMutation(dependencies.configuration)
    && Boolean(dependencies.commandRepositories.canonicalRental);
  const canConfigureAssignment = rental.status === "Draft" && hasPermission("rental.update")
    && canUseCanonicalRemoteRentalLineAssignmentMutation(dependencies.configuration)
    && Boolean(dependencies.commandRepositories.canonicalRental?.configureLineAssignment);
  const approval = getRentalApprovalStatus(rental);
  const activeLines = lines.filter((line) => !["Returned", "Cancelled", "Closed"].includes(line.canonicalLineStatus ?? line.status));
  const allPrepared = activeLines.length > 0 && activeLines.every((line) => equipmentPreparationBlockers(rental, line, contracts.some((contract) => contract.rentalEquipmentLineId === line.id)).length === 0);

  useEffect(() => {
    if (!configuringLineId) return;
    let active = true;
    void dependencies.commandRepositories.canonicalRental?.readReferenceData().then((result) => {
      if (!active) return;
      if (result?.success) setActivityCodes(result.value.activityCodes.filter((item) => item.active));
      else setConfigurationMessage("Activity codes could not be loaded. Refresh and try again.");
    });
    return () => { active = false; };
  }, [configuringLineId, dependencies.commandRepositories.canonicalRental]);

  const beginConfiguration = (line: RentalEquipmentLine, assignment?: AssignmentRecord) => {
    setConfiguringLineId(line.id);
    setConfiguredOperatorId(assignment?.operatorId ?? line.operatorId ?? "");
    setConfiguredActivityCodeId(line.operationalMetadata?.draftPreparation?.activityCodeId ?? assignment?.activityCodeId ?? "");
    setConfiguredStartDate(line.effectiveStartDate ?? rental.dateOut);
    setOperatorConflict(undefined);
    setConfigurationMessage("");
  };
  const saveConfiguration = async (line: RentalEquipmentLine) => {
    const repository = dependencies.commandRepositories.canonicalRental;
    if (!repository?.configureLineAssignment || !configuredOperatorId || !configuredStartDate || savingConfiguration) return;
    if (typeof rental.rowVersion !== "number") { setConfigurationMessage("Rental version is unavailable. Refresh and try again."); return; }
    if (!line.assignmentId && !configuredActivityCodeId) { setConfigurationMessage("Select an Activity Code before creating the Assignment."); return; }
    setSavingConfiguration(true); setConfigurationMessage(""); setOperatorConflict(undefined);
    const result = await repository.configureLineAssignment({ commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), rentalId: rental.id, rentalLineId: line.id, expectedVersion: rental.rowVersion, operatorId: configuredOperatorId, effectiveStartDate: configuredStartDate, ...(line.assignmentId ? {} : { activityCodeId: configuredActivityCodeId }) });
    setSavingConfiguration(false);
    if (!result.success) {
      setConfigurationMessage(result.message);
      if (result.code === "OPERATOR_ALREADY_ASSIGNED") setOperatorConflict(operatorConflictDetails(result.details));
      return;
    }
    setConfiguringLineId(undefined); setConfigurationMessage("Assignment saved from the canonical service.");
    requestCanonicalRentalRefresh();
  };

  return <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Added Equipment Status">
    <button type="button" className="rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700" onClick={() => setOpen((value) => !value)} aria-expanded={open}>View Added Equipment Status</button>
    {open && <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-600">Approval request: {approval}. Preparation and approval apply to the whole Rental; equipment status is shown per line.</p>
      {configurationMessage && <div className="rounded border p-3 text-sm" role="status"><p>{configurationMessage}</p>{operatorConflict && hasPermission("assignment.read") && <p className="mt-2"><Link className="font-medium text-blue-700 underline" to={`/assignments/${encodeURIComponent(operatorConflict.assignmentId)}`} state={{ rentalWorkspace: { returnTo: location.pathname + location.search, rentalId: rental.id, configuringLineId, configuredOperatorId, configuredActivityCodeId, configuredStartDate } }}>View Assignment</Link>{operatorConflict.assignedDate ? ` · Active from ${operatorConflict.assignedDate}${operatorConflict.expectedReturn ? ` to ${operatorConflict.expectedReturn}` : ""}` : ""}</p>}</div>}
      {lines.length === 0 ? <p className="rounded border bg-slate-50 p-4 text-sm">No equipment has been added to this Rental.</p> : <div className="grid gap-3 md:grid-cols-2">{lines.map((line) => {
        const machine = equipment.find((item) => item.id === line.equipmentId);
        const assignment = assignments.find((item) => item.id === line.assignmentId);
        const operator = operators.find((item) => item.id === (line.operatorId || assignment?.operatorId));
        const blockers = equipmentPreparationBlockers(rental, line, contracts.some((contract) => contract.rentalEquipmentLineId === line.id));
        const status = line.canonicalLineStatus ?? line.status;
        const historical = ["Returned", "Cancelled", "Closed"].includes(status);
        return <article key={line.id} className="rounded-lg border p-4 text-sm">
          <h3 className="font-semibold">{machine ? `${machine.assetNo} — ${machine.equipmentName}` : line.equipmentId}</h3>
          {machine?.legacyEquipmentNumber && <p>Legacy Equipment Number: {machine.legacyEquipmentNumber}</p>}
          <p className="break-all text-xs text-slate-500">Equipment ID: {line.equipmentId}</p>
          {machine && <p>Equipment Maintenance Type: {machine.maintenanceType}</p>}
          <p>Rental dates: {line.effectiveStartDate ?? rental.dateOut} → {rental.expectedReturn ?? "Open-ended"}</p>
          <p>Assignment: {assignment ? `${assignment.status} (${assignment.assignedDate} → ${assignment.expectedReturn ?? "Open-ended"})` : line.assignmentId ? `Linked ${line.assignmentId}` : "Not linked"}</p>
          <p>Availability: {historical ? "Historical — no active commitment inferred" : `Committed to this Rental (${status})`}</p>
          <p>DEUR meter policy: {rentalLineMeterPolicy(line, rental.status)}</p>
          <p>Operator: {operator?.name ?? (line.operatorId || "Not assigned")}</p>
          <p>Preparation: {historical ? "Historical / read-only" : blockers.length === 0 ? "Complete" : "Incomplete"}</p>
          <p>Approval request: {approval}</p>
          {blockers.length > 0 && <ul className="mt-2 list-disc pl-5 text-amber-800">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          {approval === "Rejected" && rental.approvalDecisionRemarks && <p className="mt-2 text-amber-800">Rejection: {rental.approvalDecisionRemarks}</p>}
          {!historical && canConfigureAssignment && <div className="mt-3 border-t pt-3">
            {configuringLineId !== line.id && <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => beginConfiguration(line, assignment)}>Configure assignment</button>}
            {configuringLineId === line.id && <div className="grid gap-3" aria-label={`Configure assignment for ${line.id}`}>
              <label>Operator<select className="mt-1 block w-full rounded border p-2" value={configuredOperatorId} onChange={(event) => { setConfiguredOperatorId(event.target.value); setOperatorConflict(undefined); setConfigurationMessage(""); }}><option value="">Select operator…</option>{operators.filter((item) => item.status === "Active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {!line.assignmentId && <label>Activity Code<select className="mt-1 block w-full rounded border p-2" value={configuredActivityCodeId} onChange={(event) => setConfiguredActivityCodeId(event.target.value)}><option value="">Select activity code…</option>{activityCodes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label>}
              <label>Effective start<input className="mt-1 block w-full rounded border p-2" type="date" min={rental.dateOut} max={rental.expectedReturn} value={configuredStartDate} onChange={(event) => { setConfiguredStartDate(event.target.value); setOperatorConflict(undefined); setConfigurationMessage(""); }} /></label>
              <div className="flex gap-2"><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setConfiguringLineId(undefined)}>Cancel</button><button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={savingConfiguration || !configuredOperatorId || (!line.assignmentId && !configuredActivityCodeId)} onClick={() => void saveConfiguration(line)}>{savingConfiguration ? "Saving…" : line.assignmentId ? "Save assignment" : "Create and attach assignment"}</button></div>
            </div>}
          </div>}
        </article>;
      })}</div>}
      {canPrepare && lines.length > 0 && <div><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setPreparing((value) => !value)} aria-expanded={preparing}>{preparing ? "Hide inline preparation" : "Complete preparation inline"}</button>{preparing && <div className="mt-4"><RemoteCommercialTermsPage rentalId={rental.id} embedded /></div>}</div>}
      {rental.status === "Draft" && <div className="rounded border bg-slate-50 p-3"><p className="mb-2 text-sm">{allPrepared ? "Preparation appears complete. Canonical approval validation remains authoritative." : "Complete all equipment preparation before requesting approval."}</p><RentalQuickActions rental={rental} onlyApprovalSubmission /></div>}
    </div>}
  </section>;
}
