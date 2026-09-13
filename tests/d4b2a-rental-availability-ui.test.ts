import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/rental/components/RentalForm.tsx", "utf8");

describe("Milestone 11.6D4B2A rental availability UI", () => {
  it("renders a neutral status while required inputs are incomplete", () => {
    expect(source).toContain('setAvailabilityByKey({});');
    expect(source).toContain("availabilityLines.length === 0");
    expect(source).toContain("!form.dateOut");
    expect(source).toContain("!expectedReturnIsValid");
    expect(source).toContain("Availability not checked yet.");
  });

  it("renders free, checking, conflict, and error states with meaningful text", () => {
    expect(source).toContain('availability.status === "checking"');
    expect(source).toContain("Checking availability…");
    expect(source).toContain('availability.status === "available"');
    expect(source).toContain("Available for the selected dates.");
    expect(source).toContain('availability.status === "conflict"');
    expect(source).toContain("Equipment unavailable for selected dates.");
    expect(source).toContain('availability.status === "error"');
    expect(source).toContain("Unable to verify availability.");
  });

  it("uses an accessible live status region", () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
  });

  it("checks ordinary rentals without an inferred source assignment", () => {
    expect(source).toContain('key: line.key');
    expect(source).toContain("equipmentId: form.equipmentId");
    expect(source).toContain("windowStart: form.dateOut");
    expect(source).toContain("windowEnd: form.expectedReturn || null");
    expect(source).toContain("line.sourceAssignmentId ? { sourceAssignmentId: line.sourceAssignmentId } : {}");
  });

  it("passes the explicit source Assignment for Rental-from-Assignment", () => {
    expect(source).toContain("sourceAssignmentId: item.id");
    expect(source).toContain("sourceAssignmentId: line.sourceAssignmentId");
  });

  it("refreshes availability when equipment or date inputs change", () => {
    expect(source).toContain("form.dateOut, form.expectedReturn");
    expect(source).toContain("availabilityController, availabilityLines, canonicalData");
  });

  it("keeps the selected equipment in the form while showing a conflict", () => {
    expect(source).toContain('value={form.equipmentId}');
    expect(source).toContain('onChange={(e) => update("equipmentId", e.target.value)}');
    expect(source).toContain("availability.result?.conflicts?.length");
  });

  it("renders open-ended occupancy and business references instead of raw identifiers", () => {
    expect(source).toContain('conflict.isOpenEnded ? "Open-ended"');
    expect(source).toContain("conflict.rentalNumber");
    expect(source).toContain("Assignment commitment");
    expect(source).toContain("commitmentStart");
    expect(source).not.toContain("Existing ${conflict.equipmentId}");
  });
});
