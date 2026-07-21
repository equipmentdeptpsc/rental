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

export default function Overview() {
  const aggregate =
    useRentalWorkspaceAggregate();

  const overview =
    useRentalOverview(
      aggregate
    );

  return (
    <div className="space-y-6">

      <ContractSection
        rental={aggregate.rental}
        hasCommercialTerms={Boolean(aggregate.contract)}
        equipmentLabel={
          overview.equipment.assetNo === "-"
            ? "Unknown equipment"
            : `${overview.equipment.assetNo} - ${overview.equipment.equipmentName}`
        }
      />

      <EquipmentSection
        equipment={overview.equipment}
      />

      <OperatorSection
        operator={overview.operator}
      />

      <TodayOperationsSection
        today={overview.today}
      />

      <FinancialSection
        financial={overview.financial}
      />

    </div>
  );
}
