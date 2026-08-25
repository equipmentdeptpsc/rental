import { describe, expect, it } from "vitest";
import { resolveRentalWorkspaceDeurPolicy } from "@/features/rental/services/resolveRentalWorkspaceDeurPolicy";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";

const policy = { frequency: "PER_WORKDAY" as const, effectiveFrom: "2026-08-24", timezone: "Asia/Manila", capturedAt: "2026-08-25T03:26:28.071Z" };
const rental = { id: "rental-1", status: "Draft" } as RentalRecord;
const line = { id: "line-1", operationalMetadata: { draftPreparation: { deurPolicy: policy } } } as RentalEquipmentLine;

describe("Rental workspace DEUR policy display", () => {
  it("shows consistent canonical Draft preparation without activating the policy", () => {
    expect(resolveRentalWorkspaceDeurPolicy(rental, [line])).toEqual({ policy, staged: true });
    expect(rental.deurExpectationPolicy).toBeUndefined();
  });

  it("does not invent a staged policy for incomplete or inconsistent line preparation", () => {
    expect(resolveRentalWorkspaceDeurPolicy(rental, [{ ...line, operationalMetadata: {} }])).toEqual({ staged: false });
    expect(resolveRentalWorkspaceDeurPolicy(rental, [line, { ...line, id: "line-2", operationalMetadata: { draftPreparation: { deurPolicy: { ...policy, frequency: "ON_DEMAND" } } } }])).toEqual({ staged: false });
  });

  it("prefers the persisted active policy after reservation", () => {
    expect(resolveRentalWorkspaceDeurPolicy({ ...rental, status: "Reserved", deurExpectationPolicy: policy }, [line])).toEqual({ policy, staged: false });
  });
});
