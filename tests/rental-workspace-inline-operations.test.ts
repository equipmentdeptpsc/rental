import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availabilityLabel, equipmentStartError, initialEquipmentStartDate } from "@/features/rental/workspace/overview/sections/equipmentPlanning";
import { equipmentPreparationBlockers } from "@/features/rental/workspace/overview/sections/AddedEquipmentStatusPanel";
import { validateCommercialPreparationDraft } from "@/features/rental/remote/commercialPreparationValidation";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";
import type { CommercialPreparationDraft } from "@/features/rental/remote/commercialPreparationValidation";

const rental = { id: "r-1", dateOut: "2026-10-08", expectedReturn: "2026-10-20", rentalType: "Operated Rental", status: "Draft" } as RentalRecord;
const line = { id: "line-1", rentalId: "r-1", equipmentId: "e-1", operatorId: "", status: "Draft" } as RentalEquipmentLine;
const completeDraft: CommercialPreparationDraft = {
  billingMethod: "Per Hour", currency: "PHP", unitRate: "100", idleRate: "0", standbyRate: "0",
  discountType: "NONE", discountValue: "0", transactionRelationship: "Non-Affiliate", vatApplicability: "Applicable",
  taxRate: "12", operatorIncluded: true, costCodeId: "cost-1", activityCodeId: "activity-1",
  workDescriptionId: "work-1", remarks: "",
};

describe("Rental Workspace inline equipment planning", () => {
  it("defaults an active schedule to the current local business date rather than a stale start", () => {
    expect(initialEquipmentStartDate(rental, "2026-10-10")).toBe("2026-10-10");
    expect(initialEquipmentStartDate(rental, "2026-10-01")).toBe("2026-10-08");
    expect(initialEquipmentStartDate(rental, "2026-10-25")).toBe("2026-10-20");
    expect(initialEquipmentStartDate({ dateOut: "2026-10-08" }, "2026-11-01")).toBe("2026-11-01");
  });

  it("validates editable effective dates against the parent schedule", () => {
    expect(equipmentStartError(rental, "2026-10-07")).toMatch(/precede/);
    expect(equipmentStartError(rental, "2026-10-21")).toMatch(/follow/);
    expect(equipmentStartError(rental, "2026-10-10")).toBeUndefined();
  });

  it("distinguishes canonical assignment, rental, and restriction conflicts", () => {
    expect(availabilityLabel({ status: "conflict", result: { equipmentId: "e-1", available: false, conflictCount: 1, conflicts: [{ equipmentId: "e-1", sourceType: "ASSIGNMENT" }] } })).toBe("Assigned");
    expect(availabilityLabel({ status: "conflict", result: { equipmentId: "e-1", available: false, conflictCount: 1, conflicts: [{ equipmentId: "e-1", sourceType: "RENTAL" }] } })).toMatch(/Reserved/);
    expect(availabilityLabel({ status: "error", message: "offline" })).toBe("Availability unknown");
  });

  it("checks every line separately and excludes historical returned lines from current blockers", () => {
    const missing = equipmentPreparationBlockers(rental, line, false);
    expect(missing).toEqual(expect.arrayContaining(["Operator not assigned", "Commercial terms incomplete", "Cost code missing", "Activity code missing", "Work description missing"]));
    expect(equipmentPreparationBlockers(rental, { ...line, id: "line-2", status: "Returned" }, false)).toEqual([]);
    expect(equipmentPreparationBlockers({ ...rental, rentalType: "Bare Rental" }, { ...line, operatorId: "" }, true)).not.toContain("Operator not assigned");
  });

  it("keeps preparation validation line-specific, including discounts and VAT", () => {
    expect(validateCommercialPreparationDraft(completeDraft)).toEqual({});
    expect(validateCommercialPreparationDraft({ ...completeDraft, costCodeId: "", discountType: "PERCENTAGE", discountValue: "120", taxRate: "0" })).toMatchObject({ costCodeId: expect.any(String), discountValue: expect.any(String), taxRate: expect.any(String) });
  });

  it("rehydrates saved per-line preparation rather than resetting to equipment defaults", () => {
    const page = readFileSync("src/features/rental/remote/RemoteCommercialTermsPage.tsx", "utf8");
    expect(page).toContain("line.operationalMetadata?.draftPreparation?.costCodeId");
    expect(page).toContain("line.operationalMetadata?.draftPreparation?.activityCodeId");
    expect(page).toContain("line.operationalMetadata?.draftPreparation?.workDescriptionId");
    expect(page).toContain("drafts[line.id] ??");
  });

  it("keeps approval submission on the existing permission-checked command", () => {
    const actions = readFileSync("src/features/rental/components/RentalQuickActions.tsx", "utf8");
    const statusPanel = readFileSync("src/features/rental/workspace/overview/sections/AddedEquipmentStatusPanel.tsx", "utf8");
    expect(actions).toContain('permissions.submit ? [{ id: "submit"');
    expect(actions).toContain("repository.submitApproval(input)");
    expect(statusPanel).toContain("onlyApprovalSubmission");
    expect(statusPanel).not.toContain("decideApproval(");
  });
});
