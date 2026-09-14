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
import CommercialSnapshotCard from "@/features/rental/components/CommercialSnapshotCard";
import RentalOperationalMetadataCard from "@/features/rental/components/RentalOperationalMetadataCard";
import { hasDistinctLineCommercialTerms } from "./commercialTermsPresentation";
import { useRentalWorkspacePresentationData } from "..";
import { resolveRentalOverviewPreparation } from "./resolveRentalOverviewPreparation";
import AddEquipmentPanel from "./sections/AddEquipmentPanel";
import RentalLineLifecycleActions from "./sections/RentalLineLifecycleActions";

export default function Overview() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const presentationData = useRentalWorkspacePresentationData();
  const preparation = resolveRentalOverviewPreparation(aggregate, presentationData.contracts, presentationData);
  const overview = useRentalOverview(aggregate, preparation.billingMethod);
  const { equipment, operators } = presentationData;
  const contracts = presentationData.contracts;
  const lines = aggregate.rentalEquipmentLines;
  const allTermsComplete = lines.length > 0 && lines.every((line) => line.commercialSnapshot || contracts.some((contract) => contract.rentalEquipmentLineId === line.id));

  return (
    <div className="space-y-6">

      <ContractSection
        rental={aggregate.rental}
        hasCommercialTerms={allTermsComplete}
        showRentalSnapshots
        billingMethod={preparation.billingMethod}
        operationalMetadata={preparation.rentalMetadata}
        draftCommercialPrepared={preparation.draftCommercialPrepared}
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
          {hasDistinctLineCommercialTerms(line.commercialSnapshot, aggregate.rental.commercialSnapshot) && <CommercialSnapshotCard snapshot={line.commercialSnapshot} required={line.commercialSnapshotRequired} scope="Equipment Line" />}
          <div className="mt-3"><RentalOperationalMetadataCard metadata={preparation.lines.find((item) => item.lineId === line.id)?.metadata} workDescription={preparation.lines.find((item) => item.lineId === line.id)?.workDescription} title="Operational Metadata for Equipment Line" /></div>
        </div>
      ))}

      {lines.length === 1 ? <EquipmentSection equipment={overview.equipment} rental={aggregate.rental} lines={lines} equipmentRecords={equipment} assignments={presentationData.assignments} /> : <><section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Equipment Lines ({lines.length})</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{lines.map((line) => { const machine = equipment.find((item) => item.id === line.equipmentId); const operator = operators.find((item) => item.id === line.operatorId); const complete = Boolean(line.commercialSnapshot || contracts.some((contract) => contract.rentalEquipmentLineId === line.id)); const label = machine ? `${machine.assetNo} - ${machine.equipmentName}` : line.equipmentId; return <article key={line.id} className="rounded-lg border p-4"><p className="font-semibold">{label}</p><p className="text-sm text-slate-600">Operator: {operator?.name ?? line.operatorId}</p><p className="text-xs text-slate-500">Assignment: {line.assignmentId ?? "None"}</p><p className="text-xs text-slate-500">Equipment Line Status: {line.canonicalLineStatus ?? line.status}</p><p className={`mt-2 text-sm ${complete ? "text-green-700" : "text-amber-700"}`}>Commercial terms: {complete ? "Complete" : "Incomplete"}</p><RentalLineLifecycleActions rental={aggregate.rental} line={line} equipmentLabel={label} /></article>; })}</div></section><AddEquipmentPanel rental={aggregate.rental} lines={lines} equipment={equipment} assignments={presentationData.assignments} /></>}

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
