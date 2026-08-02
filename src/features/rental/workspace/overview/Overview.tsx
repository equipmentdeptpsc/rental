import {
  useRentalWorkspaceAggregate,
} from "..";

import {
  useRentalOverview,
} from "./hooks/useRentalOverview";

import ContractSection from "./sections/ContractSection";
import EquipmentSection from "./sections/EquipmentSection";
import OperatorSection from "./sections/OperatorSection";
import TodayOperationsSection from "./sections/TodayOperationsSection";
import FinancialSection from "./sections/FinancialSection";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useRental } from "@/features/rental/context/RentalContext";
import CommercialSnapshotCard from "@/features/rental/components/CommercialSnapshotCard";
import RentalOperationalMetadataCard from "@/features/rental/components/RentalOperationalMetadataCard";

export default function Overview() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const overview =
    useRentalOverview(
      aggregate
    );
  const { equipment } = useEquipment();
  const { operators } = useOperator();
  const { contracts } = useRental();
  const lines = aggregate.rentalEquipmentLines;
  const allTermsComplete = lines.length > 0 && lines.every((line) => line.commercialSnapshot || contracts.some((contract) => contract.rentalEquipmentLineId === line.id));

  return (
    <div className="space-y-6">

      <ContractSection
        rental={aggregate.rental}
        hasCommercialTerms={allTermsComplete}
        showRentalSnapshots={lines.length <= 1}
        equipmentLabel={
          lines.length > 1 ? `${lines.length} equipment lines` : overview.equipment.assetNo === "-"
            ? "Unknown equipment"
            : `${overview.equipment.assetNo} - ${overview.equipment.equipmentName}`
        }
      />
      {lines.map((line) => (
        <div key={`commercial-${line.id}`}>
          <p className="mb-2 text-sm font-medium">
            {equipment.find((item) => item.id === line.equipmentId)?.assetNo ?? "Equipment line"}
          </p>
          <CommercialSnapshotCard snapshot={line.commercialSnapshot} required={line.commercialSnapshotRequired} scope="Rental" />
          <div className="mt-3"><RentalOperationalMetadataCard metadata={line.operationalMetadata} title="Operational Metadata for Equipment Line" /></div>
        </div>
      ))}

      {lines.length === 1 ? <EquipmentSection equipment={overview.equipment} /> : <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Equipment Lines ({lines.length})</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{lines.map((line) => { const machine = equipment.find((item) => item.id === line.equipmentId); const operator = operators.find((item) => item.id === line.operatorId); const complete = Boolean(line.commercialSnapshot || contracts.some((contract) => contract.rentalEquipmentLineId === line.id)); return <article key={line.id} className="rounded-lg border p-4"><p className="font-semibold">{machine ? `${machine.assetNo} - ${machine.equipmentName}` : line.equipmentId}</p><p className="text-sm text-slate-600">Operator: {operator?.name ?? line.operatorId}</p><p className="text-xs text-slate-500">Assignment: {line.assignmentId ?? "None"}</p><p className="text-xs text-slate-500">Line status: {line.status}</p><p className={`mt-2 text-sm ${complete ? "text-green-700" : "text-amber-700"}`}>Commercial terms: {complete ? "Complete" : "Incomplete"}</p></article>; })}</div></section>}

      {lines.length === 1 && <OperatorSection operator={overview.operator} />}

      <TodayOperationsSection
        today={overview.today}
      />

      <FinancialSection
        financial={overview.financial}
      />

    </div>
  );
}
