import ContractSummaryCard from "../cards/ContractSummaryCard";
import RentalKPICards from "../cards/RentalKPICards";

import type { RentalRecord } from "@/features/rental/types";
import RentalOperationalMetadataCard from "@/features/rental/components/RentalOperationalMetadataCard";
import CommercialSnapshotCard from "@/features/rental/components/CommercialSnapshotCard";
import { Link } from "react-router-dom";
import { canEditRentalCommercialTerms } from "@/features/rental/services/configureRentalCommercialTerms";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { canUseLegacyRentalMutations } from "@/features/rental/services/rentalRuntimeCapability";

interface Props {
  rental: RentalRecord;
  equipmentLabel: string;
  hasCommercialTerms: boolean;
  showRentalSnapshots?: boolean;
}

export default function ContractSection({
  rental,
  equipmentLabel,
  hasCommercialTerms,
  showRentalSnapshots = true,
}: Props) {
  const { configuration } = useApplicationDependenciesCompatibility();
  const mutationsAvailable = canUseLegacyRentalMutations(configuration);
  return (
    <div className="space-y-6">

      <RentalKPICards
        rental={rental}
        equipmentLabel={equipmentLabel}
      />

      <ContractSummaryCard
        rental={rental}
      />

      {mutationsAvailable && canEditRentalCommercialTerms(rental) && <section className={`rounded-xl border p-5 ${hasCommercialTerms ? "bg-white" : "border-amber-300 bg-amber-50"}`}>
        <h3 className="font-semibold">{hasCommercialTerms ? "Commercial Terms Configured" : "Commercial Terms Required"}</h3>
        <p className="mt-1 text-sm text-slate-600">{hasCommercialTerms ? "Terms may be edited until the Rental is released." : "Configure valid commercial terms before releasing this Rental."}</p>
        <Link className="mt-3 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white" to={`/rentals/${rental.id}/commercial-terms`}>{hasCommercialTerms ? "Edit Commercial Terms" : "Configure Commercial Terms"}</Link>
      </section>}

      {showRentalSnapshots && <RentalOperationalMetadataCard metadata={rental.operationalMetadata} />}
      {showRentalSnapshots && <CommercialSnapshotCard snapshot={rental.commercialSnapshot} required={rental.commercialSnapshotRequired} scope="Rental" />}

    </div>
  );
}
