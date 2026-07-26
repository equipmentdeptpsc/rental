import type { RentalContractRecord } from "../types/RentalContract";
import type { RentalEquipmentLine, RentalEquipmentLineMigrationIssue } from "../equipment-line/types";
import { associateLegacyContractsWithRentalEquipmentLines } from "../equipment-line/contractCompatibility";
import { storage } from "@/core/storage";
import { normalizeRentalBillingMethod } from "../types";

const STORAGE_KEY = "equipment-rental-contracts";
const clone = <T>(value: T): T => structuredClone(value);

function read(): RentalContractRecord[] {
  try { const value = storage.get<unknown>(STORAGE_KEY); return Array.isArray(value) ? value.map((item) => normalizeContract(item as RentalContractRecord)) : []; } catch { return []; }
}
function normalizeContract(contract: RentalContractRecord): RentalContractRecord { return { ...clone(contract), billingMethod: normalizeRentalBillingMethod(contract.billingMethod) ?? contract.billingMethod }; }
function save(data: RentalContractRecord[]) { storage.set(STORAGE_KEY, data.map(normalizeContract)); }

export type RentalEquipmentLineContractLookup =
  | { status: "found"; contract: RentalContractRecord }
  | { status: "not-found" }
  | { status: "ambiguous"; contracts: RentalContractRecord[]; issue: RentalEquipmentLineMigrationIssue };

export const rentalContractRepository = {
  getAll() { return clone(read()); },

  ensureLineAssociations(lines: RentalEquipmentLine[]): { contracts: RentalContractRecord[]; issues: RentalEquipmentLineMigrationIssue[] } {
    const result = associateLegacyContractsWithRentalEquipmentLines(read(), lines);
    if (result.changed) save(result.contracts);
    return { contracts: clone(result.contracts), issues: clone(result.issues) };
  },

  getById(id: string) { const found = read().find((contract) => contract.id === id); return found ? clone(found) : undefined; },

  listByRentalId(rentalId: string) {
    return clone(read().filter((contract) => contract.rentalId === rentalId || (!contract.rentalId && contract.id === rentalId)));
  },

  getByRentalEquipmentLineId(lineId: string): RentalEquipmentLineContractLookup {
    const matches = read().filter((contract) => contract.rentalEquipmentLineId === lineId);
    if (matches.length === 0) return { status: "not-found" };
    if (matches.length === 1) return { status: "found", contract: clone(matches[0]) };
    return {
      status: "ambiguous", contracts: clone(matches),
      issue: { code: "AMBIGUOUS_LEGACY_CONTRACT_LINES", lineIds: [lineId], message: "Multiple commercial terms records are associated with the same Rental Equipment Line." },
    };
  },

  saveForRentalEquipmentLine(contract: RentalContractRecord): { success: true; contract: RentalContractRecord } | { success: false; issue: RentalEquipmentLineMigrationIssue } {
    const lineId = contract.rentalEquipmentLineId?.trim();
    const rentalId = contract.rentalId?.trim();
    if (!lineId || !rentalId) return { success: false, issue: { code: "LEGACY_CONTRACT_LINE_NOT_FOUND", rentalId, lineIds: lineId ? [lineId] : undefined, message: "Line-level commercial terms require Rental and Rental Equipment Line identities." } };
    const records = read();
    const matches = records.filter((item) => item.rentalEquipmentLineId === lineId);
    if (matches.length > 1 || (matches.length === 1 && matches[0].id !== contract.id)) {
      return { success: false, issue: { code: "AMBIGUOUS_LEGACY_CONTRACT_LINES", rentalId, equipmentId: contract.equipmentId, lineIds: [lineId], message: "Multiple commercial terms records target this Rental Equipment Line." } };
    }
    const identityCollision = records.find((item) => item.id === contract.id && item.rentalEquipmentLineId !== lineId);
    if (identityCollision) return { success: false, issue: { code: "AMBIGUOUS_LEGACY_CONTRACT_LINES", rentalId, equipmentId: contract.equipmentId, lineIds: [lineId], message: "Commercial terms identity is already used by another Rental Equipment Line." } };
    const normalized = normalizeContract(contract);
    save(matches.length === 1
      ? records.map((item) => item.id === normalized.id ? normalized : item)
      : [...records, normalized]);
    return { success: true, contract: clone(normalized) };
  },

  create(contract: RentalContractRecord) { const records = read(); records.push(normalizeContract(contract)); save(records); },
  update(contract: RentalContractRecord) { const records = read(); const index = records.findIndex((item) => item.id === contract.id); if (index >= 0) { records[index] = normalizeContract(contract); save(records); } },
  delete(id: string) { save(read().filter((contract) => contract.id !== id)); },
};
