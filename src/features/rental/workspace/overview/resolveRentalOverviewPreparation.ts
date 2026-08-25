import type { RentalAggregate } from "@/features/rental/aggregate";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { CanonicalReferenceCode } from "@/features/rental/remote/contracts";
import type { RentalOperationalMetadataSnapshot } from "@/features/rental/types";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import type { WorkDescriptionRecord } from "@/features/masters/work-description/types";

interface References {
  costCodes: CanonicalReferenceCode[];
  activityCodes: CanonicalReferenceCode[];
  workDescriptions: WorkDescriptionRecord[];
}

export interface RentalOverviewLinePreparation {
  lineId: string;
  metadata?: RentalOperationalMetadataSnapshot;
  workDescription?: { code?: string; name: string };
  draftPrepared: boolean;
}

export interface RentalOverviewPreparation {
  billingMethod?: string;
  rentalMetadata?: RentalOperationalMetadataSnapshot;
  lines: RentalOverviewLinePreparation[];
  draftCommercialPrepared: boolean;
}

export function resolveRentalOverviewPreparation(
  aggregate: RentalAggregate,
  contracts: RentalContractRecord[],
  references: References,
): RentalOverviewPreparation {
  const lines = aggregate.rentalEquipmentLines.map((line) => resolveLine(line, references));
  const lineContracts = aggregate.rentalEquipmentLines.map((line) => contracts.find((contract) => contract.rentalEquipmentLineId === line.id));
  const billingMethods = [...new Set(lineContracts.flatMap((contract) => contract ? [contract.billingMethod] : []))];
  const draftCommercialPrepared = aggregate.rental.status === "Draft"
    && lines.length > 0
    && lines.every((line) => line.draftPrepared)
    && lineContracts.every(Boolean);
  const commonMetadata = commonLineMetadata(lines);
  const finalizedRentalMetadata = aggregate.rental.operationalMetadata;
  return {
    billingMethod: aggregate.rental.billingMethod ?? (billingMethods.length === 1 ? billingMethods[0] : aggregate.contract?.billingMethod),
    rentalMetadata: finalizedRentalMetadata?.costCode || finalizedRentalMetadata?.activityCode
      ? finalizedRentalMetadata
      : commonMetadata,
    lines,
    draftCommercialPrepared,
  };
}

function resolveLine(line: RentalEquipmentLine, references: References): RentalOverviewLinePreparation {
  if (line.operationalMetadata?.costCode || line.operationalMetadata?.activityCode) {
    return { lineId: line.id, metadata: line.operationalMetadata, workDescription: line.deurExpectationSnapshot?.workDescription, draftPrepared: false };
  }
  const draft = line.operationalMetadata?.draftPreparation;
  if (!draft) return { lineId: line.id, metadata: line.operationalMetadata, draftPrepared: false };
  const cost = references.costCodes.find((item) => item.id === draft.costCodeId);
  const activity = references.activityCodes.find((item) => item.id === draft.activityCodeId);
  const work = references.workDescriptions.find((item) => item.id === draft.workDescriptionId);
  return {
    lineId: line.id,
    metadata: {
      ...(cost ? { costCode: { id: cost.id, code: cost.code, name: cost.name } } : {}),
      ...(activity ? { activityCode: { id: activity.id, code: activity.code, name: activity.name } } : {}),
      draftPreparation: draft,
    },
    ...(work ? { workDescription: { code: work.code, name: work.name } } : {}),
    draftPrepared: Boolean(cost && activity && work),
  };
}

function commonLineMetadata(lines: RentalOverviewLinePreparation[]): RentalOperationalMetadataSnapshot | undefined {
  if (!lines.length || lines.some((line) => !line.metadata)) return undefined;
  const first = lines[0].metadata;
  return lines.every((line) => JSON.stringify(line.metadata?.costCode) === JSON.stringify(first?.costCode)
    && JSON.stringify(line.metadata?.activityCode) === JSON.stringify(first?.activityCode)) ? first : undefined;
}
