import {
  useRentalWorkspaceAggregate,
} from "..";
import { evaluateRentalDeurCompliance, evaluateRentalEquipmentLineDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import RentalDeurComplianceIndicator from "@/features/rental/deur/compliance/RentalDeurComplianceIndicator";
import RentalDeurComplianceSummary from "@/features/rental/deur/compliance/RentalDeurComplianceSummary";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import RentalDeurExpectationPolicyCard from "@/features/rental/deur/compliance/RentalDeurExpectationPolicyCard";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";
import ApprovalInvalidationNotice from "@/features/rental/approval/ApprovalInvalidationNotice";

export default function RentalWorkspaceHeader() {
  const aggregate =
    useRentalWorkspaceAggregate();
  const compliance = evaluateRentalDeurCompliance({ rental: aggregate.rental, assignment: aggregate.assignment, deurs: aggregate.deurs, evaluationTimestamp: new Date().toISOString(), liveShiftWindows: deurShiftWindowRepository.getAll() });
  const lineCompliance = evaluateRentalEquipmentLineDeurCompliance({ rental: aggregate.rental, lines: aggregate.rentalEquipmentLines, deurs: aggregate.deurs, evaluationTimestamp: new Date().toISOString(), liveShiftWindows: deurShiftWindowRepository.getAll() });

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

          <div className="mt-2"><RentalDeurComplianceIndicator result={compliance} /></div>

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

      <RentalDeurComplianceSummary result={compliance} policy={aggregate.rental.deurExpectationPolicy} />
      {aggregate.rentalEquipmentLines.length > 1 && <div className="mt-4 space-y-2"><h3 className="text-sm font-semibold">Equipment Line DEUR Compliance</h3>{lineCompliance.map((item) => <p key={item.rentalEquipmentLineId} className={`rounded border p-2 text-sm ${item.result.status === "COMPLIANT" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>{item.equipmentId}: {item.result.reason}</p>)}</div>}
      <RentalDeurExpectationPolicyCard rental={aggregate.rental} />
      <div className="mt-4 border-t pt-4"><RentalQuickActions rental={aggregate.rental} /></div>
      <ApprovalInvalidationNotice rental={aggregate.rental} />

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
