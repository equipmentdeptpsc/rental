import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { CanonicalCommercialSnapshot } from "@/features/rental/remote/contracts";
import type { RentalCommercialSnapshot, RentalRecord } from "@/features/rental/types";

export function projectCanonicalRentalWorkspace(
  rental: RentalRecord,
  lines: RentalEquipmentLine[],
  commercialSnapshots: CanonicalCommercialSnapshot[],
): { rental: RentalRecord; lines: RentalEquipmentLine[] } {
  const snapshotsByLine = new Map(commercialSnapshots.map((snapshot) => [snapshot.rentalEquipmentLineId, snapshot]));
  const projectedLines = lines.map((line) => {
    const snapshot = snapshotsByLine.get(line.id);
    return snapshot ? { ...line, commercialSnapshot: snapshot as RentalCommercialSnapshot } : line;
  });
  const soleLine = projectedLines.length === 1 ? projectedLines[0] : undefined;
  return {
    rental: {
      ...rental,
      ...(!rental.deurExpectationPolicy && soleLine?.deurExpectationSnapshot?.policy
        ? { deurExpectationPolicy: soleLine.deurExpectationSnapshot.policy }
        : {}),
      ...(!rental.commercialSnapshot && soleLine?.commercialSnapshot
        ? { commercialSnapshot: soleLine.commercialSnapshot }
        : {}),
    },
    lines: projectedLines,
  };
}
