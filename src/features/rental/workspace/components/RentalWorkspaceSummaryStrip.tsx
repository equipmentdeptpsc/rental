import KpiCard from "@/components/ui/KpiCard";
import { useRentalWorkspaceAggregate } from "..";
import RentalDeurComplianceIndicator from "@/features/rental/deur/compliance/RentalDeurComplianceIndicator";
import { evaluateRentalDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import { deurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";

export default function RentalWorkspaceSummaryStrip() {
  const aggregate = useRentalWorkspaceAggregate();
  const compliance = evaluateRentalDeurCompliance({
    rental: aggregate.rental,
    assignment: aggregate.assignment,
    deurs: aggregate.deurs,
    evaluationTimestamp: new Date().toISOString(),
    liveShiftWindows: deurShiftWindowRepository.getAll(),
  });
  const lineCount = aggregate.rentalEquipmentLines.length;
  const equipmentLabel =
    lineCount > 1
      ? `${lineCount} equipment lines`
      : aggregate.equipment?.assetNo ?? "Equipment unavailable";

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Equipment" value={equipmentLabel} caption={aggregate.equipment?.equipmentName} tone="blue" />
      <KpiCard label="Operator" value={aggregate.operator?.name ?? "Not assigned"} caption="Assigned operator" tone="purple" />
      <KpiCard label="Date Out" value={aggregate.rental.dateOut} caption={`Return ${aggregate.rental.expectedReturn ?? "TBD"}`} tone="slate" />
      <KpiCard
        label="DEUR Compliance"
        value={<RentalDeurComplianceIndicator result={compliance} />}
        caption={compliance.reason}
        tone={compliance.status === "COMPLIANT" ? "green" : "orange"}
      />
    </div>
  );
}
