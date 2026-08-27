import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { CanonicalCommercialSnapshot } from "@/features/rental/remote/contracts";
import type { RentalCommercialSnapshot, RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { normalizeRentalCommercialSnapshot } from "@/features/rental/services/createRentalCommercialSnapshot";

export function projectCanonicalRentalWorkspace(
  rental: RentalRecord,
  lines: RentalEquipmentLine[],
  commercialSnapshots: CanonicalCommercialSnapshot[],
): { rental: RentalRecord; lines: RentalEquipmentLine[] } {
  const snapshotsByLine = new Map(commercialSnapshots.flatMap((snapshot) => {
    const normalized=normalizeRentalCommercialSnapshot(snapshot);
    return normalized ? [[snapshot.rentalEquipmentLineId,normalized] as const] : [];
  }));
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

export function projectCanonicalDeurCommercialSnapshots(deurs:DeurRecord[],commercialSnapshots:CanonicalCommercialSnapshot[]):DeurRecord[]{
  const snapshotsById=new Map(commercialSnapshots.flatMap(snapshot=>{const normalized=normalizeRentalCommercialSnapshot(snapshot);return normalized?[[snapshot.id,normalized] as const]:[]}));
  const snapshotsByLine=new Map(commercialSnapshots.flatMap(snapshot=>{const normalized=normalizeRentalCommercialSnapshot(snapshot);return normalized?[[snapshot.rentalEquipmentLineId,normalized] as const]:[]}));
  return deurs.map(deur=>{
    const snapshotId=(deur as DeurRecord&{commercialSnapshotId?:string}).commercialSnapshotId;
    const snapshot=(snapshotId?snapshotsById.get(snapshotId):undefined)??(deur.rentalEquipmentLineId?snapshotsByLine.get(deur.rentalEquipmentLineId):undefined);
    return snapshot?{...deur,commercialSnapshot:structuredClone(snapshot)}:deur;
  });
}
