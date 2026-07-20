import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { LocalRentalRepository } from "@/features/rental/repository/LocalRentalRepository";
import { freezeRentalDeurExpectationPolicy } from "@/features/rental/deur/expectation/freezeRentalDeurExpectationPolicy";
import type { RentalRecord } from "@/features/rental/types";
import { createApplicationBackup, restoreApplicationBackup, validateApplicationBackup } from "@/features/settings/services/applicationBackupService";

const KEY = "equipment-rental-records";
const rental = (overrides: Partial<RentalRecord> = {}): RentalRecord => ({ id: "r", equipmentId: "e", customer: "C", project: "P", rentedBy: "", dateOut: "2026-07-20", statusId: "", status: "Reserved", deurExpectationPolicyRequired: true, deurExpectationPolicy: { frequency: "PER_WORKDAY", effectiveFrom: "2026-07-20", timezone: "Asia/Manila", capturedAt: "2026-07-19T00:00:00.000Z" }, ...overrides });

describe("Rental DEUR expectation persistence", () => {
  beforeEach(() => storage.remove(KEY));
  it("deeply detaches and preserves a frozen policy against replacement and stale removal", () => {
    const frozen = freezeRentalDeurExpectationPolicy(rental(), "2026-07-20T01:00:00.000Z"); expect(frozen.success).toBe(true);
    const repository = new LocalRentalRepository(); if (!frozen.success) return;
    repository.create({ ...frozen.rental, status: "Released", releasedAt: "2026-07-20T01:00:00.000Z" });
    const read = repository.getById("r")!; read.deurExpectationPolicy!.effectiveFrom = "2030-01-01";
    repository.update({ ...rental({ status: "Released", deurExpectationPolicy: undefined }), deurExpectationPolicyFrozenAt: undefined });
    expect(repository.getById("r")?.deurExpectationPolicy).toMatchObject({ effectiveFrom: "2026-07-20", capturedAt: "2026-07-20T01:00:00.000Z" });
    expect(repository.getById("r")?.deurExpectationPolicyFrozenAt).toBe("2026-07-20T01:00:00.000Z");
  });
  it("allows Draft edits and safely omits malformed optional legacy policy without backfill", () => {
    const repository = new LocalRentalRepository(); repository.create(rental({ status: "Draft" }));
    repository.update(rental({ status: "Draft", deurExpectationPolicy: { frequency: "ON_DEMAND", effectiveFrom: "2026-07-20", capturedAt: "2026-07-19T00:00:00Z" } }));
    expect(repository.getById("r")?.deurExpectationPolicy?.frequency).toBe("ON_DEMAND");
    storage.set(KEY, [rental({ deurExpectationPolicy: { frequency: "PER_SHIFT", effectiveFrom: "bad", capturedAt: "bad" } })]);
    expect(new LocalRentalRepository().getById("r")?.deurExpectationPolicy).toBeUndefined();
  });
  it("requires marked new rentals to have a valid policy at release while legacy rentals remain compatible", () => {
    expect(freezeRentalDeurExpectationPolicy(rental({ deurExpectationPolicy: undefined }), "2026-07-20T00:00:00Z")).toMatchObject({ success: false });
    expect(freezeRentalDeurExpectationPolicy(rental({ deurExpectationPolicy: undefined, deurExpectationPolicyRequired: undefined }), "2026-07-20T00:00:00Z")).toMatchObject({ success: true, rental: { deurExpectationPolicy: undefined } });
  });
  it("round-trips the policy through the existing generic backup and restore boundary", () => {
    storage.set(KEY, [rental()]); const backup = createApplicationBackup(new Date("2026-07-20T00:00:00Z"));
    storage.remove(KEY); restoreApplicationBackup(validateApplicationBackup(backup));
    expect(storage.get<RentalRecord[]>(KEY)?.[0].deurExpectationPolicy).toEqual(rental().deurExpectationPolicy);
  });
  it("preserves a policy frozen by a newer cross-tab storage snapshot during a stale update", () => {
    storage.set(KEY, [rental()]); const staleRepository = new LocalRentalRepository();
    const frozen = freezeRentalDeurExpectationPolicy(rental(), "2026-07-20T02:00:00Z"); if (!frozen.success) throw new Error("freeze failed");
    storage.set(KEY, [{ ...frozen.rental, status: "Released", releasedAt: "2026-07-20T02:00:00Z" }]);
    staleRepository.update(rental({ deurExpectationPolicy: undefined }));
    expect(new LocalRentalRepository().getById("r")?.deurExpectationPolicyFrozenAt).toBe("2026-07-20T02:00:00.000Z");
    expect(new LocalRentalRepository().getById("r")?.deurExpectationPolicy?.frequency).toBe("PER_WORKDAY");
  });
});
