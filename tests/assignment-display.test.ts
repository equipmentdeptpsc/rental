import { describe, expect, it } from "vitest";
import { displayAssignmentExpectedReturn } from "@/features/assignment/utils/assignmentDisplay";

describe("assignment legacy Expected Return display", () => {
  it("shows a stored value or a readable fallback", () => {
    expect(displayAssignmentExpectedReturn("2026-07-20")).toBe("2026-07-20");
    expect(displayAssignmentExpectedReturn("")).toBe("Not specified");
  });
});
