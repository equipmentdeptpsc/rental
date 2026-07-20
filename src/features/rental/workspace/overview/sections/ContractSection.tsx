import ContractSummaryCard from "../cards/ContractSummaryCard";
import RentalKPICards from "../cards/RentalKPICards";

import type { RentalRecord } from "@/features/rental/types";
import RentalOperationalMetadataCard from "@/features/rental/components/RentalOperationalMetadataCard";
import CommercialSnapshotCard from "@/features/rental/components/CommercialSnapshotCard";

interface Props {
  rental: RentalRecord;
  equipmentLabel: string;
}

export default function ContractSection({
  rental,
  equipmentLabel,
}: Props) {
  return (
    <div className="space-y-6">

      <RentalKPICards
        rental={rental}
        equipmentLabel={equipmentLabel}
      />

      <ContractSummaryCard
        rental={rental}
      />

      <RentalOperationalMetadataCard metadata={rental.operationalMetadata} />
      <CommercialSnapshotCard snapshot={rental.commercialSnapshot} required={rental.commercialSnapshotRequired} scope="Rental" />

    </div>
  );
}
