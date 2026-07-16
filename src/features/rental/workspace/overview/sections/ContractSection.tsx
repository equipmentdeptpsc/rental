import ContractSummaryCard from "../cards/ContractSummaryCard";
import RentalKPICards from "../cards/RentalKPICards";

import type { RentalRecord } from "@/features/rental/types";

interface Props {
  rental: RentalRecord;
}

export default function ContractSection({
  rental,
}: Props) {
  return (
    <div className="space-y-6">

      <RentalKPICards
        rental={rental}
      />

      <ContractSummaryCard
        rental={rental}
      />

    </div>
  );
}