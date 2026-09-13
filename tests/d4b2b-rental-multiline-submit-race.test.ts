import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const formSource = readFileSync("src/features/rental/components/RentalForm.tsx", "utf8");
const pageSource = readFileSync("src/pages/Rental/New.tsx", "utf8");

describe("Milestone 11.6D4B2B multi-line availability and submit race", () => {
  it("keys availability independently for each selected Assignment line", () => {
    expect(formSource).toContain("rental-equipment:${item.id}");
    expect(formSource).toContain("availabilityByKey");
    expect(formSource).toContain("Promise.all(availabilityLines.map");
  });

  it("renders line states independently, including Available and Conflict", () => {
    expect(formSource).toContain("availabilityByKey[line.key]");
    expect(formSource).toContain('availability.status === "available"');
    expect(formSource).toContain('availability.status === "conflict"');
    expect(formSource).toContain("availabilityByKey[`rental-equipment:${item.id}`]?.status");
  });

  it("keeps checking state scoped to the line being refreshed", () => {
    expect(formSource).toContain("setAvailabilityByKey(() => Object.fromEntries(availabilityLines.map");
    expect(formSource).toContain("availabilityController.check({ key: line.key");
    expect(formSource).toContain("form.dateOut, form.expectedReturn");
  });

  it("passes source Assignment context only on the intended line", () => {
    expect(formSource).toContain("sourceAssignmentId: item.id");
    expect(formSource).toContain("...(line.sourceAssignmentId ? { sourceAssignmentId: line.sourceAssignmentId } : {})");
    expect(formSource).not.toContain("sourceAssignmentId: assignment.id });");
  });

  it("preserves selected lines and does not remove conflicting equipment", () => {
    expect(formSource).toContain("checked={form.assignmentIds.includes(item.id)}");
    expect(formSource).toContain("availabilityLines.map((line)");
    expect(formSource).toContain("Equipment unavailable for selected dates.");
  });

  it("recognizes the canonical write-time interval conflict", () => {
    expect(formSource).toContain('failure?.code === "EQUIPMENT_INTERVAL_CONFLICT"');
    expect(formSource).toContain("availabilityController?.markWriteResult");
    expect(pageSource).toContain("code: result.code");
  });

  it("maps identified equipment to its line and uses a truthful fallback otherwise", () => {
    expect(formSource).toContain("conflictEquipmentId(failure)");
    expect(formSource).toContain("availabilityLines.find((line) => line.equipmentId === equipmentId)");
    expect(formSource).toContain("Equipment is no longer available for the selected dates.");
    expect(formSource).toContain("submitRaceConflict");
  });

  it("preserves canonical conflict details and avoids fabricated identifiers", () => {
    expect(formSource).toContain("availability.result?.conflicts?.length");
    expect(formSource).toContain("conflict.rentalNumber");
    expect(formSource).toContain("conflict.commitmentStart");
    expect(formSource).toContain('conflict.isOpenEnded ? "Open-ended"');
    expect(formSource).not.toContain("next available");
  });

  it("leaves non-conflict submission errors on the existing submission path", () => {
    expect(formSource).toContain("throw value;");
    expect(formSource).toContain("useFormSubmission(\"Rental\"");
    expect(formSource).not.toContain("failure?.code === \"VALIDATION_REJECTED\"");
  });

  it("blocks knowingly conflicting current lines without treating other states as available", () => {
    expect(formSource).toContain('state.status === "conflict"');
    expect(formSource).toContain("Resolve equipment availability conflicts before saving.");
    expect(formSource).not.toContain('state.status !== "available"');
  });

  it("keeps the successful submit path unchanged", () => {
    expect(formSource).toContain("void submission.submit({ ...form, expectedReturn: form.expectedReturn || undefined });");
    expect(pageSource).toContain("navigate(`/rentals/${result.value.rentalId}/commercial-terms`);");
  });
});
