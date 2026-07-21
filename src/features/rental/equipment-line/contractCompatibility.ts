import type { RentalContractRecord } from "../types/RentalContract";
import type { RentalEquipmentLine, RentalEquipmentLineMigrationIssue } from "./types";

export function associateLegacyContractsWithRentalEquipmentLines(
  contracts: RentalContractRecord[],
  lines: RentalEquipmentLine[],
): { contracts: RentalContractRecord[]; issues: RentalEquipmentLineMigrationIssue[]; changed: boolean } {
  const issues: RentalEquipmentLineMigrationIssue[] = [];
  let changed = false;
  const associated = contracts.map((contract) => {
    if (contract.rentalId && contract.rentalEquipmentLineId) return structuredClone(contract);
    const rentalId = contract.rentalId ?? contract.id;
    const matches = lines.filter((line) => line.rentalId === rentalId && line.equipmentId === contract.equipmentId);
    if (matches.length === 0) {
      issues.push({ code: "LEGACY_CONTRACT_LINE_NOT_FOUND", rentalId, equipmentId: contract.equipmentId, message: "Legacy contract could not be associated with a Rental Equipment Line." });
      return structuredClone(contract);
    }
    if (matches.length > 1) {
      issues.push({ code: "AMBIGUOUS_LEGACY_CONTRACT_LINES", rentalId, equipmentId: contract.equipmentId, lineIds: matches.map((line) => line.id), message: "Legacy contract matches multiple Rental Equipment Lines and was not associated." });
      return structuredClone(contract);
    }
    changed = true;
    return { ...structuredClone(contract), rentalId, rentalEquipmentLineId: matches[0].id };
  });
  return { contracts: associated, issues, changed };
}
