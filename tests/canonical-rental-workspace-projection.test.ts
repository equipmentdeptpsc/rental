import { describe, expect, it } from "vitest";

import { evaluateRentalReleaseReadiness } from "@/features/rental/services/evaluateRentalReleaseReadiness";
import { resolveRentalWorkspaceDeurPolicy } from "@/features/rental/services/resolveRentalWorkspaceDeurPolicy";
import { projectCanonicalRentalWorkspace } from "@/features/rental/workspace/projectCanonicalRentalWorkspace";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { CanonicalCommercialSnapshot } from "@/features/rental/remote/contracts";
import type { RentalRecord } from "@/features/rental/types";
import { mapRental, mapRentalEquipmentLine } from "@/integrations/supabase/readRepositories";

const policy = { frequency: "PER_WORKDAY" as const, effectiveFrom: "2026-08-24", expectedShiftCodes: [], timezone: "Asia/Manila", capturedAt: "2026-08-25T11:40:14.803Z" };
const frozen = {
  rentalEquipmentLineId: "line-1", rentalId: "rental-1", equipmentId: "equipment-1", assignmentId: "assignment-1", operatorId: "operator-1", projectId: "project-1", customerId: "customer-1",
  policy, shiftWindows: [], workDescription: { id: "work-1", code: "WORK-1", name: "Rental work", requiresRemarks: false }, workDateRule: "RENTAL_DATE_OUT" as const, workDate: "2026-08-24",
  meterRequirement: "none" as const, fuelEvidenceRequired: false, billingMethod: "Per Hour" as const,
  operationalMetadata: { costCode: { code: "COST", name: "Cost" }, activityCode: { code: "ACT", name: "Activity" } }, sourceFingerprint: "fingerprint", capturedAt: "2026-08-25T11:40:14.803Z",
};
const snapshot: CanonicalCommercialSnapshot = { id: "snapshot-1", rentalId: "rental-1", rentalEquipmentLineId: "line-1", sourceContractId: "contract-1", billingMethod: "Per Hour", currency: "PHP", unitRate: 1000, operatorIncluded: true, capturedAt: "2026-08-25T11:40:14.803Z" };

describe("canonical Reserved Rental workspace projection", () => {
  it("composes the persisted Rental DEUR policy without changing the canonical enum", () => {
    const result = mapRental({ id: "rental-1", status: "Reserved", date_out: "2026-08-24", deur_expectation_frequency: "PER_WORKDAY", deur_expectation_effective_from: "2026-08-24", expected_shift_codes: [], timezone: "Asia/Manila", deur_expectation_captured_at: "2026-08-25T11:40:14.803Z", deur_expectation_frozen_at: "2026-08-25T11:40:14.803Z" });
    expect(result).toMatchObject({ success: true, value: { deurExpectationPolicy: policy, deurExpectationPolicyFrozenAt: "2026-08-25T11:40:14.803Z" } });
  });

  it("promotes the canonical frozen line snapshot from operational metadata", () => {
    const result = mapRentalEquipmentLine({ id: "line-1", rental_id: "rental-1", equipment_id: "equipment-1", assignment_id: "assignment-1", operator_id: "operator-1", status: "Reserved", operational_metadata: { costCode: frozen.operationalMetadata.costCode, activityCode: frozen.operationalMetadata.activityCode, deurExpectationSnapshot: frozen } });
    expect(result).toMatchObject({ success: true, value: { equipmentId: "equipment-1", assignmentId: "assignment-1", operatorId: "operator-1", deurExpectationSnapshot: { policy: { frequency: "PER_WORKDAY" } } } });
  });

  it("joins the immutable commercial snapshot by line ID and preserves true absence", () => {
    const rental = { id: "rental-1", status: "Reserved", commercialSnapshotRequired: true } as RentalRecord;
    const line = { id: "line-1", rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", status: "Reserved", createdAt: policy.capturedAt, updatedAt: policy.capturedAt, deurExpectationSnapshot: frozen } as RentalEquipmentLine;
    const projected = projectCanonicalRentalWorkspace(rental, [line], [snapshot]);
    expect(projected.lines[0].commercialSnapshot).toMatchObject({ unitRate: 1000, currency: "PHP" });
    expect(projected.rental.commercialSnapshot).toMatchObject({ unitRate: 1000 });
    expect(projectCanonicalRentalWorkspace(rental, [line], []).lines[0].commercialSnapshot).toBeUndefined();
  });

  it("classifies a canonical Reserved policy as explicit and makes the hydrated evidence available to readiness", () => {
    const rental = { id: "rental-1", status: "Reserved", dateOut: "2026-08-24", projectId: "project-1", customerId: "customer-1", commercialSnapshotRequired: true, deurExpectationPolicyRequired: true } as RentalRecord;
    const line = { id: "line-1", rentalId: "rental-1", equipmentId: "equipment-1", assignmentId: "assignment-1", operatorId: "operator-1", status: "Reserved", createdAt: policy.capturedAt, updatedAt: policy.capturedAt, operationalMetadata: frozen.operationalMetadata, deurExpectationSnapshot: frozen } as RentalEquipmentLine;
    const projected = projectCanonicalRentalWorkspace(rental, [line], [snapshot]);
    expect(resolveRentalWorkspaceDeurPolicy(projected.rental, projected.lines)).toEqual({ policy, staged: false });
    expect(projected.lines[0]).toMatchObject({ commercialSnapshot: { unitRate: 1000 }, deurExpectationSnapshot: { sourceFingerprint: "fingerprint" } });
    expect(evaluateRentalReleaseReadiness).toBeTypeOf("function");
  });
});
