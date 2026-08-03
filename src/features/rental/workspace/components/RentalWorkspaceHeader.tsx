import {
  useRentalWorkspaceAggregate,
} from "..";
import { aggregateRentalEquipmentLineDeurCompliance, evaluateRentalDeurCompliance, evaluateRentalEquipmentLineDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import RentalDeurComplianceIndicator from "@/features/rental/deur/compliance/RentalDeurComplianceIndicator";
import RentalDeurComplianceSummary from "@/features/rental/deur/compliance/RentalDeurComplianceSummary";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import RentalDeurExpectationPolicyCard from "@/features/rental/deur/compliance/RentalDeurExpectationPolicyCard";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";
import DeurReleaseReadinessPanel from "@/features/rental/components/DeurReleaseReadinessPanel";
import ApprovalInvalidationNotice from "@/features/rental/approval/ApprovalInvalidationNotice";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { resolveRentalLinePresentation } from "@/features/rental/deur/presentation/resolveDeurPresentation";
import { useAuth } from "@/features/auth/AuthContext";
import { Link } from "react-router-dom";
import { resolveRentalWorkflowStatus } from "@/features/rental/workflow/resolveRentalWorkflowStatus";
import type { WorkspaceTab } from "../types";

export default function RentalWorkspaceHeader({ activeTab }: { activeTab: WorkspaceTab }) {
  const aggregate =
    useRentalWorkspaceAggregate();
  const {equipment}=useEquipment();
  const {hasPermission}=useAuth();
  const compliance = evaluateRentalDeurCompliance({ rental: aggregate.rental, assignment: aggregate.assignment, deurs: aggregate.deurs, evaluationTimestamp: new Date().toISOString(), liveShiftWindows: deurShiftWindowRepository.getAll() });
  const lineCompliance = evaluateRentalEquipmentLineDeurCompliance({ rental: aggregate.rental, lines: aggregate.rentalEquipmentLines, deurs: aggregate.deurs, evaluationTimestamp: new Date().toISOString(), liveShiftWindows: deurShiftWindowRepository.getAll() });
  const displayedCompliance = aggregate.rentalEquipmentLines.length > 1 ? aggregateRentalEquipmentLineDeurCompliance(aggregate.rental.id, lineCompliance) : compliance;
  const effectiveDeurs = aggregate.rentalEquipmentLines.map((line) => [...aggregate.deurs]
    .filter((record) => (record.rentalEquipmentLineId ? record.rentalEquipmentLineId === line.id : record.equipmentId === line.equipmentId) && !record.revision?.supersededByRevisionId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]).filter((record): record is NonNullable<typeof record> => Boolean(record));
  const commercialTermsAvailable = aggregate.rentalEquipmentLines.length > 0 && aggregate.rentalEquipmentLines.every((line) => Boolean(line.commercialSnapshot));
  const billableEvidence = effectiveDeurs.length === aggregate.rentalEquipmentLines.length && effectiveDeurs.every((record) => Boolean(record.totals?.operationMinutes || record.totalOperatingMinutes));
  const workflow=resolveRentalWorkflowStatus({rental:aggregate.rental,effectiveDeurs,commercialTermsAvailable,billableEvidence});

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">

      <div className="flex items-center justify-between">

        <div>

          <h2 className="text-2xl font-semibold">
            {aggregate.rental.customer}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {aggregate.rental.project}
          </p>

        </div>

        <div className="text-right">

          <div className="text-sm text-slate-500">
            Status
          </div>

          <div className="font-semibold">
            {aggregate.rental.status}
          </div>

          <div className="mt-2"><RentalDeurComplianceIndicator result={displayedCompliance} /></div>

        </div>

      </div>

      <div className="mt-6 grid grid-cols-2 gap-6 lg:grid-cols-4">

        <Info
          label="Equipment"
          value={
            aggregate.equipment?.equipmentName ??
            "-"
          }
        />

        <Info
          label="Operator"
          value={
            aggregate.operator?.name ??
            "-"
          }
        />

        <Info
          label="Date Out"
          value={
            aggregate.rental.dateOut
          }
        />

        <Info
          label="Expected Return"
          value={
            aggregate.rental.expectedReturn ?? "Not specified"
          }
        />

      </div>

      <RentalDeurComplianceSummary result={displayedCompliance} policy={aggregate.rental.deurExpectationPolicy} />
      {aggregate.rentalEquipmentLines.length > 1 && <div className="mt-4 space-y-2"><h3 className="text-sm font-semibold">Equipment Line DEUR Compliance</h3>{lineCompliance.map((item) => {const line=aggregate.rentalEquipmentLines.find(candidate=>candidate.id===item.rentalEquipmentLineId);const label=line?resolveRentalLinePresentation(line,aggregate.rentalEquipmentLines,equipment).label:"Equipment record unavailable";return <p key={item.rentalEquipmentLineId} className={`rounded border p-2 text-sm ${item.result.status === "COMPLIANT" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>{label}: {item.result.reason}</p>})}</div>}
      {aggregate.rental.status!=="Closed"&&<RentalDeurExpectationPolicyCard rental={aggregate.rental} />}
      {["Draft","Assigned","Reserved"].includes(aggregate.rental.status)&&<DeurReleaseReadinessPanel rentalId={aggregate.rental.id} />}
      {aggregate.rental.status!=="Closed"&&<div className="mt-4 border-t pt-4"><RentalQuickActions rental={aggregate.rental} hideClose={activeTab==="closing"} /></div>}
      {aggregate.rental.status!=="Closed"&&hasPermission("rental.manage")&&<Link className="mt-3 inline-block rounded border border-blue-600 px-3 py-2 text-sm text-blue-700" to={`/rentals/${aggregate.rental.id}/customer-contact`}>Edit Customer Contact</Link>}
      <ApprovalInvalidationNotice rental={aggregate.rental} />
      <p className="mt-3 rounded bg-slate-50 p-3 text-sm"><b>{workflow.label}</b> — {workflow.explanation} Next: {workflow.recommendedNextAction}.</p>

    </div>
  );
}

interface InfoProps {
  label: string;
  value: string;
}

function Info({
  label,
  value,
}: InfoProps) {
  return (
    <div>

      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="mt-1 font-medium">
        {value}
      </div>

    </div>
  );
}
