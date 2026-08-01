import type { RentalAggregate } from "@/features/rental/aggregate";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import { buildRentalLineOperations } from "./buildRentalLineOperations";
import { RentalLineOperationCard } from "./RentalLineOperationCard";

export default function RentalLineOperationsGrid({ aggregate, equipment, operators, evaluatedAt }: {
  aggregate: RentalAggregate;
  equipment: EquipmentRecord[];
  operators: Operator[];
  evaluatedAt: string;
}) {
  const { synchronization } = useApplicationDependenciesCompatibility();
  useEffect(() => {
    if (!synchronization.tenantId) return;
    return synchronization.workspace.subscribeRental(
      synchronization.tenantId,
      aggregate.rental.id,
    );
  }, [synchronization, aggregate.rental.id]);
  const states = buildRentalLineOperations({
    lines: aggregate.rentalEquipmentLines,
    deurs: aggregate.deurs,
    evaluatedAt,
  });
  return <section aria-label="Rental equipment line operations" className="space-y-3">
    <h2 className="text-lg font-semibold">Equipment Line Operations</h2>
    <div className="grid gap-4 xl:grid-cols-2">
      {states.map((state) => <RentalLineOperationCard
        key={state.line.id}
        rentalId={aggregate.rental.id}
        state={state}
        machine={equipment.find((item) => item.id === state.line.equipmentId)}
        operator={operators.find((item) => item.id === state.line.operatorId)}
      />)}
    </div>
  </section>;
}
import { useEffect } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
