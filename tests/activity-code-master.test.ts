import { beforeEach, describe, expect, it } from "vitest";

import { storage } from "@/core/storage";
import {
  ActivityCodeRepository,
  ACTIVITY_CODE_SEEDS,
} from "@/features/masters/activity-code/repository";
import type { ActivityCodeRecord } from "@/features/masters/activity-code/types";

const STORAGE_KEY = "equipment-rental-activity-codes";
const expected = [
  ["ACT100", "ACCOUNTING DEPARTMENT"],
  ["ADM100", "ADMINISTRATIVE DEPARTMENT"],
  ["AMD_PM", "AMD P&M USAGE"],
  ["CW100", "CENTRAL WAREHOUSE"],
  ["CPMD_P", "CIP-MD CARPENTRY EXPANSION"],
  ["CIPMED", "CIP-MEDELLIN"],
  ["EXE100", "EXECUTIVE DEPARTMENT"],
  ["HRD116", "HRD - EMPLOYEE RELATION"],
  ["HRD102", "HRD - HEALTH SERVICES"],
  ["HRD100", "HUMAN RESOURCE DEPARTMENT"],
  ["LDC", "LAUCHANCO DEVELOPMENT CORPORATION"],
  ["SMD_PM", "SMD P&M USAGE"],
  ["SCM", "SUPPLY CHAIN MANAGEMENT"],
  ["SAF100", "SAFETY & HEALTH COMMITTEE"],
] as const;

const custom = (overrides: Partial<ActivityCodeRecord> = {}): ActivityCodeRecord => ({
  id: "custom-id",
  activityCode: "CUSTOM",
  description: "Custom Activity",
  active: true,
  deleted: false,
  ...overrides,
});

describe("Activity Code master repository", () => {
  beforeEach(() => storage.remove(STORAGE_KEY));

  it("seeds all required codes, exact names, and deterministic order", () => {
    const records = new ActivityCodeRepository().getAll();
    expect(records.slice(0, expected.length).map((record) => [record.activityCode, record.description]))
      .toEqual(expected);
    expect(records.slice(0, expected.length).map((record) => record.sortOrder))
      .toEqual(expected.map((_, index) => (index + 1) * 10));
  });

  it("uses stable IDs and remains idempotent across repeated initialization", () => {
    const repository = new ActivityCodeRepository();
    const first = repository.getAll();
    const second = repository.getAll();
    const reloaded = new ActivityCodeRepository().getAll();

    expect(first).toHaveLength(14);
    expect(second).toHaveLength(14);
    expect(reloaded.map((record) => record.id)).toEqual(first.map((record) => record.id));
    expect(new Set(first.map((record) => record.id)).size).toBe(14);
    expect(ACTIVITY_CODE_SEEDS.map((record) => record.id)).toEqual(first.map((record) => record.id));
  });

  it("preserves custom and legacy records and avoids normalized seed duplicates", () => {
    storage.set(STORAGE_KEY, [
      custom(),
      custom({ id: "legacy-ldc", activityCode: " ldc ", description: "User-edited LDC", active: false }),
    ]);

    const records = new ActivityCodeRepository().getAll();
    expect(records.find((record) => record.id === "custom-id")).toMatchObject({ description: "Custom Activity" });
    expect(records.find((record) => record.id === "legacy-ldc")).toMatchObject({
      activityCode: " ldc ",
      description: "User-edited LDC",
      active: false,
    });
    expect(records.filter((record) => record.activityCode.trim().toUpperCase() === "LDC"))
      .toHaveLength(1);
    expect(records.find((record) => record.id === "custom-id")?.sortOrder).toBeUndefined();
  });

  it("trims writes and rejects normalized duplicate codes on create and update", () => {
    const repository = new ActivityCodeRepository();
    const created = repository.create(custom({
      id: "trimmed",
      activityCode: " custom-new ",
      description: " Custom Name ",
    }));
    expect(created).toMatchObject({ success: true, record: expect.objectContaining({
      activityCode: "custom-new",
      description: "Custom Name",
    }) });

    expect(repository.create(custom({ id: "duplicate", activityCode: " Ldc " }))).toEqual({
      success: false,
      message: "Activity Code already exists.",
    });
    expect(repository.update(custom({ id: "trimmed", activityCode: "lDc" }))).toEqual({
      success: false,
      message: "Activity Code already exists.",
    });
  });

  it("returns active non-deleted records only for selection", () => {
    const repository = new ActivityCodeRepository();
    repository.create(custom({ id: "active", activityCode: "ACTIVE" }));
    repository.create(custom({ id: "inactive", activityCode: "INACTIVE", active: false }));
    repository.create(custom({ id: "deleted", activityCode: "DELETED", deleted: true }));

    const active = repository.getActive();
    expect(active.some((record) => record.id === "active")).toBe(true);
    expect(active.some((record) => record.id === "inactive")).toBe(false);
    expect(active.some((record) => record.id === "deleted")).toBe(false);
  });

  it("serializes code and name and returns detached values", () => {
    const repository = new ActivityCodeRepository();
    const result = repository.create(custom({ id: "detached", activityCode: "SERIAL", description: "Serialized Name" }));
    expect(result.success).toBe(true);
    if (!result.success) return;

    result.record.description = "Mutated result";
    const all = repository.getAll();
    all.find((record) => record.id === "detached")!.description = "Mutated list";

    expect(repository.getById("detached")).toMatchObject({
      activityCode: "SERIAL",
      description: "Serialized Name",
    });
    expect(storage.get<ActivityCodeRecord[]>(STORAGE_KEY)?.find((record) => record.id === "detached"))
      .toMatchObject({ activityCode: "SERIAL", description: "Serialized Name" });
  });
});
