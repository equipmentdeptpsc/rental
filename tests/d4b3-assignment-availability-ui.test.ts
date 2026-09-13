import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/features/assignment/components/RemoteAssignmentForm.tsx", "utf8");

describe("Milestone 11.6D4B3 Assignment availability UI", () => {
  it("keeps incomplete Assignment inputs neutral and renders all availability states", () => {
    expect(source).toContain('setAvailability({ status: "not_checked" })');
    expect(source).toContain('availability.status === "available"');
    expect(source).toContain("Available for the selected dates.");
    expect(source).toContain('availability.status === "conflict"');
    expect(source).toContain("Equipment unavailable for selected dates.");
    expect(source).toContain('availability.status === "checking"');
    expect(source).toContain("Checking availability…");
    expect(source).toContain('availability.status === "error"');
    expect(source).toContain("Unable to verify availability.");
  });

  it("uses the ordinary availability controller path without source Assignment context", () => {
    expect(source).toContain("availabilityController.check({ key: availabilityKey");
    expect(source).toContain("equipmentId: form.equipmentId");
    expect(source).toContain("windowStart: form.assignedDate");
    expect(source).toContain("windowEnd: form.expectedReturn");
    expect(source).not.toContain("sourceAssignmentId");
    expect(source).not.toContain("check_equipment_availability_for_pending_rental");
  });

  it("refreshes on date changes and preserves the selected equipment on conflict", () => {
    expect(source).toContain("form.assignedDate, form.equipmentId, form.expectedReturn");
    expect(source).toContain('value={form.equipmentId}');
    expect(source).toContain("availability.status === \"conflict\"");
    expect(source).not.toContain('update("equipmentId", "")');
  });

  it("renders canonical conflict detail and truthful open-ended fallback wording", () => {
    expect(source).toContain("conflict.rentalNumber");
    expect(source).toContain("Assignment commitment");
    expect(source).toContain("conflict.commitmentStart");
    expect(source).toContain("conflict.commitmentEnd");
    expect(source).toContain('conflict.isOpenEnded ? "Open-ended"');
    expect(source).toContain("Equipment is no longer available for the selected dates.");
  });

  it("guards known conflicts and maps only the canonical interval-conflict write error", () => {
    expect(source).toContain('availability.status === "conflict"');
    expect(source).toContain("Resolve equipment availability conflicts before saving.");
    expect(source).toContain('result.code === "EQUIPMENT_INTERVAL_CONFLICT"');
    expect(source).toContain("availabilityController?.markWriteResult");
    expect(source).toContain("throw new Error(result.message)");
  });

  it("preserves accessible, wrapping status layout and reachable submit controls", () => {
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source).toContain("min-w-0");
    expect(source).toContain("break-words");
    expect(source).toContain('type="submit"');
    expect(source).not.toContain("focus()");
  });
});
