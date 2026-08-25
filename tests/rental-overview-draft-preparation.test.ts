import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { buildRentalAggregate } from "@/features/rental/aggregate";
import CommercialSnapshotCard from "@/features/rental/components/CommercialSnapshotCard";
import RentalOperationalMetadataCard from "@/features/rental/components/RentalOperationalMetadataCard";
import ContractSummaryCard from "@/features/rental/workspace/overview/cards/ContractSummaryCard";
import { resolveRentalOverviewPreparation } from "@/features/rental/workspace/overview/resolveRentalOverviewPreparation";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import type { RentalRecord } from "@/features/rental/types";
import type { RentalContractRecord } from "@/features/rental/types/RentalContract";
import { mapCanonicalRow } from "@/integrations/supabase/SupabaseReadRepository";

const mappedRental = mapCanonicalRow<RentalRecord>({ id: "0ac5c327-2d47-46e9-b94f-2b77deb27427", status: "Draft", operational_metadata: {} });
if (!mappedRental.success) throw new Error("Rental fixture mapping failed");
const rental = mappedRental.value;
const mappedLine = mapCanonicalRow<RentalEquipmentLine>({
  id: "52ea3624-e8f1-44aa-a89d-02caadf2fe51", rental_id: rental.id, status: "Draft",
  operational_metadata: { draftPreparation: {
    lineId: "52ea3624-e8f1-44aa-a89d-02caadf2fe51",
    costCodeId: "f881947b-9848-438d-a1e1-6a1ae06bc5e8",
    activityCodeId: "dc9d8f40-d595-4315-b418-7a67820075fe",
    workDescriptionId: "6f0ba567-1c2a-42c4-a5be-6c7d9dbd7005",
    operationalRemarks: "Test UAT",
    meterRequirement: "none",
  } },
});
if (!mappedLine.success) throw new Error("Rental line fixture mapping failed");
const line = mappedLine.value;
const contract = { id: "contract-1", rentalId: rental.id, rentalEquipmentLineId: line.id, billingMethod: "Per Hour", status: "Draft" } as RentalContractRecord;
const references = {
  costCodes: [{ id: "f881947b-9848-438d-a1e1-6a1ae06bc5e8", code: "UAT-CC-001", name: "UAT Equipment Cost Code", active: true, sortOrder: 0 }],
  activityCodes: [{ id: "dc9d8f40-d595-4315-b418-7a67820075fe", code: "UAT-ACT-001", name: "UAT Equipment Rental Activity", active: true, sortOrder: 1 }],
  workDescriptions: [{ id: "6f0ba567-1c2a-42c4-a5be-6c7d9dbd7005", code: "UAT-WD-001", name: "UAT Equipment Rental Work", active: true }],
};

function aggregate(targetRental = rental, targetLine = line) {
  return buildRentalAggregate({ rental: targetRental, rentalEquipmentLines: [targetLine] });
}

describe("Rental Overview canonical Draft preparation", () => {
  it("projects staged codes, Work Description, and Draft contract without mutating source state", () => {
    const source = aggregate(), before = structuredClone(source);
    const result = resolveRentalOverviewPreparation(source, [contract], references);
    expect(result).toMatchObject({
      billingMethod: "Per Hour", draftCommercialPrepared: true,
      rentalMetadata: { costCode: { code: "UAT-CC-001", name: "UAT Equipment Cost Code" }, activityCode: { code: "UAT-ACT-001", name: "UAT Equipment Rental Activity" } },
      lines: [{ lineId: "52ea3624-e8f1-44aa-a89d-02caadf2fe51", draftPrepared: true, workDescription: { code: "UAT-WD-001", name: "UAT Equipment Rental Work" } }],
    });
    expect(source).toEqual(before);
    expect(source.rental.commercialSnapshot).toBeUndefined();
    expect(source.rental.billingMethod).toBeUndefined();
    expect(source.rental.operationalMetadata).toEqual({});
  });

  it("fails safely for genuinely missing preparation", () => {
    expect(resolveRentalOverviewPreparation(aggregate(rental, { ...line, operationalMetadata: undefined }), [], references)).toMatchObject({ billingMethod: undefined, rentalMetadata: undefined, draftCommercialPrepared: false, lines: [{ draftPrepared: false }] });
  });

  it("retains the legacy warning when neither staged terms nor a snapshot exists", async () => {
    const container = document.createElement("div"), root = createRoot(container);
    await act(async () => root.render(createElement(CommercialSnapshotCard, { scope: "Rental" })));
    expect(container.textContent).toContain("Commercial snapshot not captured for this legacy record");
    await act(async () => root.unmount());
  });

  it("preserves finalized metadata and billing presentation", () => {
    const finalized = { costCode: { code: "FINAL-CC", name: "Final Cost" }, activityCode: { code: "FINAL-ACT", name: "Final Activity" } };
    const result = resolveRentalOverviewPreparation(aggregate({ ...rental, status: "Reserved", billingMethod: "Per Day" }, { ...line, status: "Reserved", operationalMetadata: finalized }), [contract], references);
    expect(result).toMatchObject({ billingMethod: "Per Day", rentalMetadata: finalized, draftCommercialPrepared: false, lines: [{ metadata: finalized, draftPrepared: false }] });
  });

  it("renders lifecycle-aware Draft messaging and staged metadata without a legacy warning", async () => {
    const resolved = resolveRentalOverviewPreparation(aggregate(), [contract], references);
    const container = document.createElement("div"), root = createRoot(container);
    await act(async () => root.render(createElement("div", null,
      createElement(CommercialSnapshotCard, { scope: "Rental", draftPrepared: resolved.draftCommercialPrepared }),
      createElement(ContractSummaryCard, { rental, billingMethod: resolved.billingMethod }),
      createElement(RentalOperationalMetadataCard, { metadata: resolved.lines[0].metadata, workDescription: resolved.lines[0].workDescription }),
    )));
    expect(container.textContent).toContain("Commercial terms prepared in Draft. Immutable commercial snapshot will be created at reservation.");
    expect(container.textContent).not.toContain("legacy record");
    expect(container.textContent).toContain("Billing MethodPer Hour");
    expect(container.textContent).toContain("UAT-CC-001");
    expect(container.textContent).toContain("UAT-ACT-001");
    expect(container.textContent).toContain("UAT-WD-001");
    await act(async () => root.unmount());
  });
});
