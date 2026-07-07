import type {
  RentalOverviewModel,
} from "../types";

import ContractSummaryCard from "../cards/ContractSummaryCard";

import EquipmentAssignmentCard from "../cards/EquipmentAssignmentCard";

import OperatorAssignmentCard from "../cards/OperatorAssignmentCard";

import TodayOperationsCard from "../cards/TodayOperationsCard";

interface ContractSectionProps {
  overview: RentalOverviewModel;
}

export default function ContractSection({
  overview,
}: ContractSectionProps) {
  return (
    <div className="space-y-6">

      <ContractSummaryCard
        contract={overview.contract}
      />

      <div className="grid gap-6 xl:grid-cols-2">

        <EquipmentAssignmentCard
          equipment={overview.equipment}
        />

        <OperatorAssignmentCard
          operator={overview.operator}
        />

      </div>

      <TodayOperationsCard
        today={overview.today}
      />

    </div>
  );
}