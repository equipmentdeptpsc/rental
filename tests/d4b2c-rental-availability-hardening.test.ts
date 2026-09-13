import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/rental/components/RentalForm.tsx", "utf8");

describe("Milestone 11.6D4B2C Rental availability hardening", () => {
  it("keeps every availability state visible without relying on color", () => {
    expect(source).toContain('availability.status === "available"');
    expect(source).toContain("Available for the selected dates.");
    expect(source).toContain('availability.status === "conflict"');
    expect(source).toContain("Equipment unavailable for selected dates.");
    expect(source).toContain('availability.status === "checking"');
    expect(source).toContain("Checking availability…");
    expect(source).toContain('availability.status === "error"');
    expect(source).toContain("Unable to verify availability.");
  });

  it("uses polite status semantics and an explicit submit error", () => {
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source).toContain('role="alert"');
    expect(source).toContain("Resolve equipment availability conflicts before saving.");
  });

  it("keeps conflict business references, occupied intervals, and open-ended wording readable", () => {
    expect(source).toContain("conflict.rentalNumber");
    expect(source).toContain("Assignment commitment");
    expect(source).toContain("conflict.commitmentStart");
    expect(source).toContain("conflict.commitmentEnd");
    expect(source).toContain('conflict.isOpenEnded ? "Open-ended"');
    expect(source).toContain("min-w-0 break-words");
  });

  it("gives multi-line statuses unique accessible names and preserves line separation", () => {
    expect(source).toContain("aria-label={`Availability for ${line.label}`}");
    expect(source).toContain("aria-label={`Availability status for ${getAssignmentNumber(item.id, assignments)}`}");
    expect(source).toContain("availabilityLines.map((line)");
    expect(source).toContain("flex flex-wrap items-start");
  });

  it("keeps narrow layouts wrapping controls and status content without forced focus", () => {
    expect(source).toContain("flex-1 break-words");
    expect(source).toContain("max-w-full shrink-0 break-words");
    expect(source).toContain("<Button type=\"submit\"");
    expect(source).not.toContain("focus()");
  });
});
