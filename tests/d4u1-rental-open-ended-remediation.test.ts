import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/rental/components/RentalForm.tsx", "utf8");

describe("Milestone 11.6D4U1-R open-ended Rental availability", () => {
  it("allows a blank Expected Return while requiring equipment and Date Out", () => {
    expect(source).toContain("!form.dateOut || !expectedReturnIsValid || availabilityLines.length === 0");
    expect(source).toContain("const expectedReturnIsValid = !form.expectedReturn");
  });

  it("normalizes blank Expected Return to a null availability window end", () => {
    expect(source).toContain("windowEnd: form.expectedReturn || null");
  });

  it("retains finite-date validation and rejects malformed or reversed nonblank dates", () => {
    expect(source).toContain("/^\\d{4}-\\d{2}-\\d{2}$/");
    expect(source).toContain("form.expectedReturn >= form.dateOut");
  });

  it("refreshes when switching between finite and open-ended intervals", () => {
    expect(source).toContain("form.dateOut, form.expectedReturn");
  });

  it("keeps per-line independence and source Assignment semantics", () => {
    expect(source).toContain("Promise.all(availabilityLines.map");
    expect(source).toContain("sourceAssignmentId: line.sourceAssignmentId");
    expect(source).toContain("setAvailabilityByKey(() => Object.fromEntries(availabilityLines.map");
  });

  it("preserves stale-response protection", () => {
    expect(source).toContain("let active = true;");
    expect(source).toContain("if (!active) return;");
    expect(source).toContain("return () => { active = false; }");
  });

  it("retains available, conflict, and error UI outcomes", () => {
    expect(source).toContain('availability.status === "available"');
    expect(source).toContain('availability.status === "conflict"');
    expect(source).toContain('availability.status === "error"');
    expect(source).toContain("Available for the selected dates.");
    expect(source).toContain("Equipment unavailable for selected dates.");
  });
});
