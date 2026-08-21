import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalContractRecord } from "../types/RentalContract";

export function isCommerciallyConfigured(line: RentalEquipmentLine, contracts: readonly RentalContractRecord[]): boolean {
  return Boolean(line.commercialSnapshot || contracts.some((contract) => contract.rentalEquipmentLineId === line.id));
}

export function getCommercialConfigurationProgress(lines: readonly RentalEquipmentLine[], contracts: readonly RentalContractRecord[]) {
  const configuredLineIds = lines.filter((line) => isCommerciallyConfigured(line, contracts)).map((line) => line.id);
  return {
    configuredLineIds,
    configuredCount: configuredLineIds.length,
    totalCount: lines.length,
    allConfigured: lines.length > 0 && configuredLineIds.length === lines.length,
  };
}

export function getNextUnconfiguredLine(lines: readonly RentalEquipmentLine[], contracts: readonly RentalContractRecord[], afterLineId?: string) {
  const start = afterLineId ? Math.max(0, lines.findIndex((line) => line.id === afterLineId) + 1) : 0;
  return [...lines.slice(start), ...lines.slice(0, start)].find((line) => !isCommerciallyConfigured(line, contracts));
}
