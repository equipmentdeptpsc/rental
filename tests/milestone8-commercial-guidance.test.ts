import { describe, expect, it } from "vitest";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import { getCommercialConfigurationProgress, getNextUnconfiguredLine, isCommerciallyConfigured } from "@/features/rental/commercial/commercialConfigurationProgress";
import { resolveCommercialSummary } from "@/features/rental/commercial/resolveCommercialSummary";

const line = (id: string, frozen = false): RentalEquipmentLine => ({ id, rentalId: "rental-1", equipmentId: `equipment-${id}`, operatorId: `operator-${id}`, status: "Reserved", commercialSnapshotRequired: true, ...(frozen ? { commercialSnapshot: { billingMethod: "Per Day", unitRate: 500, operatorIncluded: true, currency: "PHP", capturedAt: "2026-08-21T00:00:00Z" } } : {}), createdAt: "", updatedAt: "" });
const contract = (lineId: string): RentalContractRecord => ({ id: `contract-${lineId}`, rentalId: "rental-1", rentalEquipmentLineId: lineId, contractNo: "R-1", customerId: "customer", equipmentId: `equipment-${lineId}`, projectId: "project", rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP", unitRate: 2500, minimumBillableHours: 8, overtimeRate: 500, standbyRate: 300, mobilizationFee: 10000, demobilizationFee: 10000, fuelCharge: 2000, operatorIncluded: false, operatorRate: 600, taxRate: 12, withholdingTax: 2, startDate: "2026-08-21", expectedEndDate: "2026-08-22", status: "Active", createdAt: "", updatedAt: "" });

describe("Milestone 8 commercial configuration guidance", () => {
  it("derives configured state and progress only from contracts or immutable line snapshots", () => {
    const lines = [line("a"), line("b", true), line("c")], contracts = [contract("a")];
    expect(isCommerciallyConfigured(lines[0], contracts)).toBe(true);
    expect(isCommerciallyConfigured(lines[1], contracts)).toBe(true);
    expect(getCommercialConfigurationProgress(lines, contracts)).toMatchObject({ configuredCount: 2, totalCount: 3, allConfigured: false, configuredLineIds: ["a", "b"] });
  });

  it("selects the next unconfigured line in canonical line order and wraps deterministically", () => {
    const lines = [line("a"), line("b"), line("c")], contracts = [contract("a")];
    expect(getNextUnconfiguredLine(lines, contracts, "a")?.id).toBe("b");
    expect(getNextUnconfiguredLine(lines, [contract("a"), contract("b")], "c")?.id).toBe("c");
    expect(getNextUnconfiguredLine(lines, [contract("a"), contract("b"), contract("c")])).toBeUndefined();
  });

  it("builds the saved summary from persisted terms and omits absent fields", () => {
    const rows = resolveCommercialSummary(contract("a"));
    expect(rows.map((row) => row.key)).toEqual(["unitRate", "standbyRate", "overtimeRate", "minimumBillableHours", "operatorRate", "fuelCharge", "mobilizationFee", "demobilizationFee"]);
    expect(resolveCommercialSummary({ ...contract("a"), billingMethod: "One Lot", contractAmount: 90000, mobilizationFee: undefined }).map((row) => row.key)).toEqual(expect.arrayContaining(["contractAmount"]));
    expect(resolveCommercialSummary({ ...contract("a"), billingMethod: "One Lot", contractAmount: 90000, mobilizationFee: undefined }).map((row) => row.key)).not.toContain("mobilizationFee");
  });
});
