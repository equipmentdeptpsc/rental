import {
  useRentalWorkspaceAggregate,
} from "..";
import { evaluateRentalDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import RentalDeurComplianceIndicator from "@/features/rental/deur/compliance/RentalDeurComplianceIndicator";
import RentalDeurComplianceSummary from "@/features/rental/deur/compliance/RentalDeurComplianceSummary";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import RentalDeurExpectationPolicyCard from "@/features/rental/deur/compliance/RentalDeurExpectationPolicyCard";

export default function RentalWorkspaceHeader() {
  const aggregate =
    useRentalWorkspaceAggregate();
  const compliance = evaluateRentalDeurCompliance({ rental: aggregate.rental, assignment: aggregate.assignment, deurs: aggregate.deurs, evaluationTimestamp: new Date().toISOString(), liveShiftWindows: deurShiftWindowRepository.getAll() });

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
      <RentalDeurExpectationPolicyCard rental={aggregate.rental} />

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
