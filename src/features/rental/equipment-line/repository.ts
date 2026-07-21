import { storage } from "@/core/storage";
import type { RentalRecord } from "../types";
import { normalizeRentalCommercialSnapshot } from "../services/createRentalCommercialSnapshot";
import { materializeRentalEquipmentLineCompatibility, RENTAL_EQUIPMENT_LINE_SCHEMA_VERSION } from "./compatibility";
import type { RentalEquipmentLine, RentalEquipmentLineCompatibilityResult, RentalEquipmentLineMigrationIssue } from "./types";

export const RENTAL_EQUIPMENT_LINE_STORAGE_KEY = "equipment-rental-equipment-lines";
interface RentalEquipmentLineStorageEnvelope { schemaVersion: number; records: RentalEquipmentLine[] }
const clone = <T>(value: T): T => structuredClone(value);

function normalizeLine(line: RentalEquipmentLine): RentalEquipmentLine {
  return {
    ...clone(line),
    assignmentId: line.assignmentId?.trim() || undefined,
    status: line.status ?? "Draft",
    commercialSnapshotRequired: line.commercialSnapshotRequired === true ? true : undefined,
    commercialSnapshot: normalizeRentalCommercialSnapshot(line.commercialSnapshot),
  };
}

function read(): { records: RentalEquipmentLine[]; issues: RentalEquipmentLineMigrationIssue[] } {
  const stored = storage.get<unknown>(RENTAL_EQUIPMENT_LINE_STORAGE_KEY);
  if (stored === undefined || stored === null) return { records: [], issues: [] };
  if (Array.isArray(stored)) return { records: stored.map((line) => normalizeLine(line as RentalEquipmentLine)), issues: [] };
  if (typeof stored !== "object") return { records: [], issues: [{ code: "UNSUPPORTED_RENTAL_EQUIPMENT_LINE_SCHEMA", message: "Rental Equipment Line storage is malformed and was left unchanged." }] };
  const envelope = stored as Partial<RentalEquipmentLineStorageEnvelope>;
  if (envelope.schemaVersion !== RENTAL_EQUIPMENT_LINE_SCHEMA_VERSION || !Array.isArray(envelope.records)) {
    return { records: [], issues: [{ code: "UNSUPPORTED_RENTAL_EQUIPMENT_LINE_SCHEMA", message: `Unsupported Rental Equipment Line schema version '${String(envelope.schemaVersion)}'.` }] };
  }
  return { records: envelope.records.map(normalizeLine), issues: [] };
}

function save(records: RentalEquipmentLine[]) {
  storage.set(RENTAL_EQUIPMENT_LINE_STORAGE_KEY, { schemaVersion: RENTAL_EQUIPMENT_LINE_SCHEMA_VERSION, records: clone(records) } satisfies RentalEquipmentLineStorageEnvelope);
}

class RentalEquipmentLineRepository {
  ensureCompatibility(rentals: RentalRecord[]): RentalEquipmentLineCompatibilityResult {
    const persisted = read();
    if (persisted.issues.length) return { lines: persisted.records, issues: persisted.issues, changed: false };
    const result = materializeRentalEquipmentLineCompatibility(rentals, persisted.records);
    if (result.changed || storage.get(RENTAL_EQUIPMENT_LINE_STORAGE_KEY) === undefined || Array.isArray(storage.get(RENTAL_EQUIPMENT_LINE_STORAGE_KEY))) save(result.lines);
    return { ...result, lines: clone(result.lines), issues: clone(result.issues) };
  }

  getAll(): RentalEquipmentLine[] { return clone(read().records); }
  getByRentalId(rentalId: string): RentalEquipmentLine[] { return this.getAll().filter((line) => line.rentalId === rentalId); }
  getById(id: string): RentalEquipmentLine | undefined { return this.getAll().find((line) => line.id === id); }

  create(line: RentalEquipmentLine) {
    const records = this.getAll();
    if (records.some((item) => item.id === line.id)) return;
    save([...records, normalizeLine(line)]);
  }

  createMany(lines: RentalEquipmentLine[]): { success: true } | { success: false; message: string } {
    const records = this.getAll();
    const ids = new Set(records.map((line) => line.id));
    const equipmentByRental = new Set(records.map((line) => `${line.rentalId}:${line.equipmentId}`));
    for (const line of lines) {
      const key = `${line.rentalId}:${line.equipmentId}`;
      if (ids.has(line.id) || equipmentByRental.has(key)) return { success: false, message: "Duplicate equipment is not allowed within a Rental." };
      ids.add(line.id); equipmentByRental.add(key);
    }
    save([...records, ...lines.map(normalizeLine)]);
    return { success: true };
  }

  remove(id: string): boolean {
    const records = this.getAll();
    if (!records.some((line) => line.id === id)) return false;
    save(records.filter((line) => line.id !== id));
    return true;
  }

  updateRentalStatus(rentalId: string, status: RentalEquipmentLine["status"], timestamp: string) {
    save(this.getAll().map((line) => line.rentalId === rentalId ? { ...line, status, updatedAt: timestamp } : line));
  }

  update(line: RentalEquipmentLine) {
    const records = this.getAll();
    const existing = records.find((item) => item.id === line.id);
    if (!existing) return;
    const normalized = normalizeLine(line);
    normalized.commercialSnapshot = clone(existing.commercialSnapshot ?? normalized.commercialSnapshot);
    save(records.map((item) => item.id === line.id ? normalized : item));
  }

  saveCommercialSnapshotsOnce(rentalId: string, preparedLines: RentalEquipmentLine[]): { success: true; lines: RentalEquipmentLine[] } | { success: false; message: string } {
    const records = this.getAll();
    const persisted = records.filter((line) => line.rentalId === rentalId);
    if (persisted.length !== preparedLines.length || preparedLines.some((line) => line.rentalId !== rentalId || !persisted.some((item) => item.id === line.id))) {
      return { success: false, message: "Rental Equipment Lines changed before commercial snapshots could be captured." };
    }
    const preparedById = new Map(preparedLines.map((line) => [line.id, line]));
    const updated = records.map((existing) => {
      const prepared = preparedById.get(existing.id);
      if (!prepared) return existing;
      return normalizeLine({ ...prepared, commercialSnapshot: existing.commercialSnapshot ?? prepared.commercialSnapshot });
    });
    if (updated.filter((line) => line.rentalId === rentalId).some((line) => line.commercialSnapshotRequired && !line.commercialSnapshot)) {
      return { success: false, message: "Every Rental Equipment Line must have an immutable commercial snapshot before release." };
    }
    save(updated);
    return { success: true, lines: clone(updated.filter((line) => line.rentalId === rentalId)) };
  }
}

export const rentalEquipmentLineRepository = new RentalEquipmentLineRepository();
