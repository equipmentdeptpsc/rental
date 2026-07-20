import { beforeEach, describe, expect, it } from "vitest";

import { storage } from "@/core/storage";
import { LocalRentalRepository } from "@/features/rental/repository/LocalRentalRepository";
import type { RentalRecord } from "@/features/rental/types";

const STORAGE_KEY = "equipment-rental-records";
const rental = (metadata?: RentalRecord["operationalMetadata"]): RentalRecord => ({
  id: "rental", rentalNumber: "R-1", equipmentId: "equipment", assignmentId: "assignment",
  customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-07-20",
  statusId: "", status: "Draft", operationalMetadata: metadata,
});
const metadata = {
  costCode: { id: "cost", code: "5031HEAVYEQPT", name: "Heavy Equipment" },
  activityCode: { id: "activity", code: "LDC", name: "LAUCHANCO DEVELOPMENT CORPORATION" },
};

describe("Local Rental operational metadata persistence", () => {
  beforeEach(() => storage.remove(STORAGE_KEY));

  it("persists both snapshots and deeply detaches reads", () => {
    const repository = new LocalRentalRepository();
    repository.create(rental(metadata));
    const found = repository.getById("rental")!;
    expect(found.operationalMetadata).toEqual(metadata);
    found.operationalMetadata!.costCode!.name = "Mutated";
    repository.getAll()[0].operationalMetadata!.activityCode!.name = "Mutated";
    expect(repository.getById("rental")?.operationalMetadata).toEqual(metadata);
  });

  it("preserves snapshots during edit and lifecycle-style updates", () => {
    const repository = new LocalRentalRepository();
    repository.create(rental(metadata));
    repository.update({ ...rental(), customer: "Edited", operationalMetadata: { costCode: { code: "CHANGED", name: "Changed" } } });
    expect(repository.getById("rental")).toMatchObject({ customer: "Edited", operationalMetadata: metadata });
    repository.update({ ...repository.getById("rental")!, status: "Reserved" });
    expect(repository.getById("rental")?.operationalMetadata).toEqual(metadata);
  });

  it("loads and reserializes legacy Rentals without fabricating snapshots", () => {
    storage.set(STORAGE_KEY, [rental()]);
    const repository = new LocalRentalRepository();
    expect(repository.getById("rental")?.operationalMetadata).toBeUndefined();
    repository.update({ ...repository.getById("rental")!, customer: "Legacy edited" });
    expect(new LocalRentalRepository().getById("rental")).toMatchObject({ customer: "Legacy edited" });
    expect(new LocalRentalRepository().getById("rental")?.operationalMetadata).toBeUndefined();
  });

  it("trims valid nested values and safely omits malformed snapshot members", () => {
    storage.set(STORAGE_KEY, [rental({ costCode: { code: " COST ", name: " Name " }, activityCode: { code: "", name: "bad" } })]);
    expect(new LocalRentalRepository().getById("rental")?.operationalMetadata).toEqual({
      costCode: { code: "COST", name: "Name" },
    });
  });
});
