import type { OperationalCodeSnapshot, RentalOperationalMetadataSnapshot, RentalRecord } from "../types";
import type { IRentalRepository } from "./IRentalRepository";

import { storage } from "@/core/storage";
import { rentalData } from "../data/rental.mock";
import { normalizeRentalCommercialSnapshot } from "../services/createRentalCommercialSnapshot";
import { normalizeRentalDeurExpectationPolicy } from "../deur/expectation/normalizeRentalDeurExpectationPolicy";
import { normalizeDeurShiftWindow } from "../deur/shift-window/normalizeDeurShiftWindow";

const STORAGE_KEY = "equipment-rental-records";
const clone = <T>(value: T): T => structuredClone(value);

function normalizeCodeSnapshot(value: unknown): OperationalCodeSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const code = typeof candidate.code === "string" ? candidate.code.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  if (!code || !name) return undefined;
  return {
    ...(typeof candidate.id === "string" && candidate.id.trim() ? { id: candidate.id.trim() } : {}),
    code,
    name,
  };
}

function normalizeMetadata(value: unknown): RentalOperationalMetadataSnapshot | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  const costCode = normalizeCodeSnapshot(candidate.costCode);
  const activityCode = normalizeCodeSnapshot(candidate.activityCode);
  return { ...(costCode ? { costCode } : {}), ...(activityCode ? { activityCode } : {}) };
}

function normalizeRental(record: RentalRecord): RentalRecord {
  const policy = normalizeRentalDeurExpectationPolicy(record.deurExpectationPolicy);
  const snapshots = Array.isArray(record.deurShiftWindowSnapshots) ? record.deurShiftWindowSnapshots.flatMap((item) => {
    const result = normalizeDeurShiftWindow(item);
    return result.valid && result.value.capturedAt ? [{ ...result.value, capturedAt: result.value.capturedAt }] : [];
  }) : undefined;
  return {
    ...clone(record), operationalMetadata: normalizeMetadata(record.operationalMetadata),
    commercialSnapshot: normalizeRentalCommercialSnapshot(record.commercialSnapshot), commercialSnapshotRequired: record.commercialSnapshotRequired === true ? true : undefined,
    deurExpectationPolicy: policy.valid ? policy.value : undefined,
    deurExpectationPolicyRequired: record.deurExpectationPolicyRequired === true ? true : undefined,
    deurExpectationPolicyFrozenAt: typeof record.deurExpectationPolicyFrozenAt === "string" && Number.isFinite(Date.parse(record.deurExpectationPolicyFrozenAt)) ? new Date(record.deurExpectationPolicyFrozenAt).toISOString() : undefined,
    deurShiftWindowSnapshots: snapshots?.length ? snapshots : undefined,
  };
}

export class LocalRentalRepository implements IRentalRepository {
  private data: RentalRecord[];

  constructor() {
    this.data = (storage.get<RentalRecord[]>(STORAGE_KEY) ?? rentalData).map(normalizeRental);
  }

  getAll(): RentalRecord[] { return clone(this.data); }

  getById(id: string) {
    const found = this.data.find((record) => record.id === id);
    return found ? clone(found) : undefined;
  }

  create(item: RentalRecord) {
    this.data.push(normalizeRental(item));
    this.save();
  }

  update(item: RentalRecord) {
    const index = this.data.findIndex((record) => record.id === item.id);
    if (index < 0) return;
    const existingMetadata = this.data[index].operationalMetadata;
    const persisted = (storage.get<RentalRecord[]>(STORAGE_KEY) ?? []).find((record) => record.id === item.id);
    const existingCommercialSnapshot = normalizeRentalCommercialSnapshot(persisted?.commercialSnapshot) ?? this.data[index].commercialSnapshot;
    const persistedPolicy = normalizeRentalDeurExpectationPolicy(persisted?.deurExpectationPolicy);
    const persistedPolicyFrozenAt = typeof persisted?.deurExpectationPolicyFrozenAt === "string" && Number.isFinite(Date.parse(persisted.deurExpectationPolicyFrozenAt)) ? new Date(persisted.deurExpectationPolicyFrozenAt).toISOString() : undefined;
    const existingPolicy = persistedPolicyFrozenAt && persistedPolicy.valid ? persistedPolicy.value : this.data[index].deurExpectationPolicy;
    const existingPolicyFrozenAt = persistedPolicyFrozenAt ?? this.data[index].deurExpectationPolicyFrozenAt;
    const persistedSnapshots = normalizeRental(persisted ?? this.data[index]).deurShiftWindowSnapshots ?? this.data[index].deurShiftWindowSnapshots;
    const normalized = normalizeRental(item);
    normalized.operationalMetadata = clone(existingMetadata);
    normalized.commercialSnapshot = clone(existingCommercialSnapshot ?? normalized.commercialSnapshot);
    if (existingPolicyFrozenAt) {
      normalized.deurExpectationPolicy = clone(existingPolicy);
      normalized.deurExpectationPolicyFrozenAt = existingPolicyFrozenAt;
      normalized.deurExpectationPolicyRequired = persisted?.deurExpectationPolicyRequired === true || this.data[index].deurExpectationPolicyRequired === true ? true : undefined;
      normalized.deurShiftWindowSnapshots = clone(persistedSnapshots);
    }
    this.data[index] = normalized;
    this.save();
  }

  delete(id: string) {
    this.data = this.data.filter((record) => record.id !== id);
    this.save();
  }

  private save() { storage.set(STORAGE_KEY, clone(this.data)); }
}
