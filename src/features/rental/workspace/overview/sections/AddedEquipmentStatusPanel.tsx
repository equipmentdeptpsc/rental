import { useState } from "react";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { AssignmentRecord } from "@/features/assignment/types";
import type { Operator } from "@/features/operators/types";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import { getRentalApprovalStatus } from "@/features/rental/approval/rentalApproval";
import { useAuth } from "@/features/auth/AuthContext";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { canUseCanonicalRemoteRentalCommercialTermsMutation } from "@/features/rental/services/rentalRuntimeCapability";
import RemoteCommercialTermsPage from "@/features/rental/remote/RemoteCommercialTermsPage";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";

interface Props {
  rental: RentalRecord;
  lines: RentalEquipmentLine[];
  equipment: EquipmentRecord[];
  assignments: AssignmentRecord[];
  operators: Operator[];
  contracts: RentalContractRecord[];
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
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const { hasPermission } = useAuth();
  const dependencies = useApplicationDependenciesCompatibility();
  const canPrepare = rental.status === "Draft" && hasPermission("rental.commercialTerms.update")
    && canUseCanonicalRemoteRentalCommercialTermsMutation(dependencies.configuration)
    && Boolean(dependencies.commandRepositories.canonicalRental);
  const approval = getRentalApprovalStatus(rental);
  const activeLines = lines.filter((line) => !["Returned", "Cancelled", "Closed"].includes(line.canonicalLineStatus ?? line.status));
  const allPrepared = activeLines.length > 0 && activeLines.every((line) => equipmentPreparationBlockers(rental, line, contracts.some((contract) => contract.rentalEquipmentLineId === line.id)).length === 0);

  return <section className="rounded-xl border bg-white p-5 shadow-sm" aria-label="Added Equipment Status">
    <button type="button" className="rounded border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700" onClick={() => setOpen((value) => !value)} aria-expanded={open}>View Added Equipment Status</button>
    {open && <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-600">Approval request: {approval}. Preparation and approval apply to the whole Rental; equipment status is shown per line.</p>
      {lines.length === 0 ? <p className="rounded border bg-slate-50 p-4 text-sm">No equipment has been added to this Rental.</p> : <div className="grid gap-3 md:grid-cols-2">{lines.map((line) => {
        const machine = equipment.find((item) => item.id === line.equipmentId);
        const assignment = assignments.find((item) => item.id === line.assignmentId);
        const operator = operators.find((item) => item.id === (line.operatorId || assignment?.operatorId));
        const blockers = equipmentPreparationBlockers(rental, line, contracts.some((contract) => contract.rentalEquipmentLineId === line.id));
        const status = line.canonicalLineStatus ?? line.status;
        const historical = ["Returned", "Cancelled", "Closed"].includes(status);
        return <article key={line.id} className="rounded-lg border p-4 text-sm">
          <h3 className="font-semibold">{machine ? `${machine.assetNo} — ${machine.equipmentName}` : line.equipmentId}</h3>
          <p className="break-all text-xs text-slate-500">Equipment ID: {line.equipmentId}</p>
          <p>Rental dates: {line.effectiveStartDate ?? rental.dateOut} → {rental.expectedReturn ?? "Open-ended"}</p>
          <p>Assignment: {assignment ? `${assignment.status} (${assignment.assignedDate} → ${assignment.expectedReturn ?? "Open-ended"})` : line.assignmentId ? `Linked ${line.assignmentId}` : "Not linked"}</p>
          <p>Availability: {historical ? "Historical — no active commitment inferred" : `Committed to this Rental (${status})`}</p>
          <p>Operator: {operator?.name ?? (line.operatorId || "Not assigned")}</p>
          <p>Preparation: {historical ? "Historical / read-only" : blockers.length === 0 ? "Complete" : "Incomplete"}</p>
          <p>Approval request: {approval}</p>
          {blockers.length > 0 && <ul className="mt-2 list-disc pl-5 text-amber-800">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          {approval === "Rejected" && rental.approvalDecisionRemarks && <p className="mt-2 text-amber-800">Rejection: {rental.approvalDecisionRemarks}</p>}
          {!historical && !line.assignmentId && rental.rentalType === "Operated Rental" && <p className="mt-2 text-amber-800">Operator assignment requires a certified canonical command for this existing line.</p>}
        </article>;
      })}</div>}
      {canPrepare && lines.length > 0 && <div><button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setPreparing((value) => !value)} aria-expanded={preparing}>{preparing ? "Hide inline preparation" : "Complete preparation inline"}</button>{preparing && <div className="mt-4"><RemoteCommercialTermsPage rentalId={rental.id} embedded /></div>}</div>}
      {rental.status === "Draft" && <div className="rounded border bg-slate-50 p-3"><p className="mb-2 text-sm">{allPrepared ? "Preparation appears complete. Canonical approval validation remains authoritative." : "Complete all equipment preparation before requesting approval."}</p><RentalQuickActions rental={rental} onlyApprovalSubmission /></div>}
    </div>}
  </section>;
}
